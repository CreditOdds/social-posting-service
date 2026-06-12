const { postToTwitter } = require('./twitter-core');

/**
 * Post to the @card_wire X account (used for SUB updates).
 *
 * @card_wire has its own Developer App, so it uses its own app key/secret AND
 * access token/secret. If you instead reuse the shared app (TWITTER_API_KEY /
 * TWITTER_API_SECRET), leave TWITTER_CARDWIRE_API_KEY / _SECRET unset and only
 * the access token/secret below are account-specific.
 */
async function post({ text, linkUrl, imagePath }) {
  return postToTwitter({
    creds: {
      appKey: process.env.TWITTER_CARDWIRE_API_KEY || process.env.TWITTER_API_KEY,
      appSecret: process.env.TWITTER_CARDWIRE_API_SECRET || process.env.TWITTER_API_SECRET,
      accessToken: process.env.TWITTER_CARDWIRE_ACCESS_TOKEN,
      accessSecret: process.env.TWITTER_CARDWIRE_ACCESS_TOKEN_SECRET,
    },
    handle: process.env.TWITTER_CARDWIRE_HANDLE || 'card_wire',
    text,
    linkUrl,
    imagePath,
  });
}

module.exports = { post };
