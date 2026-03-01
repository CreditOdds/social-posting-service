/**
 * Post to Instagram using the Graph API (container → publish flow).
 * Requires a public image URL — Instagram does not support text-only posts.
 *
 * Env vars: INSTAGRAM_ACCOUNT_ID, FACEBOOK_PAGE_ACCESS_TOKEN (same token)
 *
 * @param {object} params
 * @param {string} params.text - Caption text
 * @param {string} [params.linkUrl] - Appended to caption (Instagram doesn't support clickable links in captions)
 * @param {string} params.imageUrl - Public URL for image (required)
 * @returns {Promise<{postId: string, postUrl: string}>}
 */
async function post({ text, linkUrl, imageUrl }) {
  const accountId = process.env.INSTAGRAM_ACCOUNT_ID;
  const accessToken = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;

  if (!accountId || !accessToken) {
    throw new Error('INSTAGRAM_ACCOUNT_ID and FACEBOOK_PAGE_ACCESS_TOKEN are required');
  }

  if (!imageUrl) {
    throw new Error('Instagram requires an image URL');
  }

  const caption = linkUrl ? `${text}\n\n${linkUrl}` : text;

  // Step 1: Create media container
  const containerResponse = await fetch(
    `https://graph.facebook.com/v19.0/${accountId}/media`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image_url: imageUrl,
        caption,
        access_token: accessToken,
      }),
    }
  );

  if (!containerResponse.ok) {
    const errorData = await containerResponse.json();
    throw new Error(`Instagram container error: ${errorData.error?.message || containerResponse.statusText}`);
  }

  const containerData = await containerResponse.json();
  const containerId = containerData.id;

  // Step 2: Publish the container
  const publishResponse = await fetch(
    `https://graph.facebook.com/v19.0/${accountId}/media_publish`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        creation_id: containerId,
        access_token: accessToken,
      }),
    }
  );

  if (!publishResponse.ok) {
    const errorData = await publishResponse.json();
    throw new Error(`Instagram publish error: ${errorData.error?.message || publishResponse.statusText}`);
  }

  const publishData = await publishResponse.json();

  return {
    postId: publishData.id,
    postUrl: `https://instagram.com/p/${publishData.id}`,
  };
}

module.exports = { post };
