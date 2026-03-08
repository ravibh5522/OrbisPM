-- User profile cache table to store Zitadel user info locally.
-- This avoids runtime queries to Zitadel's internal schema which has a
-- different schema than the old GoTrue auth.users table.
CREATE TABLE IF NOT EXISTS users (
    id          UUID        PRIMARY KEY,    -- SHA1 UUID derived from Zitadel user ID
    email       TEXT        NOT NULL DEFAULT '',
    display_name TEXT       NOT NULL DEFAULT '',
    phone       TEXT        NOT NULL DEFAULT '',
    avatar_url  TEXT        NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
