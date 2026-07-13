-- 008: Re-activate the Reddit account for the manual posting flow.
--
-- platforms/reddit.js is back as a manual "platform": publishing builds a
-- pre-filled reddit.com submit URL and records it as pending_manual; a human
-- clicks "Post now" in the web UI. is_connected=1 here means "configured",
-- not "holds API credentials" — there are none.
--
-- Reddit is opt-in only in post-publisher (like twitter_cardwire), so
-- activating it does NOT add it to the default fan-out; only posts that
-- explicitly list "reddit" in `platforms` reach it.

UPDATE social_accounts
SET is_active = 1, is_connected = 1
WHERE platform = 'reddit';
