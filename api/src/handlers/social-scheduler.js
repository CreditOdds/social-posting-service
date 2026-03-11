/**
 * Social Scheduler Handler
 * Triggered by EventBridge every 35 minutes.
 * Picks the next queued post and publishes to all active platforms.
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const mysql = require('../lib/db');
const { loadSettings } = require('../lib/settings');
const { isInBlackout } = require('../lib/blackout');

// Platform modules
const twitter = require('../lib/platforms/twitter');
const reddit = require('../lib/platforms/reddit');
const facebook = require('../lib/platforms/facebook');
const instagram = require('../lib/platforms/instagram');
const linkedin = require('../lib/platforms/linkedin');

const platformModules = { twitter, reddit, facebook, instagram, linkedin };

exports.handler = async (event) => {
  console.log('Scheduler triggered:', JSON.stringify(event));

  try {
    const settings = await loadSettings(mysql);
    if (isInBlackout(new Date(), settings.blackout)) {
      console.log('Blackout window active; skipping post publish.');
      await mysql.end();
      return { statusCode: 200, body: 'Blackout window active' };
    }

    // 1. Get the next queued post (atomically lock it)
    const lockResult = await mysql.query(`
      UPDATE social_posts p
      LEFT JOIN (
        SELECT queue_group, MAX(posted_at) AS last_posted_at
        FROM social_posts
        WHERE status = 'posted' AND queue_group IS NOT NULL
        GROUP BY queue_group
      ) last_posted ON last_posted.queue_group = p.queue_group
      SET p.status = 'posting'
      WHERE p.status = 'queued'
        AND (p.scheduled_at IS NULL OR p.scheduled_at <= NOW())
        AND (
          p.min_gap_minutes IS NULL
          OR p.queue_group IS NULL
          OR last_posted.last_posted_at IS NULL
          OR last_posted.last_posted_at <= DATE_SUB(NOW(), INTERVAL p.min_gap_minutes MINUTE)
        )
      ORDER BY p.priority DESC, p.scheduled_at ASC, p.created_at ASC
      LIMIT 1
    `);

    if (lockResult.affectedRows === 0) {
      console.log('No queued posts to process');
      await mysql.end();
      return { statusCode: 200, body: 'No posts to process' };
    }

    // 2. Fetch the locked post
    const [post] = await mysql.query(
      "SELECT * FROM social_posts WHERE status = 'posting' ORDER BY updated_at DESC LIMIT 1"
    );

    if (!post) {
      console.log('Could not find locked post');
      await mysql.end();
      return { statusCode: 200, body: 'No post found' };
    }

    console.log(`Processing post ${post.id}: ${post.text_content.substring(0, 50)}...`);

    // 3. Determine which platforms to post to
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
      console.log('No active platforms to post to');
      await mysql.query("UPDATE social_posts SET status = 'failed' WHERE id = ?", [post.id]);
      await mysql.end();
      return { statusCode: 200, body: 'No active platforms' };
    }

    // 4. Download image to /tmp if needed
    let imagePath = null;
    let imageUrl = post.image_url;
    if (imageUrl) {
      try {
        imagePath = await downloadImage(imageUrl);
      } catch (err) {
        console.error('Failed to download image:', err.message);
      }
    }

    // 5. Post to each platform
    let allSucceeded = true;
    let anySucceeded = false;

    for (const platform of targetPlatforms) {
      const mod = platformModules[platform];
      if (!mod) {
        console.warn(`No module for platform: ${platform}`);
        continue;
      }

      try {
        console.log(`Posting to ${platform}...`);
        const result = await mod.post({
          text: post.text_content,
          linkUrl: post.link_url,
          imagePath,
          imageUrl,
        });

        await mysql.query('INSERT INTO social_post_results SET ?', {
          post_id: post.id,
          platform,
          status: 'success',
          platform_post_id: result.postId || null,
          platform_post_url: result.postUrl || null,
          attempted_at: new Date(),
        });

        // Update account's last_posted_at
        await mysql.query(
          'UPDATE social_accounts SET last_posted_at = NOW(), last_error = NULL WHERE platform = ?',
          [platform]
        );

        anySucceeded = true;
        console.log(`  ${platform}: success (${result.postUrl})`);
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
      }
    }

    // 6. Update post status
    const finalStatus = allSucceeded ? 'posted' : 'failed';
    await mysql.query(
      'UPDATE social_posts SET status = ?, posted_at = ? WHERE id = ?',
      [finalStatus, anySucceeded ? new Date() : null, post.id]
    );

    // Cleanup temp image
    if (imagePath && fs.existsSync(imagePath)) {
      fs.unlinkSync(imagePath);
    }

    await mysql.end();

    console.log(`Post ${post.id} finished with status: ${finalStatus}`);
    return { statusCode: 200, body: `Post ${post.id}: ${finalStatus}` };
  } catch (err) {
    console.error('Scheduler error:', err);
    await mysql.end();
    return { statusCode: 500, body: err.message };
  }
};

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
        // Follow redirect
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
