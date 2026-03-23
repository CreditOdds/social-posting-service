/**
 * Reddit "platform" — generates a pre-filled submit URL.
 *
 * Reddit no longer grants API access to new apps, so instead of posting
 * via the API we build a URL that opens Reddit's submit page with the
 * title, body, and subreddit pre-filled. The user just clicks "Post".
 *
 * @param {object} params
 * @param {string} params.text - Post body (used as title or selftext)
 * @param {string} [params.linkUrl] - URL for link post
 * @returns {Promise<{postUrl: string, manual: boolean}>}
 */
async function post({ text, linkUrl }) {
  const subreddit = process.env.REDDIT_SUBREDDIT || 'creditodds';
  const title = text.length > 300 ? text.substring(0, 297) + '...' : text;

  const params = new URLSearchParams({
    title,
  });

  if (linkUrl) {
    params.set('url', linkUrl);
  } else {
    params.set('selftext', text);
  }

  const submitUrl = `https://www.reddit.com/r/${encodeURIComponent(subreddit)}/submit?${params.toString()}`;

  return {
    postUrl: submitUrl,
    manual: true,
  };
}

module.exports = { post };
