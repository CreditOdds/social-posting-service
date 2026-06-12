import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { createServer, getServerPort } from '@devvit/web/server';
import { checkFeed, summarize } from './core/feed';

const app = new Hono();

// Recurring job declared in devvit.json (every 10 minutes).
app.post('/internal/cron/check-feed', async (c) => {
  try {
    const result = await checkFeed();
    console.log('check-feed:', JSON.stringify(result));
  } catch (err) {
    console.error('check-feed failed:', err instanceof Error ? err.message : err);
  }
  return c.json({ status: 'ok' }, 200);
});

// Mod-only subreddit menu item for manual runs and setup verification.
app.post('/internal/menu/check-feed', async (c) => {
  try {
    const result = await checkFeed();
    return c.json({ showToast: { text: summarize(result) } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ showToast: { text: `Feed check failed: ${message}` } });
  }
});

serve({
  fetch: app.fetch,
  createServer,
  port: getServerPort(),
});
