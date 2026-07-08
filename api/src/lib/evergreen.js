/**
 * Evergreen content pool.
 *
 * Each social_evergreen row re-enqueues itself on its own cadence
 * (daily/weekly/monthly, optionally at a preferred local time-of-day). The
 * scheduler calls materializeEvergreen() every tick; due items are inserted
 * into social_posts as ordinary low-priority queue rows, so all the existing
 * spacing/blackout/priority machinery applies to them.
 */

const CADENCE_DAYS = { daily: 1, weekly: 7, monthly: 30 };

// Evergreen posts sit below every normal post (default priority 0) and space
// themselves out within their own queue group so two due items never bunch up.
const EVERGREEN_PRIORITY = -10;
const EVERGREEN_QUEUE_GROUP = 'evergreen';
const EVERGREEN_GROUP_GAP_MINUTES = 120;

const DAY_MS = 24 * 60 * 60 * 1000;

function parsePreferredTime(value) {
  if (!value) return null;
  const match = String(value).match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function tzOffsetMinutes(date, timeZone) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(date);
    const get = type => Number(parts.find(p => p.type === type)?.value ?? 0);
    const hour = get('hour') === 24 ? 0 : get('hour');
    const asUTC = Date.UTC(get('year'), get('month') - 1, get('day'), hour, get('minute'), get('second'));
    return (asUTC - date.getTime()) / 60_000;
  } catch {
    return 0;
  }
}

/** Snap a UTC instant to a given local time-of-day in `timeZone`. */
function snapToLocalTime(date, prefMinutes, timeZone) {
  const offset = tzOffsetMinutes(date, timeZone);
  const local = new Date(date.getTime() + offset * 60_000);
  local.setUTCHours(Math.floor(prefMinutes / 60), prefMinutes % 60, 0, 0);
  return new Date(local.getTime() - offset * 60_000);
}

/**
 * The first run for a newly created/edited item: the next occurrence of the
 * preferred local time (today if still ahead), or now when no time is set.
 */
function computeInitialRunAt(preferredTime, timeZone, from = new Date()) {
  const prefMinutes = parsePreferredTime(preferredTime);
  if (prefMinutes === null) return from;
  let next = snapToLocalTime(from, prefMinutes, timeZone);
  if (next <= from) next = new Date(next.getTime() + DAY_MS);
  return next;
}

/** The run after a completed one: cadence interval out, snapped to the preferred time. */
function computeNextRunAt(cadence, preferredTime, timeZone, from = new Date()) {
  const days = CADENCE_DAYS[cadence] || CADENCE_DAYS.weekly;
  let next = new Date(from.getTime() + days * DAY_MS);
  const prefMinutes = parsePreferredTime(preferredTime);
  if (prefMinutes !== null) {
    next = snapToLocalTime(next, prefMinutes, timeZone);
    if (next <= from) next = new Date(next.getTime() + DAY_MS);
  }
  return next;
}

/**
 * Enqueue every due evergreen item as a social_posts row and advance its
 * next_run_at. Returns the number of posts enqueued.
 */
async function materializeEvergreen(mysql, settings) {
  let due;
  try {
    due = await mysql.query(
      `SELECT * FROM social_evergreen
       WHERE is_active = 1 AND next_run_at IS NOT NULL AND next_run_at <= NOW()
       ORDER BY next_run_at ASC
       LIMIT 10`
    );
  } catch (err) {
    // Migration 007 not applied yet — evergreen simply isn't enabled.
    if (err && err.code === 'ER_NO_SUCH_TABLE') return 0;
    throw err;
  }

  const timeZone = settings?.blackout?.timezone || 'America/New_York';
  let enqueued = 0;

  for (const item of due) {
    const nextRunAt = computeNextRunAt(item.cadence, item.preferred_time, timeZone);

    // If the previous enqueue is still waiting in the queue, skip this cycle
    // instead of piling up duplicates behind a stalled queue.
    const [existing] = await mysql.query(
      `SELECT id FROM social_posts
       WHERE source_type = 'evergreen' AND source_id = ? AND status IN ('queued', 'posting')
       LIMIT 1`,
      [String(item.id)]
    );

    if (existing) {
      console.log(`Evergreen item ${item.id} still queued as post ${existing.id}; skipping this cycle`);
      await mysql.query('UPDATE social_evergreen SET next_run_at = ? WHERE id = ?', [nextRunAt, item.id]);
      continue;
    }

    await mysql.query('INSERT INTO social_posts SET ?', {
      text_content: item.text_content,
      twitter_text: item.twitter_text || null,
      image_url: item.image_url || null,
      link_url: item.link_url || null,
      platforms: item.platforms
        ? (typeof item.platforms === 'string' ? item.platforms : JSON.stringify(item.platforms))
        : null,
      source_type: 'evergreen',
      source_id: String(item.id),
      status: 'queued',
      priority: EVERGREEN_PRIORITY,
      queue_group: EVERGREEN_QUEUE_GROUP,
      min_gap_minutes: EVERGREEN_GROUP_GAP_MINUTES,
      created_by: 'evergreen',
    });

    await mysql.query(
      'UPDATE social_evergreen SET last_enqueued_at = NOW(), times_used = times_used + 1, next_run_at = ? WHERE id = ?',
      [nextRunAt, item.id]
    );

    enqueued += 1;
    console.log(`Evergreen item ${item.id} enqueued; next run ${nextRunAt.toISOString()}`);
  }

  return enqueued;
}

module.exports = {
  materializeEvergreen,
  computeInitialRunAt,
  computeNextRunAt,
  parsePreferredTime,
};
