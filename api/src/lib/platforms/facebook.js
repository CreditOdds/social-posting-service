/**
 * Post to Facebook Page using Graph API.
 *
 * Env vars: FACEBOOK_PAGE_ID, FACEBOOK_PAGE_ACCESS_TOKEN
 *
 * @param {object} params
 * @param {string} params.text - Post body
 * @param {string} [params.linkUrl] - URL to share
 * @param {string} [params.imageUrl] - Public URL for image (CloudFront)
 * @returns {Promise<{postId: string, postUrl: string}>}
 */
async function post({ text, linkUrl, imageUrl }) {
  const pageId = process.env.FACEBOOK_PAGE_ID;
  const accessToken = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;

  if (!pageId || !accessToken) {
    throw new Error('FACEBOOK_PAGE_ID and FACEBOOK_PAGE_ACCESS_TOKEN are required');
  }

  let endpoint;
  let body;

  if (imageUrl) {
    // Photo post with caption
    endpoint = `https://graph.facebook.com/v19.0/${pageId}/photos`;
    body = {
      url: imageUrl,
      caption: linkUrl ? `${text}\n\n${linkUrl}` : text,
      access_token: accessToken,
    };
  } else {
    // Text/link post
    endpoint = `https://graph.facebook.com/v19.0/${pageId}/feed`;
    body = {
      message: text,
      access_token: accessToken,
    };
    if (linkUrl) {
      body.link = linkUrl;
    }
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`Facebook API error: ${errorData.error?.message || response.statusText}`);
  }

  const data = await response.json();
  const postId = data.id || data.post_id;

  return {
    postId,
    postUrl: `https://facebook.com/${postId}`,
  };
}

module.exports = { post };
