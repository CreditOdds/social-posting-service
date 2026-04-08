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

    // Claim the post — must be queued or failed
    const lockResult = await mysql.query(
      "UPDATE social_posts SET status = 'posting' WHERE id = ? AND status IN ('queued', 'failed')",
      [id]
    );

    if (lockResult.affectedRows === 0) {
      await mysql.end();
      return error(400, 'Post not found or not in a publishable state (must be queued or failed)');
    }

    const [post] = await mysql.query('SELECT * FROM social_posts WHERE id = ?', [id]);
    if (!post) {
      await mysql.end();
      return error(404, 'Post not found');
    }

    // Clear any previous results (for retries)
    await mysql.query('DELETE FROM social_post_results WHERE post_id = ?', [id]);

    console.log(`Manual publish of post ${post.id}: ${post.text_content.substring(0, 50)}...`);

    const { finalStatus, results } = await publishPost(post, mysql);

    await mysql.end();

    return success({ id: post.id, status: finalStatus, results });
  } catch (err) {
    console.error('Publish error:', err);
    await mysql.end();
    return error(500, `Failed to publish: ${err.message}`);
  }
};
