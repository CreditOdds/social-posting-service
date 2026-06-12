-- Add the @card_wire X account as a distinct posting target.
-- SUB updates are routed here by queuing with platforms: ["twitter_cardwire"].

-- Allow the new platform key on both tables that constrain platform via ENUM.
ALTER TABLE social_accounts
  MODIFY platform ENUM('twitter', 'reddit', 'facebook', 'instagram', 'linkedin', 'twitter_cardwire') NOT NULL;

ALTER TABLE social_post_results
  MODIFY platform ENUM('twitter', 'reddit', 'facebook', 'instagram', 'linkedin', 'twitter_cardwire') NOT NULL;

-- Seed the account row (active + connected so the publisher will target it).
INSERT INTO social_accounts (platform, display_name, is_active, is_connected) VALUES
  ('twitter_cardwire', '@card_wire', 1, 1) AS new
ON DUPLICATE KEY UPDATE display_name = new.display_name, is_active = 1, is_connected = 1;
