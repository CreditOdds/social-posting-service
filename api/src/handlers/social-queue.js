/**
 * Social Queue Handler (API-key auth, no Firebase)
 * POST /social/queue - Queue a new post from CI/CD pipelines
 *
 * Authenticated via x-api-key header (SOCIAL_API_KEY env var).
 */

const mysql = require('../lib/db');
const { success, error, options } = require('../lib/response');

const DEFAULT_PRIORITY_BY_SOURCE = {
  news: 100,
  article: 25,
  api: 0,
};

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

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return options();

  if (event.httpMethod !== 'POST') {
    return error(405, `Method ${event.httpMethod} not allowed`);
  }

  // API key auth
  const apiKey = event.headers?.['x-api-key'] || event.headers?.['X-Api-Key'];
  const expectedKey = process.env.SOCIAL_API_KEY;

  if (!expectedKey || apiKey !== expectedKey) {
    return error(401, 'Invalid or missing API key');
  }

  try {
    const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    const {
      text_content,
      image_url,
      link_url,
      source_type,
      source_id,
      platforms,
      priority,
      queue_group,
      min_gap_minutes,
    } = body;

    if (!text_content || !text_content.trim()) {
      return error(400, 'text_content is required');
    }

    const validSourceTypes = ['news', 'article', 'api'];
    const finalSourceType = validSourceTypes.includes(source_type) ? source_type : 'api';

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
      source_type: finalSourceType,
      source_id: source_id || null,
      status: 'queued',
      platforms: platforms ? JSON.stringify(platforms) : null,
      created_by: 'system',
    };

    if (parsedPriority.provided) {
      insertData.priority = parsedPriority.value ?? 0;
    } else if (DEFAULT_PRIORITY_BY_SOURCE[finalSourceType] !== undefined) {
      insertData.priority = DEFAULT_PRIORITY_BY_SOURCE[finalSourceType];
    }

    if (parsedQueueGroup.provided) insertData.queue_group = parsedQueueGroup.value;
    if (parsedMinGap.provided) insertData.min_gap_minutes = parsedMinGap.value;

    const result = await mysql.query('INSERT INTO social_posts SET ?', insertData);

    await mysql.end();

    return success({ id: result.insertId, status: 'queued' });
  } catch (err) {
    console.error('Error queuing post:', err);
    return error(500, `Failed to queue post: ${err.message}`);
  }
};
