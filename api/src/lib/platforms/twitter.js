const { postToTwitter } = require('./twitter-core');

/**
 * Post to the primary X account (@creditodds).
 */
async function post({ text, linkUrl, imagePath }) {
  return postToTwitter({
    creds: {
      appKey: process.env.TWITTER_API_KEY,
      appSecret: process.env.TWITTER_API_SECRET,
      accessToken: process.env.TWITTER_ACCESS_TOKEN,
      accessSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET,
    },
    handle: process.env.TWITTER_HANDLE || 'creditodds',
    text,
    linkUrl,
    imagePath,
  });
}

module.exports = { post };
