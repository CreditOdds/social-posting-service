-- Add optional per-platform text override for Twitter
ALTER TABLE social_posts
  ADD COLUMN twitter_text TEXT DEFAULT NULL AFTER text_content;
