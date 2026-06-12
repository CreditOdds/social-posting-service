/**
 * Reddit "platform" — publishes to the S3 feed polled by the Devvit app.
 *
 * Reddit's Data API no longer grants access to new apps, so posting happens
 * through a Devvit app installed on the subreddit (see devvit/ at the repo
 * root). This adapter writes the post to a JSON feed in S3; the Devvit app
 * polls the feed every 10 minutes and submits anything new via
 * reddit.submitPost.
 *
 * If REDDIT_FEED_BUCKET is not configured, falls back to the old manual
 * flow: a pre-filled submit URL the admin opens and clicks "Post" on.
 *
 * @param {object} params
 * @param {string} params.text - Post body (used as title or selftext)
 * @param {string} [params.linkUrl] - URL for link post
 * @returns {Promise<{postId?: string, postUrl: string, manual: boolean}>}
 */

const crypto = require('crypto');
const { appendFeedItem } = require('../reddit-feed');

async function post({ text, linkUrl }) {
  const subreddit = process.env.REDDIT_SUBREDDIT || 'creditodds';
  const title = text.length > 300 ? text.substring(0, 297) + '...' : text;

  if (!process.env.REDDIT_FEED_BUCKET) {
    return manualSubmitUrl({ subreddit, title, text, linkUrl });
  }

  const item = {
    id: crypto.randomUUID(),
    kind: linkUrl ? 'link' : 'self',
    title,
    url: linkUrl || null,
    text: linkUrl ? '' : text,
    createdAt: new Date().toISOString(),
  };

  await appendFeedItem(item);

  return {
    postId: item.id,
    postUrl: `https://www.reddit.com/r/${subreddit}/`,
    manual: false,
  };
}

function manualSubmitUrl({ subreddit, title, text, linkUrl }) {
  const params = new URLSearchParams({ title });

  if (linkUrl) {
    params.set('url', linkUrl);
  } else {
    params.set('selftext', text);
  }

  return {
    postUrl: `https://www.reddit.com/r/${encodeURIComponent(subreddit)}/submit?${params.toString()}`,
    manual: true,
  };
}

module.exports = { post };
