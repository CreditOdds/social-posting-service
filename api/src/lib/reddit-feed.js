/**
 * Reddit feed writer.
 *
 * Publishes pending Reddit posts as a JSON feed in S3. The Devvit app
 * installed on r/creditodds polls this feed (Devvit apps cannot receive
 * inbound webhooks, and personal domains like creditodds.com are not
 * allowlistable for Devvit fetch — but *.s3.amazonaws.com is).
 */

const AWS = require('aws-sdk');

const s3 = new AWS.S3();

// The Devvit app dedupes by item id, so old entries only need to stick
// around long enough to survive a few polling cycles.
const MAX_ITEMS = 25;

function feedKey() {
  const token = process.env.REDDIT_FEED_TOKEN || 'public';
  return `feed/${token}.json`;
}

/**
 * Append an item to the feed (newest first), creating the feed if missing.
 *
 * @param {object} item
 * @param {string} item.id - Unique id the Devvit app dedupes on
 * @param {'link'|'self'} item.kind
 * @param {string} item.title
 * @param {string|null} item.url
 * @param {string} item.text
 * @param {string} item.createdAt - ISO timestamp
 * @returns {Promise<object>} The updated feed
 */
async function appendFeedItem(item) {
  const bucket = process.env.REDDIT_FEED_BUCKET;
  if (!bucket) {
    throw new Error('REDDIT_FEED_BUCKET is not configured');
  }

  let feed = { version: 1, items: [] };
  try {
    const existing = await s3.getObject({ Bucket: bucket, Key: feedKey() }).promise();
    feed = JSON.parse(existing.Body.toString('utf8'));
  } catch (err) {
    if (err.code !== 'NoSuchKey') throw err;
  }

  feed.items = [item, ...(feed.items || [])].slice(0, MAX_ITEMS);
  feed.updatedAt = new Date().toISOString();

  await s3
    .putObject({
      Bucket: bucket,
      Key: feedKey(),
      Body: JSON.stringify(feed, null, 2),
      ContentType: 'application/json',
      CacheControl: 'no-cache',
    })
    .promise();

  return feed;
}

module.exports = { appendFeedItem };
