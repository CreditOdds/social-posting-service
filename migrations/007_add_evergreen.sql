-- Evergreen content pool. Each item re-enqueues itself on its own cadence;
-- the scheduler materializes due items into social_posts as normal queue rows.

CREATE TABLE IF NOT EXISTS social_evergreen (
  id INT AUTO_INCREMENT PRIMARY KEY,
  text_content TEXT NOT NULL,
  twitter_text TEXT DEFAULT NULL,
  image_url VARCHAR(500) DEFAULT NULL,
  link_url VARCHAR(500) DEFAULT NULL,
  platforms JSON DEFAULT NULL COMMENT 'NULL = all active platforms',
  cadence ENUM('daily', 'weekly', 'monthly') NOT NULL DEFAULT 'weekly',
  preferred_time TIME DEFAULT NULL COMMENT 'Local time-of-day (settings blackout timezone) to enqueue',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  times_used INT NOT NULL DEFAULT 0,
  last_enqueued_at DATETIME DEFAULT NULL,
  next_run_at DATETIME DEFAULT NULL,
  created_by VARCHAR(128) NOT NULL DEFAULT 'system',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_due (is_active, next_run_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Track queue rows back to the evergreen item that produced them.
ALTER TABLE social_posts
  MODIFY source_type ENUM('manual', 'news', 'article', 'api', 'evergreen') NOT NULL DEFAULT 'manual';
