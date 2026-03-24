-- Additional indexes for org-scoped listing queries
CREATE INDEX IF NOT EXISTS idx_webhooks_org ON webhooks(org_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_org ON api_keys(org_id);
CREATE INDEX IF NOT EXISTS idx_import_jobs_project ON import_jobs(project_id);

-- Comments: frequently listed by task
CREATE INDEX IF NOT EXISTS idx_comments_task ON comments(task_id, created_at);
