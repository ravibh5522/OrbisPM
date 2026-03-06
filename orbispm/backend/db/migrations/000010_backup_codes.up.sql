-- Backup / recovery codes stored locally (Zitadel v2 has this unimplemented).
-- Each code is bcrypt-hashed; one-time use.
CREATE TABLE IF NOT EXISTS user_backup_codes (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code_hash   TEXT        NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_user_backup_codes_user ON user_backup_codes(user_id);
