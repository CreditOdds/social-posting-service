-- Retry tracking, partial-failure status, explicit blackout exemption,
-- idempotent enqueueing, and the missing pending_manual result status.

-- 'partial' = some platforms succeeded, retries exhausted on the rest.
ALTER TABLE social_posts
  MODIFY status ENUM('draft', 'queued', 'posting', 'posted', 'failed', 'cancelled', 'partial') NOT NULL DEFAULT 'draft',
  ADD COLUMN attempt_count INT NOT NULL DEFAULT 0,
  ADD COLUMN next_attempt_at DATETIME DEFAULT NULL,
  ADD COLUMN last_error TEXT DEFAULT NULL,
  ADD COLUMN blackout_exempt TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN idempotency_key VARCHAR(128) DEFAULT NULL,
  ADD UNIQUE INDEX idx_idempotency (idempotency_key);

-- The publisher has always written 'pending_manual' for manual platforms
-- (LinkedIn), but the ENUM never allowed it.
ALTER TABLE social_post_results
  MODIFY status ENUM('pending', 'success', 'failed', 'pending_manual') NOT NULL DEFAULT 'pending';

-- Card-wire posts were previously identified by sniffing the platforms JSON
-- inside the scheduler query; they now carry an explicit flag. Backfill any
-- not-yet-published card-wire posts.
UPDATE social_posts
SET blackout_exempt = 1
WHERE status IN ('draft', 'queued', 'failed')
  AND JSON_CONTAINS(platforms, '"twitter_cardwire"');
