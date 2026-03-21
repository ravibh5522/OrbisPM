-- Remove system message columns
ALTER TABLE messages DROP COLUMN IF EXISTS system_metadata;
ALTER TABLE messages DROP COLUMN IF EXISTS system_type;
ALTER TABLE messages DROP COLUMN IF EXISTS is_system;

-- Drop user category states
DROP TABLE IF EXISTS user_category_states;

-- Remove channel columns
ALTER TABLE channels DROP COLUMN IF EXISTS position;
ALTER TABLE channels DROP COLUMN IF EXISTS category_id;

-- Drop channel categories
DROP TABLE IF EXISTS channel_categories;
