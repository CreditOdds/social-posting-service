/**
 * Shared post-publishing logic.
 * Used by both the scheduler (automated) and the publish endpoint (manual).
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const twitter = require('./platforms/twitter');
const reddit = require('./platforms/reddit');
const facebook = require('./platforms/facebook');
const instagram = require('./platforms/instagram');
const linkedin = require('./platforms/linkedin');

const platformModules = { twitter, reddit, facebook, instagram, linkedin };

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
 * Publish a post to all target platforms.
 *
 * @param {object} post - The social_posts row
 * @param {object} mysql - Database connection
 * @returns {Promise<{finalStatus: string, results: Array}>}
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
    : activePlatformNames;

  if (targetPlatforms.length === 0) {
    await mysql.query("UPDATE social_posts SET status = 'failed' WHERE id = ?", [post.id]);
    return { finalStatus: 'failed', results: [], error: 'No active platforms' };
  }

  // 2. Download image to /tmp if needed
  let imagePath = null;
  const imageUrl = post.image_url;
  if (imageUrl) {
    try {
      imagePath = await downloadImage(imageUrl);
    } catch (err) {
      console.error('Failed to download image:', err.message);
    }
  }

  // 3. Post to each platform
  let allSucceeded = true;
  let anySucceeded = false;
  const results = [];

  for (const platform of targetPlatforms) {
    const mod = platformModules[platform];
    if (!mod) {
      console.warn(`No module for platform: ${platform}`);
      continue;
    }

    const platformLinkUrl = applyPlatformUtm(post.link_url, platform);

    try {
      console.log(`Posting to ${platform}...`);
      const result = await mod.post({
        text: post.text_content,
        linkUrl: platformLinkUrl,
        imagePath,
        imageUrl,
      });

      const resultStatus = result.manual ? 'pending_manual' : 'success';

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

      anySucceeded = true;
      results.push({ platform, status: resultStatus, postUrl: result.postUrl });
      console.log(`  ${platform}: ${resultStatus} (${result.postUrl})`);
    } catch (err) {
      console.error(`  ${platform}: failed - ${err.message}`);
      allSucceeded = false;

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

      results.push({ platform, status: 'failed', error: err.message });
    }
  }

  // 4. Update post status
  const finalStatus = allSucceeded ? 'posted' : 'failed';
  await mysql.query(
    'UPDATE social_posts SET status = ?, posted_at = ? WHERE id = ?',
    [finalStatus, anySucceeded ? new Date() : null, post.id]
  );

  // 5. Cleanup temp image
  if (imagePath && fs.existsSync(imagePath)) {
    fs.unlinkSync(imagePath);
  }

  return { finalStatus, results };
}

/**
 * Download an image from a URL to /tmp and return the local path.
 */
function downloadImage(url) {
  return new Promise((resolve, reject) => {
    const filename = `social-image-${Date.now()}${path.extname(url) || '.jpg'}`;
    const filePath = path.join('/tmp', filename);
    const file = fs.createWriteStream(filePath);

    const protocol = url.startsWith('https') ? https : require('http');
    protocol.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        downloadImage(response.headers.location).then(resolve).catch(reject);
        return;
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve(filePath);
      });
    }).on('error', (err) => {
      fs.unlink(filePath, () => {});
      reject(err);
    });
  });
}

module.exports = { publishPost, applyPlatformUtm };
