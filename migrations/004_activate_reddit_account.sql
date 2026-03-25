-- Reddit no longer requires API credentials (uses pre-filled submit URLs),
-- so mark it as active and connected so the scheduler includes it.
UPDATE social_accounts
SET is_active = 1, is_connected = 1
WHERE platform = 'reddit';
