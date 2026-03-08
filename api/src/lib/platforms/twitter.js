const { TwitterApi } = require('twitter-api-v2');
const fs = require('fs');

/**
 * Post to Twitter/X.
 * Supports text-only and text+image posts.
 * If a link is provided, the link is posted as a reply to the main tweet.
 *
 * @param {object} params
 * @param {string} params.text - Post body
 * @param {string} [params.linkUrl] - URL to post in a reply tweet
 * @param {string} [params.imagePath] - Local path to image file (downloaded from S3 to /tmp)
 * @returns {Promise<{postId: string, postUrl: string}>}
 */
async function post({ text, linkUrl, imagePath }) {
  const client = new TwitterApi({
    appKey: process.env.TWITTER_API_KEY,
    appSecret: process.env.TWITTER_API_SECRET,
    accessToken: process.env.TWITTER_ACCESS_TOKEN,
    accessSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET,
  });

  const tweetOptions = {};

  // Upload image if provided
  if (imagePath && fs.existsSync(imagePath)) {
    const mediaId = await client.v1.uploadMedia(imagePath);
    tweetOptions.media = { media_ids: [mediaId] };
  }

  const { data } = await client.v2.tweet(text, tweetOptions);

  // Keep links out of the primary tweet and add them as a threaded reply.
  if (linkUrl) {
    await client.v2.tweet(linkUrl, {
      reply: {
        in_reply_to_tweet_id: data.id,
      },
    });
  }

  return {
    postId: data.id,
    postUrl: `https://x.com/creditodds/status/${data.id}`,
  };
}

module.exports = { post };
