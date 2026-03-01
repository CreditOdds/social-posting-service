// Fallback admin user IDs (Firebase UIDs) - same as creditodds main API
const FALLBACK_ADMIN_IDS = ['zXOyHmGl7HStyAqEdLsgXLA5inS2'];

function isAdmin(event) {
  const userId = event.requestContext?.authorizer?.sub;
  const adminClaim = event.requestContext?.authorizer?.admin;

  if (adminClaim === 'true') {
    return true;
  }

  return FALLBACK_ADMIN_IDS.includes(userId);
}

function getUserId(event) {
  return event.requestContext?.authorizer?.sub || null;
}

module.exports = { isAdmin, getUserId };
