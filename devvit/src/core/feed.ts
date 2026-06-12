import { context, reddit, redis, settings } from '@devvit/web/server';

export type FeedItem = {
  id: string;
  kind: 'link' | 'self';
  title: string;
  url?: string | null;
  text?: string;
  createdAt?: string;
};

export type Feed = {
  version: number;
  updatedAt?: string;
  items: FeedItem[];
};

export type CheckResult = {
  posted: string[];
  pending: number;
  note?: string;
};

// One post per run; the 10-minute cron provides natural spacing when
// several bonus updates land in the feed at once.
const MAX_POSTS_PER_RUN = 1;
const REDDIT_TITLE_MAX = 300;

const postedKey = (id: string): string => `posted:${id}`;

export async function checkFeed(): Promise<CheckResult> {
  const feedUrl = (await settings.get('feedUrl')) as string | undefined;
  if (!feedUrl) {
    return { posted: [], pending: 0, note: 'feedUrl is not set (npx devvit settings set feedUrl)' };
  }

  const response = await fetch(feedUrl);
  if (!response.ok) {
    throw new Error(`Feed fetch failed: HTTP ${response.status}`);
  }
  const feed = (await response.json()) as Feed;
  const items = (Array.isArray(feed.items) ? feed.items : []).filter(
    (item) => item && item.id && item.title
  );

  // First run after install: mark everything already in the feed as seen so
  // the app doesn't dump the backlog into the subreddit.
  const bootstrapped = await redis.get('bootstrapped');
  if (!bootstrapped) {
    for (const item of items) {
      await redis.set(postedKey(item.id), 'bootstrap');
    }
    await redis.set('bootstrapped', new Date().toISOString());
    return {
      posted: [],
      pending: 0,
      note: `bootstrapped: marked ${items.length} existing item(s) as seen`,
    };
  }

  const unposted: FeedItem[] = [];
  for (const item of items) {
    const seen = await redis.get(postedKey(item.id));
    if (!seen) {
      unposted.push(item);
    }
  }
  // The feed is newest-first; publish in chronological order.
  unposted.reverse();

  const subredditName = context.subredditName;
  if (!subredditName) {
    throw new Error('No subreddit in context');
  }

  const posted: string[] = [];
  for (const item of unposted.slice(0, MAX_POSTS_PER_RUN)) {
    const title =
      item.title.length > REDDIT_TITLE_MAX
        ? `${item.title.slice(0, REDDIT_TITLE_MAX - 3)}...`
        : item.title;

    const post =
      item.kind === 'link' && item.url
        ? await reddit.submitPost({ subredditName, title, url: item.url })
        : await reddit.submitPost({ subredditName, title, text: item.text || item.title });

    await redis.set(postedKey(item.id), post.id);
    posted.push(item.id);
    console.log(`Posted feed item ${item.id} as ${post.id}`);
  }

  return { posted, pending: unposted.length - posted.length };
}

export function summarize(result: CheckResult): string {
  if (result.note) return result.note;
  if (result.posted.length === 0 && result.pending === 0) return 'No new feed items.';
  return `Posted ${result.posted.length} item(s), ${result.pending} still queued.`;
}
