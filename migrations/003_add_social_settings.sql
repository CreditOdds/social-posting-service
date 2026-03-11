-- Global social settings (e.g., blackout windows)
CREATE TABLE IF NOT EXISTS social_settings (
  setting_key VARCHAR(64) PRIMARY KEY,
  setting_value JSON NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO social_settings (setting_key, setting_value)
VALUES (
  'global',
  JSON_OBJECT(
    'blackout', JSON_OBJECT(
      'enabled', true,
      'start', '21:00',
      'end', '07:00',
      'timezone', 'America/New_York'
    )
  )
)
ON DUPLICATE KEY UPDATE setting_key = setting_key;
