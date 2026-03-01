/**
 * Firebase Token Authorizer for API Gateway
 * Same pattern as the creditodds main API.
 */

const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    projectId: process.env.FIREBASE_PROJECT_ID || 'creditodds',
  });
}

function generatePolicy(principalId, effect, resource, context = {}) {
  const policy = {
    principalId,
    policyDocument: {
      Version: '2012-10-17',
      Statement: [{
        Action: 'execute-api:Invoke',
        Effect: effect,
        Resource: resource,
      }],
    },
  };

  if (Object.keys(context).length > 0) {
    policy.context = context;
  }

  return policy;
}

exports.firebaseAuthorizerHandler = async (event) => {
  const authHeader = event.authorizationToken || event.headers?.Authorization || event.headers?.authorization;

  if (!authHeader) {
    throw new Error('Unauthorized');
  }

  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : authHeader;

  if (!token) {
    throw new Error('Unauthorized');
  }

  try {
    const decodedToken = await admin.auth().verifyIdToken(token);

    const resourceArn = event.methodArn
      ? event.methodArn.split('/').slice(0, 2).join('/') + '/*'
      : '*';

    const context = {
      sub: decodedToken.uid,
      email: decodedToken.email || '',
      email_verified: String(decodedToken.email_verified || false),
      name: decodedToken.name || '',
      admin: String(decodedToken.admin || false),
    };

    return generatePolicy(decodedToken.uid, 'Allow', resourceArn, context);
  } catch (error) {
    console.error('Token verification failed:', error.message);
    throw new Error('Unauthorized');
  }
};
