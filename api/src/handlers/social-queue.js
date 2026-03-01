/**
 * Social Queue Handler (API-key auth, no Firebase)
 * POST /social/queue - Queue a new post from CI/CD pipelines
 *
 * Authenticated via x-api-key header (SOCIAL_API_KEY env var).
 */

const mysql = require('../lib/db');
const { success, error, options } = require('../lib/response');

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
    const { text_content, image_url, link_url, source_type, source_id, platforms } = body;

    if (!text_content || !text_content.trim()) {
      return error(400, 'text_content is required');
    }

    const validSourceTypes = ['news', 'article', 'api'];
    const finalSourceType = validSourceTypes.includes(source_type) ? source_type : 'api';

    const result = await mysql.query('INSERT INTO social_posts SET ?', {
      text_content: text_content.trim(),
      image_url: image_url || null,
      link_url: link_url || null,
      source_type: finalSourceType,
      source_id: source_id || null,
      status: 'queued',
      platforms: platforms ? JSON.stringify(platforms) : null,
      created_by: 'system',
    });

    await mysql.end();

    return success({ id: result.insertId, status: 'queued' });
  } catch (err) {
    console.error('Error queuing post:', err);
    return error(500, `Failed to queue post: ${err.message}`);
  }
};
