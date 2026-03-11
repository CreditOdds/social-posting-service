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
const { loadSettings } = require('../lib/settings');
const { isInBlackout, advanceToNextAllowedTick } = require('../lib/blackout');

const SCHEDULER_INTERVAL_MINUTES = 35;

function parseOptionalInt(value, fieldName) {
  if (value === undefined) return { provided: false };
  if (value === null || value === '') return { provided: true, value: null };
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return { provided: true, error: `${fieldName} must be a number` };
  }
  return { provided: true, value: Math.trunc(parsed) };
}

function normalizeQueueGroup(value) {
  if (value === undefined) return { provided: false };
  if (value === null) return { provided: true, value: null };
  const trimmed = String(value).trim();
  return { provided: true, value: trimmed.length > 0 ? trimmed : null };
}

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function ceilToInterval(date, intervalMs) {
  return new Date(Math.ceil(date.getTime() / intervalMs) * intervalMs);
}

function compareQueueOrder(a, b) {
  if (a.priority !== b.priority) return b.priority - a.priority;
  const aScheduled = toDate(a.scheduled_at);
  const bScheduled = toDate(b.scheduled_at);
  const aScheduledMs = aScheduled ? aScheduled.getTime() : 0;
  const bScheduledMs = bScheduled ? bScheduled.getTime() : 0;
  if (aScheduledMs !== bScheduledMs) return aScheduledMs - bScheduledMs;
  const aCreated = toDate(a.created_at);
  const bCreated = toDate(b.created_at);
  return (aCreated ? aCreated.getTime() : 0) - (bCreated ? bCreated.getTime() : 0);
}

function getGlobalMinGapMinutes(settings) {
  const value = settings?.queue?.min_gap_minutes;
  return Number.isInteger(value) && value > 0 ? value : 0;
}

function computeEligibleAt(post, lastPostedAt, lastPostedByGroup, settings, now) {
  let eligibleAt = now;
  const scheduledAt = toDate(post.scheduled_at);
  if (scheduledAt && scheduledAt > eligibleAt) {
    eligibleAt = scheduledAt;
  }
  const globalMinGapMinutes = getGlobalMinGapMinutes(settings);
  if (globalMinGapMinutes > 0 && lastPostedAt) {
    const globalGapAt = new Date(lastPostedAt.getTime() + globalMinGapMinutes * 60_000);
    if (globalGapAt > eligibleAt) {
      eligibleAt = globalGapAt;
    }
  }
  if (post.queue_group && post.min_gap_minutes != null) {
    const lastPosted = lastPostedByGroup.get(post.queue_group);
    if (lastPosted) {
      const gapAt = new Date(lastPosted.getTime() + post.min_gap_minutes * 60_000);
      if (gapAt > eligibleAt) {
        eligibleAt = gapAt;
      }
    }
  }
  return eligibleAt;
}

function estimateQueuedPosts(posts, lastPostedAt, lastPostedByGroup, settings) {
  const now = new Date();
  const intervalMs = SCHEDULER_INTERVAL_MINUTES * 60_000;
  let tick = advanceToNextAllowedTick(ceilToInterval(now, intervalMs), intervalMs, settings?.blackout);
  const remaining = posts.filter(p => p.status === 'queued');
  const estimates = new Map();
  const lastPosted = new Map(lastPostedByGroup);
  let latestPostedAt = lastPostedAt ? new Date(lastPostedAt) : null;

  while (remaining.length > 0) {
    let earliestEligible = null;
    const candidates = [];

    for (const post of remaining) {
      const eligibleAt = computeEligibleAt(post, latestPostedAt, lastPosted, settings, now);
      if (!earliestEligible || eligibleAt < earliestEligible) {
        earliestEligible = eligibleAt;
      }
      if (eligibleAt <= tick) {
        candidates.push(post);
      }
    }

    if (candidates.length === 0) {
      if (!earliestEligible) break;
      tick = advanceToNextAllowedTick(ceilToInterval(earliestEligible, intervalMs), intervalMs, settings?.blackout);
      continue;
    }

    candidates.sort(compareQueueOrder);
    const chosen = candidates[0];
    estimates.set(chosen.id, new Date(tick));
    latestPostedAt = new Date(tick);

    if (chosen.queue_group) {
      lastPosted.set(chosen.queue_group, new Date(tick));
    }

    const index = remaining.findIndex(p => p.id === chosen.id);
    if (index >= 0) {
      remaining.splice(index, 1);
    } else {
      break;
    }

    tick = advanceToNextAllowedTick(new Date(tick.getTime() + intervalMs), intervalMs, settings?.blackout);
  }

  return estimates;
}

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

    const needsQueueEstimates = posts.some(p => p.status === 'queued');
    let lastPostedByGroup = new Map();
    let lastPostedAt = null;
    let settings = null;
    if (needsQueueEstimates) {
      settings = await loadSettings(mysql);
      const [lastPostedRow] = await mysql.query(`
        SELECT MAX(posted_at) AS last_posted_at
        FROM social_posts
        WHERE status = 'posted'
      `);
      lastPostedAt = toDate(lastPostedRow?.last_posted_at);
      const lastPostedRows = await mysql.query(`
        SELECT queue_group, MAX(posted_at) AS last_posted_at
        FROM social_posts
        WHERE status = 'posted' AND queue_group IS NOT NULL
        GROUP BY queue_group
      `);
      lastPostedRows.forEach(row => {
        const date = toDate(row.last_posted_at);
        if (row.queue_group && date) {
          lastPostedByGroup.set(row.queue_group, date);
        }
      });
    }

    await mysql.end();

    // Parse JSON results
    const parsedPosts = posts.map(p => ({
      ...p,
      platforms: typeof p.platforms === 'string' ? JSON.parse(p.platforms) : p.platforms,
      results: typeof p.results === 'string' ? JSON.parse(p.results) : (p.results || []),
    }));

    const estimatedTimes = needsQueueEstimates
      ? estimateQueuedPosts(parsedPosts, lastPostedAt, lastPostedByGroup, settings)
      : new Map();

    const withEstimates = parsedPosts.map(post => ({
      ...post,
      estimated_post_at: estimatedTimes.get(post.id)
        ? estimatedTimes.get(post.id).toISOString()
        : null,
    }));

    return success({
      posts: withEstimates,
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
    const {
      text_content,
      image_url,
      link_url,
      source_type,
      source_id,
      status: postStatus,
      scheduled_at,
      platforms,
      priority,
      queue_group,
      min_gap_minutes,
    } = body;

    if (!text_content || !text_content.trim()) {
      return error(400, 'text_content is required');
    }

    const validStatuses = ['draft', 'queued'];
    const finalStatus = validStatuses.includes(postStatus) ? postStatus : 'draft';

    const parsedPriority = parseOptionalInt(priority, 'priority');
    if (parsedPriority.error) return error(400, parsedPriority.error);

    const parsedMinGap = parseOptionalInt(min_gap_minutes, 'min_gap_minutes');
    if (parsedMinGap.error) return error(400, parsedMinGap.error);
    if (parsedMinGap.provided && parsedMinGap.value !== null && parsedMinGap.value < 0) {
      return error(400, 'min_gap_minutes must be >= 0');
    }

    const parsedQueueGroup = normalizeQueueGroup(queue_group);

    const insertData = {
      text_content: text_content.trim(),
      image_url: image_url || null,
      link_url: link_url || null,
      source_type: source_type || 'manual',
      source_id: source_id || null,
      status: finalStatus,
      scheduled_at: scheduled_at || null,
      platforms: platforms ? JSON.stringify(platforms) : null,
      created_by: userId || 'system',
    };

    if (parsedPriority.provided) insertData.priority = parsedPriority.value ?? 0;
    if (parsedQueueGroup.provided) insertData.queue_group = parsedQueueGroup.value;
    if (parsedMinGap.provided) insertData.min_gap_minutes = parsedMinGap.value;

    const result = await mysql.query('INSERT INTO social_posts SET ?', insertData);

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
    const {
      id,
      text_content,
      image_url,
      link_url,
      status: newStatus,
      scheduled_at,
      platforms,
      priority,
      queue_group,
      min_gap_minutes,
    } = body;

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

    const parsedPriority = parseOptionalInt(priority, 'priority');
    if (parsedPriority.error) return error(400, parsedPriority.error);
    if (parsedPriority.provided) updates.priority = parsedPriority.value ?? 0;

    const parsedMinGap = parseOptionalInt(min_gap_minutes, 'min_gap_minutes');
    if (parsedMinGap.error) return error(400, parsedMinGap.error);
    if (parsedMinGap.provided && parsedMinGap.value !== null && parsedMinGap.value < 0) {
      return error(400, 'min_gap_minutes must be >= 0');
    }
    if (parsedMinGap.provided) updates.min_gap_minutes = parsedMinGap.value;

    const parsedQueueGroup = normalizeQueueGroup(queue_group);
    if (parsedQueueGroup.provided) updates.queue_group = parsedQueueGroup.value;

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
