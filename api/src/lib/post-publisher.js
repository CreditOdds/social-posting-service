/**
 * Shared post-publishing logic.
 * Used by the scheduler (automated), the publish endpoint (manual), and the
 * queue endpoint (publish_now).
 *
 * Failure model: each platform's outcome is tracked in social_post_results.
 * A retry only attempts platforms without a prior success, so a Facebook
 * failure never causes a duplicate tweet. Failed posts requeue themselves
 * with backoff until MAX_ATTEMPTS, then land on a terminal status:
 * 'posted' (all platforms ok), 'partial' (some ok), or 'failed' (none ok).
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const { notify, preview } = require('./notify');

const twitter = require('./platforms/twitter');
const twitterCardwire = require('./platforms/twitter-cardwire');
const reddit = require('./platforms/reddit');
const facebook = require('./platforms/facebook');
const instagram = require('./platforms/instagram');
const linkedin = require('./platforms/linkedin');

const platformModules = { twitter, twitter_cardwire: twitterCardwire, reddit, facebook, instagram, linkedin };

// Platforms that must be explicitly requested via the post's `platforms` list.
// They are excluded from the default fan-out so general posts don't leak to
// special-purpose accounts like @card_wire, and so reddit — a manual platform
// where every "publish" creates a human todo in the UI — only fires when a
// producer deliberately targets it.
const OPT_IN_ONLY_PLATFORMS = ['twitter_cardwire', 'reddit'];

// Total publish attempts per post (first try + retries).
const MAX_ATTEMPTS = 4;
// Backoff before retry N (1-indexed); the last entry repeats.
const RETRY_BACKOFF_MINUTES = [5, 15, 45];

// Result statuses that count as "done" for a platform.
const SUCCESS_STATUSES = ['success', 'pending_manual'];

/**
 * Rewrite utm_source in a URL to match the target platform.
 * If no utm_source exists, adds one.
 */
function applyPlatformUtm(url, platform) {
  if (!url) return url;
  try {
    const parsed = new URL(url);
    parsed.searchParams.set('utm_source', platform);
    return parsed.toString();
  } catch {
    return url;
  }
}

/**
 * Publish a post to all target platforms that haven't already succeeded.
 *
 * The caller must have claimed the post (status = 'posting') first.
 *
 * @param {object} post - The social_posts row
 * @param {object} mysql - Database connection
 * @returns {Promise<{finalStatus: string, results: Array, willRetry: boolean, nextAttemptAt: Date|null}>}
 */
async function publishPost(post, mysql) {
  // 1. Determine target platforms
  const postPlatforms = post.platforms
    ? (typeof post.platforms === 'string' ? JSON.parse(post.platforms) : post.platforms)
    : null;

  const activeAccounts = await mysql.query(
    'SELECT platform FROM social_accounts WHERE is_active = 1 AND is_connected = 1'
  );
  const activePlatformNames = activeAccounts.map(a => a.platform);

  const targetPlatforms = postPlatforms
    ? postPlatforms.filter(p => activePlatformNames.includes(p))
    : activePlatformNames.filter(p => !OPT_IN_ONLY_PLATFORMS.includes(p));

  if (targetPlatforms.length === 0) {
    await mysql.query(
      "UPDATE social_posts SET status = 'failed', last_error = 'No active platforms' WHERE id = ?",
      [post.id]
    );
    await notify(`:x: Post #${post.id} failed: no active platforms match it. "${preview(post.text_content)}"`);
    return { finalStatus: 'failed', results: [], willRetry: false, nextAttemptAt: null, error: 'No active platforms' };
  }

  // 2. Skip platforms that already succeeded on a previous attempt so a
  // retry can never double-post.
  const priorResults = await mysql.query(
    'SELECT platform, status FROM social_post_results WHERE post_id = ?',
    [post.id]
  );
  const alreadySucceeded = new Set(
    priorResults.filter(r => SUCCESS_STATUSES.includes(r.status)).map(r => r.platform)
  );
  const pendingPlatforms = targetPlatforms.filter(p => !alreadySucceeded.has(p));

  // 3. Download image to /tmp if needed
  let imagePath = null;
  const imageUrl = post.image_url;
  if (imageUrl && pendingPlatforms.length > 0) {
    try {
      imagePath = await downloadImage(imageUrl);
    } catch (err) {
      console.error('Failed to download image:', err.message);
    }
  }

  // 4. Post to each pending platform
  const results = [...alreadySucceeded].map(p => ({ platform: p, status: 'already_posted' }));
  const failures = [];

  for (const platform of pendingPlatforms) {
    const mod = platformModules[platform];
    const platformLinkUrl = applyPlatformUtm(post.link_url, platform);

    try {
      if (!mod) throw new Error(`No module for platform: ${platform}`);

      console.log(`Posting to ${platform}...`);
      const result = await mod.post({
        text: platform.startsWith('twitter') && post.twitter_text ? post.twitter_text : post.text_content,
        linkUrl: platformLinkUrl,
        imagePath,
        imageUrl,
      });

      const resultStatus = result.manual ? 'pending_manual' : 'success';

      await mysql.query('DELETE FROM social_post_results WHERE post_id = ? AND platform = ?', [post.id, platform]);
      await mysql.query('INSERT INTO social_post_results SET ?', {
        post_id: post.id,
        platform,
        status: resultStatus,
        platform_post_id: result.postId || null,
        platform_post_url: result.postUrl || null,
        attempted_at: new Date(),
      });

      await mysql.query(
        'UPDATE social_accounts SET last_posted_at = NOW(), last_error = NULL WHERE platform = ?',
        [platform]
      );

      results.push({ platform, status: resultStatus, postUrl: result.postUrl });
      console.log(`  ${platform}: ${resultStatus} (${result.postUrl})`);
    } catch (err) {
      console.error(`  ${platform}: failed - ${err.message}`);

      await mysql.query('DELETE FROM social_post_results WHERE post_id = ? AND platform = ?', [post.id, platform]);
      await mysql.query('INSERT INTO social_post_results SET ?', {
        post_id: post.id,
        platform,
        status: 'failed',
        error_message: err.message,
        attempted_at: new Date(),
      });

      await mysql.query(
        'UPDATE social_accounts SET last_error = ? WHERE platform = ?',
        [err.message, platform]
      );

      failures.push({ platform, error: err.message });
      results.push({ platform, status: 'failed', error: err.message });
    }
  }

  // 5. Decide final status: done, retry with backoff, or terminal failure
  const succeededNow = results.some(r => SUCCESS_STATUSES.includes(r.status));
  const anySucceededEver = alreadySucceeded.size > 0 || succeededNow;
  const attemptCount = (post.attempt_count || 0) + 1;

  let finalStatus;
  let nextAttemptAt = null;
  if (failures.length === 0) {
    finalStatus = 'posted';
  } else if (attemptCount < MAX_ATTEMPTS) {
    finalStatus = 'queued';
    const backoff = RETRY_BACKOFF_MINUTES[Math.min(attemptCount - 1, RETRY_BACKOFF_MINUTES.length - 1)];
    nextAttemptAt = new Date(Date.now() + backoff * 60_000);
  } else {
    finalStatus = anySucceededEver ? 'partial' : 'failed';
  }

  const lastError = failures.length > 0
    ? failures.map(f => `${f.platform}: ${f.error}`).join('; ')
    : null;

  await mysql.query(
    `UPDATE social_posts
     SET status = ?, attempt_count = ?, next_attempt_at = ?, last_error = ?,
         posted_at = COALESCE(posted_at, ?)
     WHERE id = ?`,
    [finalStatus, attemptCount, nextAttemptAt, lastError, succeededNow ? new Date() : null, post.id]
  );

  // 6. Notify Slack about failures and recoveries
  if (failures.length > 0) {
    const detail = failures.map(f => `• ${f.platform}: ${f.error}`).join('\n');
    if (finalStatus === 'queued') {
      await notify(
        `:warning: Post #${post.id} failed on ${failures.length} platform(s) ` +
        `(attempt ${attemptCount}/${MAX_ATTEMPTS}, retrying in ${Math.round((nextAttemptAt - Date.now()) / 60_000)} min).\n` +
        `"${preview(post.text_content)}"\n${detail}`
      );
    } else {
      await notify(
        `:rotating_light: Post #${post.id} is ${finalStatus.toUpperCase()} after ${attemptCount} attempts — giving up.\n` +
        `"${preview(post.text_content)}"\n${detail}`
      );
    }
  } else if (attemptCount > 1) {
    await notify(`:white_check_mark: Post #${post.id} recovered on attempt ${attemptCount} and is fully posted.`);
  }

  // 7. Cleanup temp image
  if (imagePath && fs.existsSync(imagePath)) {
    fs.unlinkSync(imagePath);
  }

  return { finalStatus, results, willRetry: finalStatus === 'queued', nextAttemptAt };
}

/**
 * Download an image from a URL to /tmp and return the local path.
 */
function downloadImage(url, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    const filename = `social-image-${Date.now()}${path.extname(new URL(url).pathname) || '.jpg'}`;
    const filePath = path.join('/tmp', filename);

    const protocol = url.startsWith('https') ? https : require('http');
    protocol.get(url, (response) => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
        response.resume();
        if (redirectsLeft <= 0 || !response.headers.location) {
          reject(new Error(`Too many redirects downloading image: ${url}`));
          return;
        }
        downloadImage(response.headers.location, redirectsLeft - 1).then(resolve).catch(reject);
        return;
      }
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`Image download failed with status ${response.statusCode}: ${url}`));
        return;
      }
      const file = fs.createWriteStream(filePath);
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve(filePath);
      });
      file.on('error', (err) => {
        fs.unlink(filePath, () => {});
        reject(err);
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

module.exports = { publishPost, applyPlatformUtm, MAX_ATTEMPTS };
