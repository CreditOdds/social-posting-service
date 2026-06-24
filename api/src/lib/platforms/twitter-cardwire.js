const { postToTwitter } = require('./twitter-core');

/**
 * Card-wire SUB updates now post to the main @creditodds X account.
 *
 * The `twitter_cardwire` platform is kept as a distinct identifier so card-wire
 * posts retain their special handling (priority 200, immediate publish, blackout
 * bypass), but the credentials and handle default to the shared @creditodds
 * account. The TWITTER_CARDWIRE_* env vars remain as optional overrides if a
 * dedicated account is ever wired back up.
 */
async function post({ text, linkUrl, imagePath }) {
  return postToTwitter({
    creds: {
      appKey: process.env.TWITTER_CARDWIRE_API_KEY || process.env.TWITTER_API_KEY,
      appSecret: process.env.TWITTER_CARDWIRE_API_SECRET || process.env.TWITTER_API_SECRET,
      accessToken: process.env.TWITTER_CARDWIRE_ACCESS_TOKEN || process.env.TWITTER_ACCESS_TOKEN,
      accessSecret: process.env.TWITTER_CARDWIRE_ACCESS_TOKEN_SECRET || process.env.TWITTER_ACCESS_TOKEN_SECRET,
    },
    handle: process.env.TWITTER_CARDWIRE_HANDLE || process.env.TWITTER_HANDLE || 'creditodds',
    text,
    linkUrl,
    imagePath,
  });
}

module.exports = { post };
