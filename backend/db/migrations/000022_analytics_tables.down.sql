-- Migration 000022 down: Drop analytics tables

DROP TABLE IF EXISTS performance_reports;
DROP TABLE IF EXISTS metric_alerts;
DROP TABLE IF EXISTS risk_scores;
DROP TABLE IF EXISTS weekly_metrics;
DROP TABLE IF EXISTS daily_metrics;
DROP TABLE IF EXISTS task_status_snapshots;
DROP TABLE IF EXISTS task_state_transitions;
DROP TABLE IF EXISTS analytics_events;
