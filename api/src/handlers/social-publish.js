/**
 * Social Publish Handler
 * POST /social/publish - Immediately publish a queued post (admin-only).
 */

const mysql = require('../lib/db');
const { isAdmin } = require('../lib/admin-check');
const { success, error, options } = require('../lib/response');
const { publishPost } = require('../lib/post-publisher');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return options();

  if (!isAdmin(event)) {
    return error(403, 'Forbidden: Admin access required');
  }

  if (event.httpMethod !== 'POST') {
    return error(405, `Method ${event.httpMethod} not allowed`);
  }

  try {
    const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    const { id } = body;

    if (!id) {
      return error(400, 'id is required');
    }

    // Claim the post and reset its retry budget — a manual publish is a fresh
    // start. Prior platform results are kept: publishPost skips platforms
    // that already succeeded, so retries never double-post.
    const lockResult = await mysql.query(
      `UPDATE social_posts
       SET status = 'posting', attempt_count = 0, next_attempt_at = NULL
       WHERE id = ? AND status IN ('queued', 'failed', 'partial')`,
      [id]
    );

    if (lockResult.affectedRows === 0) {
      await mysql.end();
      return error(400, 'Post not found or not in a publishable state (must be queued, failed, or partial)');
    }

    const [post] = await mysql.query('SELECT * FROM social_posts WHERE id = ?', [id]);
    if (!post) {
      await mysql.end();
      return error(404, 'Post not found');
    }

    console.log(`Manual publish of post ${post.id}: ${post.text_content.substring(0, 50)}...`);

    const { finalStatus, results, willRetry, nextAttemptAt } = await publishPost(post, mysql);

    await mysql.end();

    return success({
      id: post.id,
      status: finalStatus,
      results,
      will_retry: willRetry,
      next_attempt_at: nextAttemptAt ? nextAttemptAt.toISOString() : null,
    });
  } catch (err) {
    console.error('Publish error:', err);
    await mysql.end();
    return error(500, `Failed to publish: ${err.message}`);
  }
};
