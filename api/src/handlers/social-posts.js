/**
 * Social Posts CRUD Handler
 * GET    /social/posts   - List posts (with filters)
 * POST   /social/posts   - Create post
 * PUT    /social/posts    - Update post
 * DELETE /social/posts    - Delete post
 */

const mysql = require('../lib/db');
const { isAdmin, getUserId } = require('../lib/admin-check');
const { success, error, options } = require('../lib/response');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return options();

  if (!isAdmin(event)) {
    return error(403, 'Forbidden: Admin access required');
  }

  const userId = getUserId(event);

  switch (event.httpMethod) {
    case 'GET':
      return handleGet(event);
    case 'POST':
      return handlePost(event, userId);
    case 'PUT':
      return handlePut(event);
    case 'DELETE':
      return handleDelete(event);
    default:
      return error(405, `Method ${event.httpMethod} not allowed`);
  }
};

async function handleGet(event) {
  try {
    const params = event.queryStringParameters || {};
    const limit = parseInt(params.limit) || 50;
    const offset = parseInt(params.offset) || 0;
    const status = params.status || null;

    let whereClause = '';
    const queryParams = [];

    if (status) {
      whereClause = 'WHERE p.status = ?';
      queryParams.push(status);
    }

    const posts = await mysql.query(`
      SELECT p.*,
        (SELECT JSON_ARRAYAGG(
          JSON_OBJECT(
            'id', r.id,
            'platform', r.platform,
            'status', r.status,
            'platform_post_id', r.platform_post_id,
            'platform_post_url', r.platform_post_url,
            'error_message', r.error_message,
            'attempted_at', r.attempted_at
          )
        ) FROM social_post_results r WHERE r.post_id = p.id) as results
      FROM social_posts p
      ${whereClause}
      ORDER BY p.created_at DESC
      LIMIT ? OFFSET ?
    `, [...queryParams, limit, offset]);

    const countQuery = status
      ? 'SELECT COUNT(*) as total FROM social_posts WHERE status = ?'
      : 'SELECT COUNT(*) as total FROM social_posts';
    const countParams = status ? [status] : [];
    const countResult = await mysql.query(countQuery, countParams);

    await mysql.end();

    // Parse JSON results
    const parsedPosts = posts.map(p => ({
      ...p,
      platforms: typeof p.platforms === 'string' ? JSON.parse(p.platforms) : p.platforms,
      results: typeof p.results === 'string' ? JSON.parse(p.results) : (p.results || []),
    }));

    return success({
      posts: parsedPosts,
      total: countResult[0].total,
      limit,
      offset,
    });
  } catch (err) {
    console.error('Error fetching posts:', err);
    return error(500, `Failed to fetch posts: ${err.message}`);
  }
}

async function handlePost(event, userId) {
  try {
    const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    const { text_content, image_url, link_url, source_type, source_id, status: postStatus, scheduled_at, platforms } = body;

    if (!text_content || !text_content.trim()) {
      return error(400, 'text_content is required');
    }

    const validStatuses = ['draft', 'queued'];
    const finalStatus = validStatuses.includes(postStatus) ? postStatus : 'draft';

    const result = await mysql.query('INSERT INTO social_posts SET ?', {
      text_content: text_content.trim(),
      image_url: image_url || null,
      link_url: link_url || null,
      source_type: source_type || 'manual',
      source_id: source_id || null,
      status: finalStatus,
      scheduled_at: scheduled_at || null,
      platforms: platforms ? JSON.stringify(platforms) : null,
      created_by: userId || 'system',
    });

    await mysql.end();

    return success({ id: result.insertId, status: finalStatus });
  } catch (err) {
    console.error('Error creating post:', err);
    return error(500, `Failed to create post: ${err.message}`);
  }
}

async function handlePut(event) {
  try {
    const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    const { id, text_content, image_url, link_url, status: newStatus, scheduled_at, platforms } = body;

    if (!id) {
      return error(400, 'id is required');
    }

    // Only allow editing draft/queued/failed posts
    const existing = await mysql.query('SELECT status FROM social_posts WHERE id = ?', [id]);
    if (existing.length === 0) {
      return error(404, 'Post not found');
    }

    const editableStatuses = ['draft', 'queued', 'failed'];
    if (!editableStatuses.includes(existing[0].status)) {
      return error(400, `Cannot edit post with status '${existing[0].status}'`);
    }

    const updates = {};
    if (text_content !== undefined) updates.text_content = text_content.trim();
    if (image_url !== undefined) updates.image_url = image_url || null;
    if (link_url !== undefined) updates.link_url = link_url || null;
    if (scheduled_at !== undefined) updates.scheduled_at = scheduled_at || null;
    if (platforms !== undefined) updates.platforms = platforms ? JSON.stringify(platforms) : null;

    const validStatuses = ['draft', 'queued', 'cancelled'];
    if (newStatus && validStatuses.includes(newStatus)) {
      updates.status = newStatus;
    }

    if (Object.keys(updates).length === 0) {
      return error(400, 'No valid fields to update');
    }

    await mysql.query('UPDATE social_posts SET ? WHERE id = ?', [updates, id]);
    await mysql.end();

    return success({ id, updated: true });
  } catch (err) {
    console.error('Error updating post:', err);
    return error(500, `Failed to update post: ${err.message}`);
  }
}

async function handleDelete(event) {
  try {
    const postId = event.queryStringParameters?.id;
    if (!postId) {
      return error(400, 'id query parameter is required');
    }

    const existing = await mysql.query('SELECT status FROM social_posts WHERE id = ?', [postId]);
    if (existing.length === 0) {
      return error(404, 'Post not found');
    }

    // Don't allow deleting posts currently being processed
    if (existing[0].status === 'posting') {
      return error(400, 'Cannot delete a post that is currently being posted');
    }

    await mysql.query('DELETE FROM social_posts WHERE id = ?', [postId]);
    await mysql.end();

    return success({ id: parseInt(postId), deleted: true });
  } catch (err) {
    console.error('Error deleting post:', err);
    return error(500, `Failed to delete post: ${err.message}`);
  }
}
