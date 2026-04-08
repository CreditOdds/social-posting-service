/**
 * LinkedIn "platform" — generates a pre-filled share URL.
 *
 * LinkedIn OAuth tokens expire every 60 days, so instead of managing
 * API credentials we build a URL that opens LinkedIn's compose dialog
 * with the text pre-filled. The admin switches to the CreditOdds page
 * and clicks "Post".
 *
 * @param {object} params
 * @param {string} params.text - Post body
 * @param {string} [params.linkUrl] - URL to include
 * @returns {Promise<{postUrl: string, manual: boolean}>}
 */
async function post({ text, linkUrl }) {
  // LinkedIn's compose URL pre-fills the text in the share dialog.
  // The admin can switch to posting as the CreditOdds company page.
  const postText = linkUrl ? `${text}\n\n${linkUrl}` : text;

  const params = new URLSearchParams({
    shareActive: 'true',
    text: postText,
  });

  const submitUrl = `https://www.linkedin.com/feed/?${params.toString()}`;

  return {
    postUrl: submitUrl,
    manual: true,
  };
}

module.exports = { post };
