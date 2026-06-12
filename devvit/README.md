# creditoddsposter

A Devvit app that automatically posts CreditOdds sign-up bonus updates to the
subreddit it is installed in (r/creditodds).

## How it works

The [social posting service](../README.md) publishes a small JSON feed of
pending Reddit posts to S3. Every 10 minutes a scheduled task in this app
fetches that feed, skips anything it has already posted (tracked in Redis),
and submits at most one new post per run via the Reddit API.

There is no inbound webhook into Devvit apps, so the feed is pull-based:

```
bonus increase → social queue → Lambda publisher → S3 feed JSON
                                                      ↑
                            this app (cron, every 10 min) → reddit.submitPost
```

Moderators can also trigger a check manually via the subreddit menu item
**"Check bonus feed now"**.

On the very first run after install, the app marks every item already in the
feed as seen without posting, so installing it never dumps a backlog into the
subreddit.

## Fetch Domains

The following domains are requested for this app:

- `creditodds-reddit-feed.s3.us-east-2.amazonaws.com` - Read-only fetch of a small JSON
  feed (list of pending post titles/links) published by CreditOdds' own
  posting pipeline. S3 is used because Devvit apps cannot fetch personal
  domains; this is asset/data hosting per the approved provider list.

## Setup

1. `npm install`
2. `npm run login` (authenticate the Devvit CLI with the Reddit account that
   moderates r/creditodds)
3. The playtest target subreddit is `devvit.json` → `dev.subreddit`
   (r/creditoddsposter_dev, auto-created by Devvit on first upload).
4. `npm run dev` to playtest. The first playtest/upload submits the S3 domain
   for allowlist review.
5. Set the feed URL secret (requires at least one installation, i.e. after
   the first playtest):

   ```bash
   npx devvit settings set feedUrl
   # value: https://creditodds-reddit-feed.s3.us-east-2.amazonaws.com/feed/<token>.json
   ```

6. `npm run deploy` to upload, then install the app on r/creditodds from
   https://developers.reddit.com (your apps → creditoddsposter → install).

Posts are submitted by the app account (u/creditoddsposter). Add it as an
approved submitter in r/creditodds (or whitelist it in AutoModerator) so its
posts are not filtered.

## Operational notes

- Dedupe state lives in the app's Redis, keyed `posted:<feed item id>`.
- At most one post per cron run; multiple simultaneous bonus updates drain
  one per 10 minutes.
- Cron and menu failures surface in app logs: `npx devvit logs`.
