/**
 * Social Queue Handler (API-key auth, no Firebase)
 * POST /social/queue - Queue a new post from CI/CD pipelines
 *
 * Authenticated via x-api-key header (SOCIAL_API_KEY env var).
 */

const AWS = require('aws-sdk');
const mysql = require('../lib/db');
const { success, error, options } = require('../lib/response');

const s3 = new AWS.S3();

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
      image_base64,
      image_mime_type,
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

    // Resolve image URL: upload base64 to S3 if provided, otherwise use image_url
    let resolvedImageUrl = image_url || null;
    if (image_base64) {
      const mimeType = image_mime_type || 'image/png';
      const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
      if (!allowedTypes.includes(mimeType)) {
        return error(400, `Invalid image_mime_type. Allowed: ${allowedTypes.join(', ')}`);
      }

      const bucket = process.env.S3_BUCKET;
      if (!bucket) {
        return error(500, 'S3_BUCKET not configured');
      }

      const ext = mimeType.split('/')[1] === 'jpeg' ? 'jpg' : mimeType.split('/')[1];
      const key = `social-images/${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${ext}`;
      const buffer = Buffer.from(image_base64, 'base64');

      await s3.putObject({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
      }).promise();

      const cdnDomain = process.env.CDN_DOMAIN;
      resolvedImageUrl = cdnDomain
        ? `https://${cdnDomain}/${key}`
        : `https://${bucket}.s3.amazonaws.com/${key}`;
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
      image_url: resolvedImageUrl,
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
