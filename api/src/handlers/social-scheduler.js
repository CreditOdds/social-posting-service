/**
 * Social Scheduler Handler
 * Triggered by EventBridge every minute (and directly by the queue endpoint
 * for urgent posts). Each tick:
 *   1. Reaps posts stuck in 'posting' (crashed/timed-out invocations)
 *   2. Materializes due evergreen items into the queue
 *   3. Publishes every currently-due post, in order, up to a per-tick cap
 *
 * Errors are reported to Slack and rethrown so the Lambda Errors alarm fires.
 */

const mysql = require('../lib/db');
const { loadSettings } = require('../lib/settings');
const { isInBlackout } = require('../lib/blackout');
const { publishPost, MAX_ATTEMPTS } = require('../lib/post-publisher');
const { materializeEvergreen } = require('../lib/evergreen');
const { notify } = require('../lib/notify');

// Publishing is synchronous within the tick so each post's posted_at is
// visible to the next eligibility check (gap rules stay correct). The cap
// bounds tick duration; a backlog drains at cap-per-minute.
const MAX_PUBLISHES_PER_TICK = 5;

// A post claimed as 'posting' longer than this is considered stranded by a
// crashed invocation (publish Lambdas time out well before it).
const STUCK_POSTING_MINUTES = 10;

function getGlobalMinGapMinutes(settings) {
  const value = settings?.queue?.min_gap_minutes;
  return Number.isInteger(value) && value > 0 ? value : 0;
}

/**
 * Reset posts stranded in 'posting' by a crashed invocation. The stranded
 * attempt counts against the retry budget.
 */
async function reapStuckPosts() {
  const stuck = await mysql.query(
    `SELECT id, attempt_count, text_content FROM social_posts
     WHERE status = 'posting' AND updated_at < DATE_SUB(NOW(), INTERVAL ? MINUTE)`,
    [STUCK_POSTING_MINUTES]
  );

  for (const post of stuck) {
    const attemptCount = (post.attempt_count || 0) + 1;
    const exhausted = attemptCount >= MAX_ATTEMPTS;
    await mysql.query(
      `UPDATE social_posts
       SET status = ?, attempt_count = ?, next_attempt_at = ?, last_error = 'Publish invocation died mid-flight'
       WHERE id = ? AND status = 'posting'`,
      [
        exhausted ? 'failed' : 'queued',
        attemptCount,
        exhausted ? null : new Date(Date.now() + 5 * 60_000),
        post.id,
      ]
    );
    await notify(
      exhausted
        ? `:rotating_light: Post #${post.id} was stuck in 'posting' and has no retries left — marked failed.`
        : `:warning: Post #${post.id} was stuck in 'posting' (crashed publish?); requeued for retry.`
    );
  }

  return stuck.length;
}

// MySQL rejects UPDATE ... JOIN ... ORDER BY ... LIMIT in this environment,
// so first select the next eligible post, then claim it by id.
//
// blackout_exempt posts (card-wire, publish_now retries) skip both the
// blackout window and the spacing gaps — they are the urgent lane.
// Per-post min_gap_minutes applies within the post's queue_group when one is
// set, otherwise against the most recent post overall.
const NEXT_ELIGIBLE_SQL = `
  SELECT p.id
  FROM social_posts p
  CROSS JOIN (
    SELECT MAX(posted_at) AS last_posted_at
    FROM social_posts
    WHERE posted_at IS NOT NULL
  ) overall_last
  LEFT JOIN (
    SELECT queue_group, MAX(posted_at) AS last_posted_at
    FROM social_posts
    WHERE posted_at IS NOT NULL AND queue_group IS NOT NULL
    GROUP BY queue_group
  ) group_last ON group_last.queue_group = p.queue_group
  WHERE p.status = 'queued'
    AND (p.scheduled_at IS NULL OR p.scheduled_at <= NOW())
    AND (p.next_attempt_at IS NULL OR p.next_attempt_at <= NOW())
    AND (
      p.blackout_exempt = 1
      OR (
        ? = 0
        AND (
          ? = 0
          OR overall_last.last_posted_at IS NULL
          OR overall_last.last_posted_at <= DATE_SUB(NOW(), INTERVAL ? MINUTE)
        )
        AND (
          p.min_gap_minutes IS NULL
          OR (
            p.queue_group IS NOT NULL
            AND (
              group_last.last_posted_at IS NULL
              OR group_last.last_posted_at <= DATE_SUB(NOW(), INTERVAL p.min_gap_minutes MINUTE)
            )
          )
          OR (
            p.queue_group IS NULL
            AND (
              overall_last.last_posted_at IS NULL
              OR overall_last.last_posted_at <= DATE_SUB(NOW(), INTERVAL p.min_gap_minutes MINUTE)
            )
          )
        )
      )
    )
  ORDER BY p.priority DESC, p.scheduled_at ASC, p.created_at ASC
  LIMIT 1
`;

exports.handler = async (event) => {
  console.log('Scheduler triggered:', JSON.stringify(event));

  try {
    const settings = await loadSettings(mysql);
    const inBlackout = isInBlackout(new Date(), settings.blackout);
    const globalMinGapMinutes = getGlobalMinGapMinutes(settings);

    if (inBlackout) {
      console.log('Blackout window active; only blackout-exempt posts are eligible this tick.');
    }

    const reaped = await reapStuckPosts();
    if (reaped > 0) console.log(`Reaped ${reaped} stuck post(s)`);

    // Evergreen problems shouldn't block regular publishing.
    try {
      const enqueued = await materializeEvergreen(mysql, settings);
      if (enqueued > 0) console.log(`Enqueued ${enqueued} evergreen post(s)`);
    } catch (err) {
      console.error('Evergreen materialization failed:', err);
      await notify(`:warning: Evergreen materialization failed: ${err.message}`);
    }

    let published = 0;
    while (published < MAX_PUBLISHES_PER_TICK) {
      const [nextPost] = await mysql.query(NEXT_ELIGIBLE_SQL, [
        inBlackout ? 1 : 0,
        globalMinGapMinutes,
        globalMinGapMinutes,
      ]);

      if (!nextPost) break;

      const lockResult = await mysql.query(
        "UPDATE social_posts SET status = 'posting' WHERE id = ? AND status = 'queued'",
        [nextPost.id]
      );

      if (lockResult.affectedRows === 0) {
        // Claimed by a concurrent invocation; the reselect won't return it.
        console.log(`Post ${nextPost.id} was claimed by another invocation`);
        continue;
      }

      const [post] = await mysql.query('SELECT * FROM social_posts WHERE id = ?', [nextPost.id]);
      if (!post) break;

      console.log(`Processing post ${post.id}: ${post.text_content.substring(0, 50)}...`);
      const { finalStatus } = await publishPost(post, mysql);
      console.log(`Post ${post.id} finished with status: ${finalStatus}`);
      published += 1;
    }

    await mysql.end();
    return { statusCode: 200, body: `Published ${published} post(s)` };
  } catch (err) {
    console.error('Scheduler error:', err);
    await notify(`:rotating_light: Social scheduler crashed: ${err.message}`);
    await mysql.end();
    // Rethrow so the Lambda Errors metric (and its alarm) sees the failure.
    throw err;
  }
};
