/**
 * Social Queue Handler (API-key auth, no Firebase)
 * POST /social/queue - Queue a new post from CI/CD pipelines
 *
 * Authenticated via x-api-key header (SOCIAL_API_KEY env var).
 *
 * Supports:
 *   - plain enqueue (published by the every-minute scheduler)
 *   - scheduled_at: exact-time scheduling (honored to the minute)
 *   - publish_now: insert + publish synchronously, per-platform results in
 *     the response (bypasses blackout and spacing — explicit caller intent)
 *   - idempotency_key: safe retries; a duplicate key returns the original post
 */

const AWS = require('aws-sdk');
const crypto = require('crypto');
const mysql = require('../lib/db');
const { success, error, options } = require('../lib/response');
const { publishPost } = require('../lib/post-publisher');
const { parseOptionalInt, normalizeQueueGroup, toDate } = require('../lib/validate');

const s3 = new AWS.S3();
const lambda = new AWS.Lambda();

const DEFAULT_PRIORITY_BY_SOURCE = {
  news: 100,
  article: 25,
  api: 0,
};

// Card-wire updates are time-sensitive and must jump ahead of the regular
// queue, so they get a priority well above any other source's default.
const CARDWIRE_PRIORITY = 200;

// Card-wire posts share a spacing group so a multi-card issuer campaign drips
// out instead of firing as one burst. A single merge can carry several SUB
// increases (2026-08-27: three Delta cards at once, all tweeted in the same
// minute), and priority alone does not pace them. Jumping the queue is about
// ORDER, not about publishing simultaneously.
//
// Defaults only: an explicit queue_group or min_gap_minutes from the caller
// still wins, so a genuinely urgent single post can pass min_gap_minutes: 0.
const CARDWIRE_QUEUE_GROUP = 'card-wire';
const CARDWIRE_MIN_GAP_MINUTES = 30;

// The @card_wire feed is the only producer of the opt-in-only twitter_cardwire
// platform, so its presence uniquely identifies a card-wire post.
function isCardwirePost(platforms) {
  return Array.isArray(platforms) && platforms.includes('twitter_cardwire');
}

function apiKeyMatches(provided, expected) {
  if (!provided || !expected) return false;
  const a = Buffer.from(String(provided));
  const b = Buffer.from(String(expected));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// Kick the scheduler right now so an urgent post publishes within seconds
// instead of waiting for the next tick. Fire-and-forget (async invoke): if it
// fails, the post stays queued and the next scheduler tick still picks it up —
// blackout-exempt posts are eligible on every tick — so the worst case is the
// normal cadence delay, never a dropped post.
async function triggerSchedulerNow(postId) {
  const fnName = process.env.SCHEDULER_FUNCTION_NAME;
  if (!fnName) {
    console.warn('SCHEDULER_FUNCTION_NAME not set; skipping immediate publish kick');
    return;
  }
  try {
    await lambda.invoke({
      FunctionName: fnName,
      InvocationType: 'Event',
      Payload: JSON.stringify({ source: 'queue-immediate', postId }),
    }).promise();
    console.log(`Triggered scheduler immediately for post ${postId}`);
  } catch (err) {
    console.error(`Failed to trigger scheduler for post ${postId}: ${err.message}`);
  }
}

async function findByIdempotencyKey(key) {
  const [existing] = await mysql.query(
    'SELECT id, status FROM social_posts WHERE idempotency_key = ?',
    [key]
  );
  return existing || null;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return options();

  if (event.httpMethod !== 'POST') {
    return error(405, `Method ${event.httpMethod} not allowed`);
  }

  // API key auth
  const apiKey = event.headers?.['x-api-key'] || event.headers?.['X-Api-Key'];
  if (!apiKeyMatches(apiKey, process.env.SOCIAL_API_KEY)) {
    return error(401, 'Invalid or missing API key');
  }

  try {
    const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    const {
      text_content,
      twitter_text,
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
      scheduled_at,
      publish_now,
      blackout_exempt,
      idempotency_key,
    } = body;

    if (!text_content || !text_content.trim()) {
      return error(400, 'text_content is required');
    }

    const publishNow = publish_now === true;

    let scheduledAt = null;
    if (scheduled_at !== undefined && scheduled_at !== null && scheduled_at !== '') {
      scheduledAt = toDate(scheduled_at);
      if (!scheduledAt) {
        return error(400, 'scheduled_at must be a valid date/time (ISO 8601 recommended)');
      }
      if (publishNow) {
        return error(400, 'publish_now and scheduled_at are mutually exclusive');
      }
    }

    let idempotencyKey = null;
    if (idempotency_key !== undefined && idempotency_key !== null && idempotency_key !== '') {
      idempotencyKey = String(idempotency_key).trim();
      if (idempotencyKey.length > 128) {
        return error(400, 'idempotency_key must be 128 characters or fewer');
      }
      const existing = await findByIdempotencyKey(idempotencyKey);
      if (existing) {
        await mysql.end();
        return success({ id: existing.id, status: existing.status, deduped: true });
      }
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

    const cardwire = isCardwirePost(platforms);

    const insertData = {
      text_content: text_content.trim(),
      twitter_text: twitter_text && twitter_text.trim() ? twitter_text.trim() : null,
      image_url: resolvedImageUrl,
      link_url: link_url || null,
      source_type: finalSourceType,
      source_id: source_id || null,
      status: 'queued',
      scheduled_at: scheduledAt,
      platforms: platforms ? JSON.stringify(platforms) : null,
      // Urgent-lane posts skip the blackout window and the GLOBAL pacing gap:
      // card-wire always, publish_now so its retries also flow through fast, or
      // the caller's explicit request. They do NOT skip a per-post
      // min_gap_minutes; see the scheduler's NEXT_ELIGIBLE_SQL.
      blackout_exempt: cardwire || publishNow || blackout_exempt === true ? 1 : 0,
      idempotency_key: idempotencyKey,
      created_by: 'system',
    };

    if (parsedPriority.provided) {
      insertData.priority = parsedPriority.value ?? 0;
    } else if (cardwire) {
      insertData.priority = CARDWIRE_PRIORITY;
    } else if (DEFAULT_PRIORITY_BY_SOURCE[finalSourceType] !== undefined) {
      insertData.priority = DEFAULT_PRIORITY_BY_SOURCE[finalSourceType];
    }

    if (parsedQueueGroup.provided) {
      insertData.queue_group = parsedQueueGroup.value;
    } else if (cardwire) {
      insertData.queue_group = CARDWIRE_QUEUE_GROUP;
    }

    if (parsedMinGap.provided) {
      insertData.min_gap_minutes = parsedMinGap.value;
    } else if (cardwire) {
      insertData.min_gap_minutes = CARDWIRE_MIN_GAP_MINUTES;
    }

    let insertId;
    try {
      const result = await mysql.query('INSERT INTO social_posts SET ?', insertData);
      insertId = result.insertId;
    } catch (err) {
      // Two concurrent requests with the same idempotency key: the unique
      // index catches the race the pre-check missed.
      if (err.code === 'ER_DUP_ENTRY' && idempotencyKey) {
        const existing = await findByIdempotencyKey(idempotencyKey);
        await mysql.end();
        if (existing) {
          return success({ id: existing.id, status: existing.status, deduped: true });
        }
      }
      throw err;
    }

    if (publishNow) {
      // Claim and publish synchronously so the caller gets real results.
      await mysql.query(
        "UPDATE social_posts SET status = 'posting' WHERE id = ? AND status = 'queued'",
        [insertId]
      );
      const [post] = await mysql.query('SELECT * FROM social_posts WHERE id = ?', [insertId]);
      const { finalStatus, results, willRetry, nextAttemptAt } = await publishPost(post, mysql);
      await mysql.end();
      return success({
        id: insertId,
        status: finalStatus,
        results,
        will_retry: willRetry,
        next_attempt_at: nextAttemptAt ? nextAttemptAt.toISOString() : null,
      });
    }

    await mysql.end();

    // Card-wire updates publish within seconds rather than on the next tick.
    if (cardwire) {
      await triggerSchedulerNow(insertId);
    }

    return success({ id: insertId, status: 'queued' });
  } catch (err) {
    console.error('Error queuing post:', err);
    return error(500, `Failed to queue post: ${err.message}`);
  }
};
