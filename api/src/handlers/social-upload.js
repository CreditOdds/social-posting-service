/**
 * Social Upload Handler
 * POST /social/upload - Generate a presigned S3 URL for image upload
 */

const AWS = require('aws-sdk');
const { isAdmin } = require('../lib/admin-check');
const { success, error, options } = require('../lib/response');

const s3 = new AWS.S3();

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return options();

  if (!isAdmin(event)) {
    return error(403, 'Forbidden: Admin access required');
  }

  if (event.httpMethod !== 'POST') {
    return error(405, `Method ${event.httpMethod} not allowed`);
  }

  try {
    const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    const { filename, content_type } = body;

    if (!filename || !content_type) {
      return error(400, 'filename and content_type are required');
    }

    // Validate content type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(content_type)) {
      return error(400, `Invalid content type. Allowed: ${allowedTypes.join(', ')}`);
    }

    const bucket = process.env.S3_BUCKET;
    if (!bucket) {
      return error(500, 'S3_BUCKET not configured');
    }

    // Generate unique key
    const ext = filename.split('.').pop();
    const key = `social-images/${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${ext}`;

    const presignedUrl = s3.getSignedUrl('putObject', {
      Bucket: bucket,
      Key: key,
      ContentType: content_type,
      Expires: 300, // 5 minutes
    });

    const cdnDomain = process.env.CDN_DOMAIN;
    const publicUrl = cdnDomain
      ? `https://${cdnDomain}/${key}`
      : `https://${bucket}.s3.amazonaws.com/${key}`;

    return success({
      upload_url: presignedUrl,
      public_url: publicUrl,
      key,
    });
  } catch (err) {
    console.error('Error generating upload URL:', err);
    return error(500, `Failed to generate upload URL: ${err.message}`);
  }
};
