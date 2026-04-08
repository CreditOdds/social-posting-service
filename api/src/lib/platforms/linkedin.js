const fs = require('fs');

/**
 * Post to LinkedIn using the API v2.
 * Uses Organization posts (company page), not personal profiles.
 *
 * Supports text-only, text+image, and text+link posts.
 * If a link is provided, it is posted as a comment on the main post
 * (external URLs in the main post body cause de-boosting).
 *
 * Env vars: LINKEDIN_ACCESS_TOKEN, LINKEDIN_ORG_ID
 * Note: LinkedIn OAuth 2.0 tokens expire every 60 days.
 *
 * @param {object} params
 * @param {string} params.text - Post body
 * @param {string} [params.linkUrl] - URL to post as a comment
 * @param {string} [params.imagePath] - Local path to image file (downloaded to /tmp)
 * @returns {Promise<{postId: string, postUrl: string}>}
 */
async function post({ text, linkUrl, imagePath }) {
  const accessToken = process.env.LINKEDIN_ACCESS_TOKEN;
  const orgId = process.env.LINKEDIN_ORG_ID;

  if (!accessToken || !orgId) {
    throw new Error('LINKEDIN_ACCESS_TOKEN and LINKEDIN_ORG_ID are required');
  }

  const author = `urn:li:organization:${orgId}`;
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
    'X-Restli-Protocol-Version': '2.0.0',
  };

  // Upload image if provided
  let imageAsset = null;
  if (imagePath && fs.existsSync(imagePath)) {
    imageAsset = await uploadImage(imagePath, author, accessToken);
  }

  const shareContent = {
    shareCommentary: { text },
    shareMediaCategory: imageAsset ? 'IMAGE' : 'NONE',
  };

  if (imageAsset) {
    shareContent.media = [
      {
        status: 'READY',
        media: imageAsset,
      },
    ];
  }

  const postBody = {
    author,
    lifecycleState: 'PUBLISHED',
    specificContent: {
      'com.linkedin.ugc.ShareContent': shareContent,
    },
    visibility: {
      'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
    },
  };

  const response = await fetch('https://api.linkedin.com/v2/ugcPosts', {
    method: 'POST',
    headers,
    body: JSON.stringify(postBody),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`LinkedIn API error: ${errorData.message || response.statusText}`);
  }

  const postId = response.headers.get('x-restli-id') || '';

  // Post link as a comment on the main post
  if (linkUrl && postId) {
    const shareUrn = encodeURIComponent(postId);
    const commentResponse = await fetch(
      `https://api.linkedin.com/v2/socialActions/${shareUrn}/comments`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          actor: author,
          message: { text: linkUrl },
        }),
      }
    );

    if (!commentResponse.ok) {
      const commentError = await commentResponse.json().catch(() => ({}));
      console.error('LinkedIn comment error:', commentError.message || commentResponse.statusText);
    }
  }

  return {
    postId,
    postUrl: postId ? `https://www.linkedin.com/feed/update/${postId}` : '',
  };
}

/**
 * Register and upload an image to LinkedIn.
 * Returns the asset URN to reference in the post.
 */
async function uploadImage(imagePath, owner, accessToken) {
  // Step 1: Register upload
  const registerResponse = await fetch(
    'https://api.linkedin.com/v2/assets?action=registerUpload',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        registerUploadRequest: {
          owner,
          recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
          serviceRelationships: [
            {
              identifier: 'urn:li:userGeneratedContent',
              relationshipType: 'OWNER',
            },
          ],
        },
      }),
    }
  );

  if (!registerResponse.ok) {
    const errorData = await registerResponse.json().catch(() => ({}));
    throw new Error(`LinkedIn image register error: ${errorData.message || registerResponse.statusText}`);
  }

  const registerData = await registerResponse.json();
  const uploadUrl =
    registerData.value?.uploadMechanism?.[
      'com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'
    ]?.uploadUrl;
  const asset = registerData.value?.asset;

  if (!uploadUrl || !asset) {
    throw new Error('LinkedIn image register did not return upload URL or asset');
  }

  // Step 2: Upload image binary
  const imageBuffer = fs.readFileSync(imagePath);
  const uploadResponse = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/octet-stream',
    },
    body: imageBuffer,
  });

  if (!uploadResponse.ok) {
    throw new Error(`LinkedIn image upload error: ${uploadResponse.statusText}`);
  }

  return asset;
}

module.exports = { post };
