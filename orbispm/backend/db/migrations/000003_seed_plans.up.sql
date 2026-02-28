-- Seed billing plans
INSERT INTO billing_plans (id, name, stripe_price_id, limits) VALUES
('free', 'Free', NULL, '{"max_teams": 1, "max_projects": 3, "max_members": 5, "max_subtask_depth": 3, "ai_reviews_per_month": 10, "storage_gb": 1, "max_templates": 5, "max_webhooks": 1, "max_api_keys": 1}'),
('pro', 'Pro', NULL, '{"max_teams": -1, "max_projects": -1, "max_members": -1, "max_subtask_depth": 5, "ai_reviews_per_month": 500, "storage_gb": 50, "max_templates": -1, "max_webhooks": 10, "max_api_keys": 5}'),
('enterprise', 'Enterprise', NULL, '{"max_teams": -1, "max_projects": -1, "max_members": -1, "max_subtask_depth": 5, "ai_reviews_per_month": -1, "storage_gb": -1, "max_templates": -1, "max_webhooks": -1, "max_api_keys": -1}')
ON CONFLICT (id) DO NOTHING;
