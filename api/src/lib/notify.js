/**
 * Slack notifications via an incoming webhook (SLACK_WEBHOOK_URL).
 *
 * notify() never throws: a broken webhook must not break publishing. When no
 * webhook is configured the message is logged so it still shows in CloudWatch.
 */

const https = require('https');

function postWebhook(url, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const req = https.request(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
        timeout: 5000,
      },
      (res) => {
        res.resume();
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve();
        } else {
          reject(new Error(`Slack webhook returned ${res.statusCode}`));
        }
      }
    );
    req.on('timeout', () => req.destroy(new Error('Slack webhook timed out')));
    req.on('error', reject);
    req.end(body);
  });
}

async function notify(text) {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url) {
    console.log(`[notify] ${text}`);
    return;
  }
  try {
    await postWebhook(url, { text });
  } catch (err) {
    console.error('Slack notification failed:', err.message);
  }
}

function preview(text, maxLength = 80) {
  if (!text) return '';
  const clean = String(text).replace(/\s+/g, ' ').trim();
  return clean.length > maxLength ? `${clean.slice(0, maxLength)}…` : clean;
}

module.exports = { notify, preview };
