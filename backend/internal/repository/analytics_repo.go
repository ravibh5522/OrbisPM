package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/orbispm/orbispm/internal/domain"
)

type analyticsRepo struct {
	pool *pgxpool.Pool
}

// NewAnalyticsRepo creates a new AnalyticsRepository backed by PostgreSQL.
func NewAnalyticsRepo(pool *pgxpool.Pool) AnalyticsRepository {
	return &analyticsRepo{pool: pool}
}

// --- Analytics Events ---

func (r *analyticsRepo) CreateEvent(ctx context.Context, tx pgx.Tx, e *domain.AnalyticsEvent) error {
	q := conn(r.pool, tx)
	_, err := q.Exec(ctx,
		`INSERT INTO analytics_events (org_id, event_type, actor_id, entity_type, entity_id, project_id, team_id, data)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
		e.OrgID, e.EventType, e.ActorID, e.EntityType, e.EntityID, e.ProjectID, e.TeamID, e.Data)
	if err != nil {
		return fmt.Errorf("create analytics event: %w", err)
	}
	return nil
}

func (r *analyticsRepo) ListEvents(ctx context.Context, orgID uuid.UUID, eventType string, from, to time.Time, limit, offset int) ([]*domain.AnalyticsEvent, int, error) {
	if limit <= 0 {
		limit = 50
	}

	var total int
	err := r.pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM analytics_events WHERE org_id = $1 AND event_type = $2 AND created_at BETWEEN $3 AND $4`,
		orgID, eventType, from, to).Scan(&total)
	if err != nil {
		return nil, 0, fmt.Errorf("count analytics events: %w", err)
	}

	rows, err := r.pool.Query(ctx,
		`SELECT id, org_id, event_type, actor_id, entity_type, entity_id, project_id, team_id, data, created_at
		 FROM analytics_events WHERE org_id = $1 AND event_type = $2 AND created_at BETWEEN $3 AND $4
		 ORDER BY created_at DESC LIMIT $5 OFFSET $6`,
		orgID, eventType, from, to, limit, offset)
	if err != nil {
		return nil, 0, fmt.Errorf("list analytics events: %w", err)
	}
	defer rows.Close()

	var events []*domain.AnalyticsEvent
	for rows.Next() {
		var e domain.AnalyticsEvent
		if err := rows.Scan(&e.ID, &e.OrgID, &e.EventType, &e.ActorID, &e.EntityType, &e.EntityID, &e.ProjectID, &e.TeamID, &e.Data, &e.CreatedAt); err != nil {
			return nil, 0, err
		}
		events = append(events, &e)
	}
	return events, total, rows.Err()
}

// --- Task State Transitions ---

func (r *analyticsRepo) CreateTransition(ctx context.Context, tx pgx.Tx, t *domain.TaskStateTransition) error {
	q := conn(r.pool, tx)
	_, err := q.Exec(ctx,
		`INSERT INTO task_state_transitions (org_id, task_id, project_id, from_status, to_status, actor_id, transitioned_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
		t.OrgID, t.TaskID, t.ProjectID, t.FromStatus, t.ToStatus, t.ActorID, t.TransitionedAt)
	if err != nil {
		return fmt.Errorf("create transition: %w", err)
	}
	return nil
}

func (r *analyticsRepo) ListTransitionsByTask(ctx context.Context, taskID uuid.UUID) ([]*domain.TaskStateTransition, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, org_id, task_id, project_id, from_status, to_status, actor_id, transitioned_at
		 FROM task_state_transitions WHERE task_id = $1 ORDER BY transitioned_at`, taskID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanTransitions(rows)
}

func (r *analyticsRepo) ListTransitionsByProject(ctx context.Context, projectID uuid.UUID, from, to time.Time) ([]*domain.TaskStateTransition, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, org_id, task_id, project_id, from_status, to_status, actor_id, transitioned_at
		 FROM task_state_transitions WHERE project_id = $1 AND transitioned_at BETWEEN $2 AND $3
		 ORDER BY transitioned_at`, projectID, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanTransitions(rows)
}

func scanTransitions(rows pgx.Rows) ([]*domain.TaskStateTransition, error) {
	var result []*domain.TaskStateTransition
	for rows.Next() {
		var t domain.TaskStateTransition
		if err := rows.Scan(&t.ID, &t.OrgID, &t.TaskID, &t.ProjectID, &t.FromStatus, &t.ToStatus, &t.ActorID, &t.TransitionedAt); err != nil {
			return nil, err
		}
		result = append(result, &t)
	}
	return result, rows.Err()
}

// --- Task Status Snapshots ---

func (r *analyticsRepo) UpsertSnapshot(ctx context.Context, tx pgx.Tx, s *domain.TaskStatusSnapshot) error {
	q := conn(r.pool, tx)
	_, err := q.Exec(ctx,
		`INSERT INTO task_status_snapshots (org_id, project_id, snapshot_date, todo_count, in_progress_count, blocked_count, done_count, total_count)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		 ON CONFLICT (org_id, project_id, snapshot_date) DO UPDATE SET
		   todo_count = EXCLUDED.todo_count,
		   in_progress_count = EXCLUDED.in_progress_count,
		   blocked_count = EXCLUDED.blocked_count,
		   done_count = EXCLUDED.done_count,
		   total_count = EXCLUDED.total_count`,
		s.OrgID, s.ProjectID, s.SnapshotDate, s.TodoCount, s.InProgressCount, s.BlockedCount, s.DoneCount, s.TotalCount)
	if err != nil {
		return fmt.Errorf("upsert snapshot: %w", err)
	}
	return nil
}

func (r *analyticsRepo) ListSnapshots(ctx context.Context, projectID uuid.UUID, from, to time.Time) ([]*domain.TaskStatusSnapshot, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, org_id, project_id, snapshot_date, todo_count, in_progress_count, blocked_count, done_count, total_count, created_at
		 FROM task_status_snapshots WHERE project_id = $1 AND snapshot_date BETWEEN $2 AND $3
		 ORDER BY snapshot_date`, projectID, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []*domain.TaskStatusSnapshot
	for rows.Next() {
		var s domain.TaskStatusSnapshot
		if err := rows.Scan(&s.ID, &s.OrgID, &s.ProjectID, &s.SnapshotDate, &s.TodoCount, &s.InProgressCount, &s.BlockedCount, &s.DoneCount, &s.TotalCount, &s.CreatedAt); err != nil {
			return nil, err
		}
		result = append(result, &s)
	}
	return result, rows.Err()
}

// --- Daily Metrics ---

func (r *analyticsRepo) UpsertDailyMetric(ctx context.Context, tx pgx.Tx, m *domain.DailyMetric) error {
	q := conn(r.pool, tx)
	_, err := q.Exec(ctx,
		`INSERT INTO daily_metrics (org_id, metric_date, scope_type, scope_id, metrics)
		 VALUES ($1, $2, $3, $4, $5)
		 ON CONFLICT (org_id, metric_date, scope_type, scope_id) DO UPDATE SET metrics = EXCLUDED.metrics`,
		m.OrgID, m.MetricDate, m.ScopeType, m.ScopeID, m.Metrics)
	if err != nil {
		return fmt.Errorf("upsert daily metric: %w", err)
	}
	return nil
}

func (r *analyticsRepo) ListDailyMetrics(ctx context.Context, scopeType string, scopeID uuid.UUID, from, to time.Time) ([]*domain.DailyMetric, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, org_id, metric_date, scope_type, scope_id, metrics, created_at
		 FROM daily_metrics WHERE scope_type = $1 AND scope_id = $2 AND metric_date BETWEEN $3 AND $4
		 ORDER BY metric_date`, scopeType, scopeID, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []*domain.DailyMetric
	for rows.Next() {
		var m domain.DailyMetric
		if err := rows.Scan(&m.ID, &m.OrgID, &m.MetricDate, &m.ScopeType, &m.ScopeID, &m.Metrics, &m.CreatedAt); err != nil {
			return nil, err
		}
		result = append(result, &m)
	}
	return result, rows.Err()
}

// --- Weekly Metrics ---

func (r *analyticsRepo) UpsertWeeklyMetric(ctx context.Context, tx pgx.Tx, m *domain.WeeklyMetric) error {
	q := conn(r.pool, tx)
	_, err := q.Exec(ctx,
		`INSERT INTO weekly_metrics (org_id, metric_date, scope_type, scope_id, metrics)
		 VALUES ($1, $2, $3, $4, $5)
		 ON CONFLICT (org_id, metric_date, scope_type, scope_id) DO UPDATE SET metrics = EXCLUDED.metrics`,
		m.OrgID, m.MetricDate, m.ScopeType, m.ScopeID, m.Metrics)
	if err != nil {
		return fmt.Errorf("upsert weekly metric: %w", err)
	}
	return nil
}

func (r *analyticsRepo) ListWeeklyMetrics(ctx context.Context, scopeType string, scopeID uuid.UUID, from, to time.Time) ([]*domain.WeeklyMetric, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, org_id, metric_date, scope_type, scope_id, metrics, created_at
		 FROM weekly_metrics WHERE scope_type = $1 AND scope_id = $2 AND metric_date BETWEEN $3 AND $4
		 ORDER BY metric_date`, scopeType, scopeID, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []*domain.WeeklyMetric
	for rows.Next() {
		var m domain.WeeklyMetric
		if err := rows.Scan(&m.ID, &m.OrgID, &m.MetricDate, &m.ScopeType, &m.ScopeID, &m.Metrics, &m.CreatedAt); err != nil {
			return nil, err
		}
		result = append(result, &m)
	}
	return result, rows.Err()
}

// --- Risk Scores ---

func (r *analyticsRepo) UpsertRiskScore(ctx context.Context, tx pgx.Tx, rs *domain.RiskScore) error {
	q := conn(r.pool, tx)
	_, err := q.Exec(ctx,
		`INSERT INTO risk_scores (org_id, task_id, risk_level, risk_score, factors, predicted_completion, updated_at)
		 VALUES ($1, $2, $3, $4, $5, $6, now())
		 ON CONFLICT (org_id, task_id) DO UPDATE SET
		   risk_level = EXCLUDED.risk_level,
		   risk_score = EXCLUDED.risk_score,
		   factors = EXCLUDED.factors,
		   predicted_completion = EXCLUDED.predicted_completion,
		   updated_at = now()`,
		rs.OrgID, rs.TaskID, rs.RiskLevel, rs.RiskScoreValue, rs.Factors, rs.PredictedCompletion)
	if err != nil {
		return fmt.Errorf("upsert risk score: %w", err)
	}
	return nil
}

func (r *analyticsRepo) ListRiskScores(ctx context.Context, orgID uuid.UUID, minLevel string, limit int) ([]*domain.RiskScore, error) {
	if limit <= 0 {
		limit = 20
	}
	rows, err := r.pool.Query(ctx,
		`SELECT id, org_id, task_id, risk_level, risk_score, factors, predicted_completion, updated_at
		 FROM risk_scores WHERE org_id = $1 AND risk_level >= $2
		 ORDER BY risk_score DESC LIMIT $3`,
		orgID, minLevel, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []*domain.RiskScore
	for rows.Next() {
		var rs domain.RiskScore
		if err := rows.Scan(&rs.ID, &rs.OrgID, &rs.TaskID, &rs.RiskLevel, &rs.RiskScoreValue, &rs.Factors, &rs.PredictedCompletion, &rs.UpdatedAt); err != nil {
			return nil, err
		}
		result = append(result, &rs)
	}
	return result, rows.Err()
}

func (r *analyticsRepo) GetRiskScore(ctx context.Context, taskID uuid.UUID) (*domain.RiskScore, error) {
	var rs domain.RiskScore
	err := r.pool.QueryRow(ctx,
		`SELECT id, org_id, task_id, risk_level, risk_score, factors, predicted_completion, updated_at
		 FROM risk_scores WHERE task_id = $1`, taskID).
		Scan(&rs.ID, &rs.OrgID, &rs.TaskID, &rs.RiskLevel, &rs.RiskScoreValue, &rs.Factors, &rs.PredictedCompletion, &rs.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &rs, nil
}

// --- Metric Alerts ---

func (r *analyticsRepo) CreateAlert(ctx context.Context, tx pgx.Tx, a *domain.MetricAlert) error {
	q := conn(r.pool, tx)
	_, err := q.Exec(ctx,
		`INSERT INTO metric_alerts (org_id, alert_type, severity, scope_type, scope_id, title, description, data)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
		a.OrgID, a.AlertType, a.Severity, a.ScopeType, a.ScopeID, a.Title, a.Description, a.Data)
	if err != nil {
		return fmt.Errorf("create alert: %w", err)
	}
	return nil
}

func (r *analyticsRepo) ListActiveAlerts(ctx context.Context, orgID uuid.UUID, limit int) ([]*domain.MetricAlert, error) {
	if limit <= 0 {
		limit = 20
	}
	rows, err := r.pool.Query(ctx,
		`SELECT id, org_id, alert_type, severity, scope_type, scope_id, title, description, data, acknowledged_at, acknowledged_by, created_at
		 FROM metric_alerts WHERE org_id = $1 AND acknowledged_at IS NULL
		 ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END, created_at DESC
		 LIMIT $2`,
		orgID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []*domain.MetricAlert
	for rows.Next() {
		var a domain.MetricAlert
		if err := rows.Scan(&a.ID, &a.OrgID, &a.AlertType, &a.Severity, &a.ScopeType, &a.ScopeID, &a.Title, &a.Description, &a.Data, &a.AcknowledgedAt, &a.AcknowledgedBy, &a.CreatedAt); err != nil {
			return nil, err
		}
		result = append(result, &a)
	}
	return result, rows.Err()
}

func (r *analyticsRepo) AcknowledgeAlert(ctx context.Context, tx pgx.Tx, alertID, userID uuid.UUID) error {
	q := conn(r.pool, tx)
	_, err := q.Exec(ctx,
		`UPDATE metric_alerts SET acknowledged_at = now(), acknowledged_by = $2 WHERE id = $1`,
		alertID, userID)
	if err != nil {
		return fmt.Errorf("acknowledge alert: %w", err)
	}
	return nil
}

// --- Performance Reports ---

func (r *analyticsRepo) CreateReport(ctx context.Context, tx pgx.Tx, rp *domain.PerformanceReport) (*domain.PerformanceReport, error) {
	q := conn(r.pool, tx)
	err := q.QueryRow(ctx,
		`INSERT INTO performance_reports (org_id, report_type, scope_type, scope_id, parameters, status, generated_by)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)
		 RETURNING id, created_at`,
		rp.OrgID, rp.ReportType, rp.ScopeType, rp.ScopeID, rp.Parameters, rp.Status, rp.GeneratedBy).
		Scan(&rp.ID, &rp.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("create report: %w", err)
	}
	return rp, nil
}

func (r *analyticsRepo) UpdateReport(ctx context.Context, tx pgx.Tx, rp *domain.PerformanceReport) error {
	q := conn(r.pool, tx)
	_, err := q.Exec(ctx,
		`UPDATE performance_reports SET status = $2, storage_path = $3, generated_at = $4, expires_at = $5 WHERE id = $1`,
		rp.ID, rp.Status, rp.StoragePath, rp.GeneratedAt, rp.ExpiresAt)
	if err != nil {
		return fmt.Errorf("update report: %w", err)
	}
	return nil
}

func (r *analyticsRepo) GetReport(ctx context.Context, id uuid.UUID) (*domain.PerformanceReport, error) {
	var rp domain.PerformanceReport
	err := r.pool.QueryRow(ctx,
		`SELECT id, org_id, report_type, scope_type, scope_id, parameters, status, storage_path, generated_by, generated_at, expires_at, created_at
		 FROM performance_reports WHERE id = $1`, id).
		Scan(&rp.ID, &rp.OrgID, &rp.ReportType, &rp.ScopeType, &rp.ScopeID, &rp.Parameters, &rp.Status, &rp.StoragePath, &rp.GeneratedBy, &rp.GeneratedAt, &rp.ExpiresAt, &rp.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &rp, nil
}

func (r *analyticsRepo) ListReports(ctx context.Context, orgID uuid.UUID, limit, offset int) ([]*domain.PerformanceReport, int, error) {
	if limit <= 0 {
		limit = 20
	}

	var total int
	err := r.pool.QueryRow(ctx, `SELECT COUNT(*) FROM performance_reports WHERE org_id = $1`, orgID).Scan(&total)
	if err != nil {
		return nil, 0, err
	}

	rows, err := r.pool.Query(ctx,
		`SELECT id, org_id, report_type, scope_type, scope_id, parameters, status, storage_path, generated_by, generated_at, expires_at, created_at
		 FROM performance_reports WHERE org_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
		orgID, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var result []*domain.PerformanceReport
	for rows.Next() {
		var rp domain.PerformanceReport
		if err := rows.Scan(&rp.ID, &rp.OrgID, &rp.ReportType, &rp.ScopeType, &rp.ScopeID, &rp.Parameters, &rp.Status, &rp.StoragePath, &rp.GeneratedBy, &rp.GeneratedAt, &rp.ExpiresAt, &rp.CreatedAt); err != nil {
			return nil, 0, err
		}
		result = append(result, &rp)
	}
	return result, total, rows.Err()
}

// --- Aggregation Queries (for service-layer KPI computation) ---

func (r *analyticsRepo) CountTasksByStatusForOrg(ctx context.Context, orgID uuid.UUID) (map[string]int, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT status, COUNT(*) FROM tasks WHERE org_id = $1 GROUP BY status`, orgID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make(map[string]int)
	for rows.Next() {
		var status string
		var count int
		if err := rows.Scan(&status, &count); err != nil {
			return nil, err
		}
		result[status] = count
	}
	return result, rows.Err()
}

func (r *analyticsRepo) CountTasksByStatusForProject(ctx context.Context, projectID uuid.UUID) (map[string]int, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT status, COUNT(*) FROM tasks WHERE project_id = $1 GROUP BY status`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make(map[string]int)
	for rows.Next() {
		var status string
		var count int
		if err := rows.Scan(&status, &count); err != nil {
			return nil, err
		}
		result[status] = count
	}
	return result, rows.Err()
}

func (r *analyticsRepo) CountCompletedInRange(ctx context.Context, projectID uuid.UUID, from, to time.Time) (int, error) {
	var count int
	err := r.pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM task_state_transitions
		 WHERE project_id = $1 AND to_status = 'done' AND transitioned_at BETWEEN $2 AND $3`,
		projectID, from, to).Scan(&count)
	return count, err
}

func (r *analyticsRepo) CountCreatedInRange(ctx context.Context, projectID uuid.UUID, from, to time.Time) (int, error) {
	var count int
	err := r.pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM tasks
		 WHERE project_id = $1 AND created_at BETWEEN $2 AND $3`,
		projectID, from, to).Scan(&count)
	return count, err
}

func (r *analyticsRepo) GetAvgCycleTime(ctx context.Context, projectID uuid.UUID, days int) (float64, error) {
	var avg *float64
	err := r.pool.QueryRow(ctx,
		`SELECT AVG(EXTRACT(EPOCH FROM (done_at.transitioned_at - started_at.transitioned_at)) / 3600)
		 FROM task_state_transitions done_at
		 JOIN task_state_transitions started_at ON done_at.task_id = started_at.task_id
		 WHERE done_at.project_id = $1
		   AND done_at.to_status = 'done'
		   AND started_at.to_status = 'in_progress'
		   AND done_at.transitioned_at > now() - ($2::TEXT || ' days')::INTERVAL
		   AND started_at.transitioned_at = (
		     SELECT MIN(t2.transitioned_at) FROM task_state_transitions t2
		     WHERE t2.task_id = done_at.task_id AND t2.to_status = 'in_progress'
		   )`,
		projectID, days).Scan(&avg)
	if err != nil {
		return 0, err
	}
	if avg == nil {
		return 0, nil
	}
	return *avg, nil
}

func (r *analyticsRepo) GetOverdueTaskCountForOrg(ctx context.Context, orgID uuid.UUID) (int, error) {
	var count int
	err := r.pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM tasks WHERE org_id = $1 AND due_date < now() AND status != 'done'`, orgID).Scan(&count)
	return count, err
}

func (r *analyticsRepo) GetWorkloadByProject(ctx context.Context, projectID uuid.UUID) ([]*domain.WorkloadDistribution, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT
		   u.id,
		   COALESCE(u.display_name, u.email, u.id::TEXT),
		   COUNT(*) FILTER (WHERE t.status != 'done') as task_count,
		   COUNT(*) FILTER (WHERE t.status = 'done') as done_count,
		   COUNT(*) FILTER (WHERE t.due_date < now() AND t.status != 'done') as overdue_count,
		   0 as story_points
		 FROM tasks t
		 JOIN users u ON u.id = ANY(t.assignee_ids)
		 WHERE t.project_id = $1
		 GROUP BY u.id, u.display_name, u.email
		 ORDER BY task_count DESC`,
		projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []*domain.WorkloadDistribution
	for rows.Next() {
		var w domain.WorkloadDistribution
		if err := rows.Scan(&w.UserID, &w.DisplayName, &w.TaskCount, &w.DoneCount, &w.OverdueCount, &w.StoryPoints); err != nil {
			return nil, err
		}
		result = append(result, &w)
	}
	return result, rows.Err()
}

func (r *analyticsRepo) GetVelocityTrend(ctx context.Context, projectID uuid.UUID, days int) ([]*domain.VelocityPoint, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT
		   d::DATE as date,
		   COALESCE((
		     SELECT COUNT(*) FROM task_state_transitions
		     WHERE project_id = $1 AND to_status = 'done' AND transitioned_at::DATE = d::DATE
		   ), 0) as completed,
		   COALESCE((
		     SELECT COUNT(*) FROM tasks WHERE project_id = $1 AND created_at::DATE = d::DATE
		   ), 0) as created
		 FROM generate_series(now() - ($2::TEXT || ' days')::INTERVAL, now(), '1 day'::INTERVAL) d
		 ORDER BY d`,
		projectID, days)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []*domain.VelocityPoint
	for rows.Next() {
		var v domain.VelocityPoint
		var date time.Time
		if err := rows.Scan(&date, &v.Completed, &v.Created); err != nil {
			return nil, err
		}
		v.Date = date.Format("2006-01-02")
		result = append(result, &v)
	}
	return result, rows.Err()
}

func (r *analyticsRepo) GetOrgVelocityTrend(ctx context.Context, orgID uuid.UUID, days int) ([]*domain.VelocityPoint, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT
		   d::DATE as date,
		   COALESCE((
		     SELECT COUNT(*) FROM task_state_transitions
		     WHERE org_id = $1 AND to_status = 'done' AND transitioned_at::DATE = d::DATE
		   ), 0) as completed,
		   COALESCE((
		     SELECT COUNT(*) FROM tasks WHERE org_id = $1 AND created_at::DATE = d::DATE
		   ), 0) as created
		 FROM generate_series(now() - ($2::TEXT || ' days')::INTERVAL, now(), '1 day'::INTERVAL) d
		 ORDER BY d`,
		orgID, days)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []*domain.VelocityPoint
	for rows.Next() {
		var v domain.VelocityPoint
		var date time.Time
		if err := rows.Scan(&date, &v.Completed, &v.Created); err != nil {
			return nil, err
		}
		v.Date = date.Format("2006-01-02")
		result = append(result, &v)
	}
	return result, rows.Err()
}
