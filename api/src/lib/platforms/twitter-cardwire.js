const { postToTwitter } = require('./twitter-core');

/**
 * Card-wire SUB updates post to the main @creditodds X account.
 *
 * The dedicated @card_wire account is retired; posts publish with the shared
 * TWITTER_* credentials. The `twitter_cardwire` platform is kept as a distinct
 * identifier so card-wire posts retain their special handling (priority 200,
 * immediate publish, blackout bypass).
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
