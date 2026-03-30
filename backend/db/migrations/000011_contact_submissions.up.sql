CREATE TABLE IF NOT EXISTS public.contact_submissions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT        NOT NULL,
    email       TEXT        NOT NULL,
    company     TEXT        NOT NULL DEFAULT '',
    message     TEXT        NOT NULL,
    ip_address  TEXT        NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contact_submissions_created_at ON public.contact_submissions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contact_submissions_email ON public.contact_submissions (email);
