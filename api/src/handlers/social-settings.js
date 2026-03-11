/**
 * Social Settings Handler
 * GET /social/settings - Fetch global settings
 * PUT /social/settings - Update global settings
 */

const mysql = require('../lib/db');
const { isAdmin } = require('../lib/admin-check');
const { success, error, options } = require('../lib/response');
const { DEFAULT_SETTINGS, mergeSettings, loadSettings } = require('../lib/settings');
const { parseTimeToMinutes } = require('../lib/blackout');

function parseNonNegativeInt(value, fieldName) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0) {
    return `${fieldName} must be a non-negative integer`;
  }
  return null;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return options();

  if (!isAdmin(event)) {
    return error(403, 'Forbidden: Admin access required');
  }

  switch (event.httpMethod) {
    case 'GET':
      return handleGet();
    case 'PUT':
      return handlePut(event);
    default:
      return error(405, `Method ${event.httpMethod} not allowed`);
  }
};

async function handleGet() {
  try {
    const settings = await loadSettings(mysql);
    await mysql.end();
    return success({ settings });
  } catch (err) {
    console.error('Error fetching settings:', err);
    return error(500, `Failed to fetch settings: ${err.message}`);
  }
}

async function handlePut(event) {
  try {
    const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    const current = await loadSettings(mysql);
    const next = mergeSettings({ ...current, ...body });

    if (next.blackout) {
      if (parseTimeToMinutes(next.blackout.start) === null) {
        return error(400, 'blackout.start must be in HH:MM (24h) format');
      }
      if (parseTimeToMinutes(next.blackout.end) === null) {
        return error(400, 'blackout.end must be in HH:MM (24h) format');
      }
      if (!next.blackout.timezone || !String(next.blackout.timezone).trim()) {
        return error(400, 'blackout.timezone is required');
      }
    } else {
      next.blackout = DEFAULT_SETTINGS.blackout;
    }

    if (next.queue) {
      const queueGapError = parseNonNegativeInt(next.queue.min_gap_minutes, 'queue.min_gap_minutes');
      if (queueGapError) {
        return error(400, queueGapError);
      }
    } else {
      next.queue = DEFAULT_SETTINGS.queue;
    }

    await mysql.query(
      'INSERT INTO social_settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)',
      ['global', JSON.stringify(next)]
    );
    await mysql.end();
    return success({ settings: next });
  } catch (err) {
    console.error('Error updating settings:', err);
    return error(500, `Failed to update settings: ${err.message}`);
  }
}
