/**
 * Reddit "platform" — generates a pre-filled submit URL for manual posting.
 *
 * Reddit's Data API isn't available to a commercial brand (see #17, which
 * removed the failed Devvit approach), so nothing is posted automatically.
 * This module returns `manual: true` with a URL that opens Reddit's composer
 * pre-filled; the publisher records it as a `pending_manual` result and the
 * web UI renders it as a "Post now" link.
 *
 * Text handling: the first line of the post text is the Reddit title, the
 * remainder (if any) is the selftext body. Posts with a body become self
 * posts, with `linkUrl` appended to the body; a title-only post with a
 * `linkUrl` becomes a link post.
 *
 * Env vars: REDDIT_SUBREDDIT (defaults to 'creditodds')
 *
 * @param {object} params
 * @param {string} params.text - Post text (first line = title, rest = body)
 * @param {string} [params.linkUrl] - URL to include
 * @returns {Promise<{postUrl: string, manual: boolean}>}
 */

// Reddit rejects titles over 300 characters.
const TITLE_MAX = 300;

async function post({ text, linkUrl }) {
  const subreddit = process.env.REDDIT_SUBREDDIT || 'creditodds';

  const newlineIndex = text.indexOf('\n');
  const rawTitle = (newlineIndex === -1 ? text : text.slice(0, newlineIndex)).trim();
  const title = rawTitle.length > TITLE_MAX ? `${rawTitle.slice(0, TITLE_MAX - 3)}...` : rawTitle;
  const body = newlineIndex === -1 ? '' : text.slice(newlineIndex + 1).trim();

  const params = new URLSearchParams({ title });

  if (body || !linkUrl) {
    // Self post. `selftext=true` + `text` pre-fill old.reddit's composer,
    // `type=TEXT` + `text` the current one.
    params.set('selftext', 'true');
    params.set('type', 'TEXT');
    const selftext = [body, linkUrl].filter(Boolean).join('\n\n');
    if (selftext) params.set('text', selftext);
  } else {
    params.set('url', linkUrl);
  }

  const submitUrl = `https://www.reddit.com/r/${encodeURIComponent(subreddit)}/submit?${params.toString()}`;

  return {
    postUrl: submitUrl,
    manual: true,
  };
}

module.exports = { post };
