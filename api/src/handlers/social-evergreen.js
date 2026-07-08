/**
 * Social Evergreen Handler (admin-only)
 * GET    /social/evergreen - List evergreen items
 * POST   /social/evergreen - Create item
 * PUT    /social/evergreen - Update item
 * DELETE /social/evergreen - Delete item (?id=)
 *
 * Evergreen items are recycled content the scheduler re-enqueues on a cadence
 * (daily/weekly/monthly), optionally at a preferred local time-of-day.
 */

const mysql = require('../lib/db');
const { isAdmin, getUserId } = require('../lib/admin-check');
const { success, error, options } = require('../lib/response');
const { loadSettings } = require('../lib/settings');
const { computeInitialRunAt, parsePreferredTime } = require('../lib/evergreen');

const VALID_CADENCES = ['daily', 'weekly', 'monthly'];

function normalizePreferredTime(value) {
  if (value === undefined) return { provided: false };
  if (value === null || value === '') return { provided: true, value: null };
  if (parsePreferredTime(value) === null) {
    return { provided: true, error: 'preferred_time must be in HH:MM (24h) format' };
  }
  // Normalize "9:30" → "09:30:00" for the TIME column
  const [h, m] = String(value).split(':');
  return { provided: true, value: `${h.padStart(2, '0')}:${m.slice(0, 2)}:00` };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return options();

  if (!isAdmin(event)) {
    return error(403, 'Forbidden: Admin access required');
  }

  switch (event.httpMethod) {
    case 'GET':
      return handleGet();
    case 'POST':
      return handlePost(event);
    case 'PUT':
      return handlePut(event);
    case 'DELETE':
      return handleDelete(event);
    default:
      return error(405, `Method ${event.httpMethod} not allowed`);
  }
};

async function handleGet() {
  try {
    const items = await mysql.query(
      'SELECT * FROM social_evergreen ORDER BY is_active DESC, next_run_at ASC, id ASC'
    );
    await mysql.end();
    return success({
      items: items.map(item => ({
        ...item,
        platforms: typeof item.platforms === 'string' ? JSON.parse(item.platforms) : item.platforms,
      })),
    });
  } catch (err) {
    console.error('Error fetching evergreen items:', err);
    return error(500, `Failed to fetch evergreen items: ${err.message}`);
  }
}

async function handlePost(event) {
  try {
    const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    const {
      text_content,
      twitter_text,
      image_url,
      link_url,
      platforms,
      cadence,
      preferred_time,
      is_active,
    } = body;

    if (!text_content || !text_content.trim()) {
      return error(400, 'text_content is required');
    }

    const finalCadence = VALID_CADENCES.includes(cadence) ? cadence : 'weekly';

    const parsedTime = normalizePreferredTime(preferred_time);
    if (parsedTime.error) return error(400, parsedTime.error);
    const preferredTime = parsedTime.provided ? parsedTime.value : null;

    const settings = await loadSettings(mysql);
    const timeZone = settings?.blackout?.timezone || 'America/New_York';

    const result = await mysql.query('INSERT INTO social_evergreen SET ?', {
      text_content: text_content.trim(),
      twitter_text: twitter_text && twitter_text.trim() ? twitter_text.trim() : null,
      image_url: image_url || null,
      link_url: link_url || null,
      platforms: platforms ? JSON.stringify(platforms) : null,
      cadence: finalCadence,
      preferred_time: preferredTime,
      is_active: is_active === false ? 0 : 1,
      // First run: the next occurrence of the preferred time (or right away).
      next_run_at: computeInitialRunAt(preferredTime, timeZone),
      created_by: getUserId(event) || 'system',
    });

    await mysql.end();
    return success({ id: result.insertId });
  } catch (err) {
    console.error('Error creating evergreen item:', err);
    return error(500, `Failed to create evergreen item: ${err.message}`);
  }
}

async function handlePut(event) {
  try {
    const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    const {
      id,
      text_content,
      twitter_text,
      image_url,
      link_url,
      platforms,
      cadence,
      preferred_time,
      is_active,
    } = body;

    if (!id) {
      return error(400, 'id is required');
    }

    const existing = await mysql.query('SELECT id, preferred_time FROM social_evergreen WHERE id = ?', [id]);
    if (existing.length === 0) {
      await mysql.end();
      return error(404, 'Evergreen item not found');
    }

    const updates = {};
    if (text_content !== undefined) {
      if (!text_content || !text_content.trim()) return error(400, 'text_content cannot be empty');
      updates.text_content = text_content.trim();
    }
    if (twitter_text !== undefined) {
      updates.twitter_text = twitter_text && twitter_text.trim() ? twitter_text.trim() : null;
    }
    if (image_url !== undefined) updates.image_url = image_url || null;
    if (link_url !== undefined) updates.link_url = link_url || null;
    if (platforms !== undefined) updates.platforms = platforms ? JSON.stringify(platforms) : null;
    if (is_active !== undefined) updates.is_active = is_active ? 1 : 0;

    if (cadence !== undefined) {
      if (!VALID_CADENCES.includes(cadence)) {
        return error(400, `cadence must be one of: ${VALID_CADENCES.join(', ')}`);
      }
      updates.cadence = cadence;
    }

    const parsedTime = normalizePreferredTime(preferred_time);
    if (parsedTime.error) return error(400, parsedTime.error);
    if (parsedTime.provided) updates.preferred_time = parsedTime.value;

    // A schedule change restarts the cycle from the next preferred slot.
    if (cadence !== undefined || parsedTime.provided) {
      const settings = await loadSettings(mysql);
      const timeZone = settings?.blackout?.timezone || 'America/New_York';
      updates.next_run_at = computeInitialRunAt(
        parsedTime.provided ? parsedTime.value : existing[0].preferred_time,
        timeZone
      );
    }

    if (Object.keys(updates).length === 0) {
      return error(400, 'No valid fields to update');
    }

    await mysql.query('UPDATE social_evergreen SET ? WHERE id = ?', [updates, id]);
    await mysql.end();

    return success({ id, updated: true });
  } catch (err) {
    console.error('Error updating evergreen item:', err);
    return error(500, `Failed to update evergreen item: ${err.message}`);
  }
}

async function handleDelete(event) {
  try {
    const itemId = event.queryStringParameters?.id;
    if (!itemId) {
      return error(400, 'id query parameter is required');
    }

    const existing = await mysql.query('SELECT id FROM social_evergreen WHERE id = ?', [itemId]);
    if (existing.length === 0) {
      await mysql.end();
      return error(404, 'Evergreen item not found');
    }

    await mysql.query('DELETE FROM social_evergreen WHERE id = ?', [itemId]);
    await mysql.end();

    return success({ id: parseInt(itemId), deleted: true });
  } catch (err) {
    console.error('Error deleting evergreen item:', err);
    return error(500, `Failed to delete evergreen item: ${err.message}`);
  }
}
