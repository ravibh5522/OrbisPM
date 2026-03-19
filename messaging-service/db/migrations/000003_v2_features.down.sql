-- Reverse 000003_v2_features.up.sql
DROP TABLE IF EXISTS scheduled_messages;
ALTER TABLE channel_members DROP COLUMN IF EXISTS notification_pref;
ALTER TABLE messages DROP COLUMN IF EXISTS entity_mentions;
DROP INDEX IF EXISTS idx_channels_auto_source;
ALTER TABLE channels DROP COLUMN IF EXISTS read_only;
ALTER TABLE channels DROP COLUMN IF EXISTS auto_source_id;
ALTER TABLE channels DROP COLUMN IF EXISTS auto_source;
ALTER TABLE channels DROP COLUMN IF EXISTS is_auto_managed;
