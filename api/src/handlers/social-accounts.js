/**
 * Social Accounts Handler
 * GET /social/accounts - List all platform accounts
 * PUT /social/accounts - Update account settings (toggle active, update config)
 */

const mysql = require('../lib/db');
const { isAdmin } = require('../lib/admin-check');
const { success, error, options } = require('../lib/response');

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
    const accounts = await mysql.query(`
      SELECT a.*,
        (SELECT COUNT(*) FROM social_post_results r
         WHERE r.platform = a.platform AND r.status = 'success') as total_posts,
        (SELECT COUNT(*) FROM social_post_results r
         WHERE r.platform = a.platform AND r.status = 'failed') as total_failures
      FROM social_accounts a
      ORDER BY a.platform
    `);
    await mysql.end();

    const parsed = accounts.map(a => ({
      ...a,
      config: typeof a.config === 'string' ? JSON.parse(a.config) : (a.config || {}),
    }));

    return success({ accounts: parsed });
  } catch (err) {
    console.error('Error fetching accounts:', err);
    return error(500, `Failed to fetch accounts: ${err.message}`);
  }
}

async function handlePut(event) {
  try {
    const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    const { platform, is_active, is_connected, display_name, config } = body;

    if (!platform) {
      return error(400, 'platform is required');
    }

    const existing = await mysql.query('SELECT id FROM social_accounts WHERE platform = ?', [platform]);
    if (existing.length === 0) {
      return error(404, `Account for platform '${platform}' not found`);
    }

    const updates = {};
    if (is_active !== undefined) updates.is_active = is_active ? 1 : 0;
    if (is_connected !== undefined) updates.is_connected = is_connected ? 1 : 0;
    if (display_name !== undefined) updates.display_name = display_name;
    if (config !== undefined) updates.config = JSON.stringify(config);

    if (Object.keys(updates).length === 0) {
      return error(400, 'No valid fields to update');
    }

    await mysql.query('UPDATE social_accounts SET ? WHERE platform = ?', [updates, platform]);
    await mysql.end();

    return success({ platform, updated: true });
  } catch (err) {
    console.error('Error updating account:', err);
    return error(500, `Failed to update account: ${err.message}`);
  }
}
