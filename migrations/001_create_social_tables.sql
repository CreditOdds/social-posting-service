-- Social Media Posting Service Tables
-- Run against the existing CreditOdds MySQL database

-- Post queue
CREATE TABLE IF NOT EXISTS social_posts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  text_content TEXT NOT NULL,
  image_url VARCHAR(500) DEFAULT NULL,
  link_url VARCHAR(500) DEFAULT NULL,
  source_type ENUM('manual', 'news', 'article', 'api') NOT NULL DEFAULT 'manual',
  source_id VARCHAR(255) DEFAULT NULL,
  status ENUM('draft', 'queued', 'posting', 'posted', 'failed', 'cancelled') NOT NULL DEFAULT 'draft',
  scheduled_at DATETIME DEFAULT NULL,
  posted_at DATETIME DEFAULT NULL,
  platforms JSON DEFAULT NULL COMMENT 'e.g. ["twitter","reddit"]. NULL = all active platforms',
  created_by VARCHAR(128) NOT NULL DEFAULT 'system',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_status (status),
  INDEX idx_scheduled (status, scheduled_at),
  INDEX idx_source (source_type, source_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Per-platform posting results
CREATE TABLE IF NOT EXISTS social_post_results (
  id INT AUTO_INCREMENT PRIMARY KEY,
  post_id INT NOT NULL,
  platform ENUM('twitter', 'reddit', 'facebook', 'instagram', 'linkedin') NOT NULL,
  status ENUM('pending', 'success', 'failed') NOT NULL DEFAULT 'pending',
  platform_post_id VARCHAR(255) DEFAULT NULL,
  platform_post_url VARCHAR(500) DEFAULT NULL,
  error_message TEXT DEFAULT NULL,
  attempted_at DATETIME DEFAULT NULL,
  FOREIGN KEY (post_id) REFERENCES social_posts(id) ON DELETE CASCADE,
  INDEX idx_post_platform (post_id, platform)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Platform account configuration
CREATE TABLE IF NOT EXISTS social_accounts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  platform ENUM('twitter', 'reddit', 'facebook', 'instagram', 'linkedin') NOT NULL UNIQUE,
  display_name VARCHAR(255) DEFAULT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 0,
  is_connected TINYINT(1) NOT NULL DEFAULT 0,
  config JSON DEFAULT NULL COMMENT 'Platform-specific settings',
  token_expires_at DATETIME DEFAULT NULL,
  last_error TEXT DEFAULT NULL,
  last_posted_at DATETIME DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed platform rows
INSERT INTO social_accounts (platform, display_name, is_active, is_connected) VALUES
  ('twitter', '@creditodds', 1, 1),
  ('reddit', 'r/creditodds', 0, 0),
  ('facebook', 'CreditOdds', 0, 0),
  ('instagram', '@creditodds', 0, 0),
  ('linkedin', 'CreditOdds', 0, 0)
ON DUPLICATE KEY UPDATE platform = platform;
