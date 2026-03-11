-- Add queue priority and spacing controls
ALTER TABLE social_posts
  ADD COLUMN priority INT NOT NULL DEFAULT 0,
  ADD COLUMN queue_group VARCHAR(64) DEFAULT NULL,
  ADD COLUMN min_gap_minutes INT DEFAULT NULL;

CREATE INDEX idx_queue ON social_posts (status, priority, scheduled_at, created_at);
CREATE INDEX idx_queue_group ON social_posts (queue_group, status, posted_at);
