const DEFAULT_SETTINGS = {
  blackout: {
    enabled: false,
    start: '21:00',
    end: '07:00',
    timezone: 'America/New_York',
  },
  queue: {
    min_gap_minutes: 0,
  },
};

function mergeSettings(raw) {
  if (!raw || typeof raw !== 'object') return DEFAULT_SETTINGS;
  const blackout = {
    ...DEFAULT_SETTINGS.blackout,
    ...(raw.blackout && typeof raw.blackout === 'object' ? raw.blackout : {}),
  };
  const queue = {
    ...DEFAULT_SETTINGS.queue,
    ...(raw.queue && typeof raw.queue === 'object' ? raw.queue : {}),
  };
  return {
    ...DEFAULT_SETTINGS,
    ...raw,
    blackout,
    queue,
  };
}

async function loadSettings(mysql) {
  try {
    const rows = await mysql.query(
      'SELECT setting_value FROM social_settings WHERE setting_key = ? LIMIT 1',
      ['global']
    );
    if (!rows || rows.length === 0) {
      return DEFAULT_SETTINGS;
    }
    const raw = typeof rows[0].setting_value === 'string'
      ? JSON.parse(rows[0].setting_value)
      : rows[0].setting_value;
    return mergeSettings(raw);
  } catch (err) {
    if (err && err.code === 'ER_NO_SUCH_TABLE') {
      return DEFAULT_SETTINGS;
    }
    throw err;
  }
}

module.exports = { DEFAULT_SETTINGS, mergeSettings, loadSettings };
