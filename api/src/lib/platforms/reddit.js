const snoowrap = require('snoowrap');

/**
 * Post to Reddit using script-type OAuth.
 * Posts as a link post to r/creditodds.
 *
 * Env vars: REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, REDDIT_USERNAME, REDDIT_PASSWORD
 *
 * @param {object} params
 * @param {string} params.text - Post body (used as title or selftext)
 * @param {string} [params.linkUrl] - URL for link post
 * @returns {Promise<{postId: string, postUrl: string}>}
 */
async function post({ text, linkUrl }) {
  const r = new snoowrap({
    userAgent: 'CreditOdds Social Poster v1.0',
    clientId: process.env.REDDIT_CLIENT_ID,
    clientSecret: process.env.REDDIT_CLIENT_SECRET,
    username: process.env.REDDIT_USERNAME,
    password: process.env.REDDIT_PASSWORD,
  });

  const subreddit = process.env.REDDIT_SUBREDDIT || 'creditodds';
  let submission;

  if (linkUrl) {
    // Link post with the text as the title
    submission = await r.getSubreddit(subreddit).submitLink({
      title: text,
      url: linkUrl,
    });
  } else {
    // Self/text post
    submission = await r.getSubreddit(subreddit).submitSelfpost({
      title: text.length > 300 ? text.substring(0, 297) + '...' : text,
      text: text,
    });
  }

  return {
    postId: submission.name,
    postUrl: `https://reddit.com${submission.permalink}`,
  };
}

module.exports = { post };
