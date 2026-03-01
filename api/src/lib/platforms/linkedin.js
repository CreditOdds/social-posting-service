/**
 * Post to LinkedIn using the API v2.
 * Uses Organization posts (company page), not personal profiles.
 *
 * Env vars: LINKEDIN_ACCESS_TOKEN, LINKEDIN_ORG_ID
 * Note: LinkedIn OAuth 2.0 tokens expire every 60 days.
 *
 * @param {object} params
 * @param {string} params.text - Post body
 * @param {string} [params.linkUrl] - URL to share as article
 * @returns {Promise<{postId: string, postUrl: string}>}
 */
async function post({ text, linkUrl }) {
  const accessToken = process.env.LINKEDIN_ACCESS_TOKEN;
  const orgId = process.env.LINKEDIN_ORG_ID;

  if (!accessToken || !orgId) {
    throw new Error('LINKEDIN_ACCESS_TOKEN and LINKEDIN_ORG_ID are required');
  }

  const author = `urn:li:organization:${orgId}`;

  const postBody = {
    author,
    lifecycleState: 'PUBLISHED',
    specificContent: {
      'com.linkedin.ugc.ShareContent': {
        shareCommentary: { text },
        shareMediaCategory: linkUrl ? 'ARTICLE' : 'NONE',
      },
    },
    visibility: {
      'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
    },
  };

  if (linkUrl) {
    postBody.specificContent['com.linkedin.ugc.ShareContent'].media = [
      {
        status: 'READY',
        originalUrl: linkUrl,
      },
    ];
  }

  const response = await fetch('https://api.linkedin.com/v2/ugcPosts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify(postBody),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`LinkedIn API error: ${errorData.message || response.statusText}`);
  }

  const postId = response.headers.get('x-restli-id') || '';

  return {
    postId,
    postUrl: postId ? `https://www.linkedin.com/feed/update/${postId}` : '',
  };
}

module.exports = { post };
