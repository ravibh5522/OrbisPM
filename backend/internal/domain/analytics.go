package domain

import (
	"time"

	"github.com/google/uuid"
)

// Scope types for metrics — reuses ScopeOrg, ScopeProject, ScopeTeam from permission.go.
const (
	ScopeMember = "member"
)

// Risk levels.
const (
	RiskLow      = "low"
	RiskMedium   = "medium"
	RiskHigh     = "high"
	RiskCritical = "critical"
)

// Alert severity levels.
const (
	AlertInfo     = "info"
	AlertWarning  = "warning"
	AlertCritical = "critical"
)

// Report statuses.
const (
	ReportPending    = "pending"
	ReportGenerating = "generating"
	ReportCompleted  = "completed"
	ReportFailed     = "failed"
)

// AnalyticsEvent represents a raw analytics event.
type AnalyticsEvent struct {
	ID         uuid.UUID      `json:"id"`
	OrgID      uuid.UUID      `json:"org_id"`
	EventType  string         `json:"event_type"`
	ActorID    uuid.UUID      `json:"actor_id"`
	EntityType string         `json:"entity_type"`
	EntityID   uuid.UUID      `json:"entity_id"`
	ProjectID  *uuid.UUID     `json:"project_id,omitempty"`
	TeamID     *uuid.UUID     `json:"team_id,omitempty"`
	Data       map[string]any `json:"data,omitempty"`
	CreatedAt  time.Time      `json:"created_at"`
}

// TaskStateTransition records a task status change.
type TaskStateTransition struct {
	ID             uuid.UUID `json:"id"`
	OrgID          uuid.UUID `json:"org_id"`
	TaskID         uuid.UUID `json:"task_id"`
	ProjectID      uuid.UUID `json:"project_id"`
	FromStatus     string    `json:"from_status"`
	ToStatus       string    `json:"to_status"`
	ActorID        uuid.UUID `json:"actor_id"`
	TransitionedAt time.Time `json:"transitioned_at"`
}

// TaskStatusSnapshot holds a daily snapshot of task counts per project.
type TaskStatusSnapshot struct {
	ID              uuid.UUID `json:"id"`
	OrgID           uuid.UUID `json:"org_id"`
	ProjectID       uuid.UUID `json:"project_id"`
	SnapshotDate    time.Time `json:"snapshot_date"`
	TodoCount       int       `json:"todo_count"`
	InProgressCount int       `json:"in_progress_count"`
	BlockedCount    int       `json:"blocked_count"`
	DoneCount       int       `json:"done_count"`
	TotalCount      int       `json:"total_count"`
	CreatedAt       time.Time `json:"created_at"`
}

// DailyMetric holds pre-computed daily KPIs for a scope (org, project, team, member).
type DailyMetric struct {
	ID         uuid.UUID      `json:"id"`
	OrgID      uuid.UUID      `json:"org_id"`
	MetricDate time.Time      `json:"metric_date"`
	ScopeType  string         `json:"scope_type"`
	ScopeID    uuid.UUID      `json:"scope_id"`
	Metrics    map[string]any `json:"metrics"`
	CreatedAt  time.Time      `json:"created_at"`
}

// WeeklyMetric holds aggregated weekly KPIs.
type WeeklyMetric struct {
	ID         uuid.UUID      `json:"id"`
	OrgID      uuid.UUID      `json:"org_id"`
	MetricDate time.Time      `json:"metric_date"`
	ScopeType  string         `json:"scope_type"`
	ScopeID    uuid.UUID      `json:"scope_id"`
	Metrics    map[string]any `json:"metrics"`
	CreatedAt  time.Time      `json:"created_at"`
}

// RiskScore holds a per-task risk assessment.
type RiskScore struct {
	ID                  uuid.UUID      `json:"id"`
	OrgID               uuid.UUID      `json:"org_id"`
	TaskID              uuid.UUID      `json:"task_id"`
	RiskLevel           string         `json:"risk_level"`
	RiskScoreValue      float64        `json:"risk_score"`
	Factors             map[string]any `json:"factors"`
	PredictedCompletion *time.Time     `json:"predicted_completion,omitempty"`
	UpdatedAt           time.Time      `json:"updated_at"`
}

// MetricAlert represents an analytics alert/anomaly.
type MetricAlert struct {
	ID             uuid.UUID      `json:"id"`
	OrgID          uuid.UUID      `json:"org_id"`
	AlertType      string         `json:"alert_type"`
	Severity       string         `json:"severity"`
	ScopeType      string         `json:"scope_type"`
	ScopeID        uuid.UUID      `json:"scope_id"`
	Title          string         `json:"title"`
	Description    string         `json:"description"`
	Data           map[string]any `json:"data,omitempty"`
	AcknowledgedAt *time.Time     `json:"acknowledged_at,omitempty"`
	AcknowledgedBy *uuid.UUID     `json:"acknowledged_by,omitempty"`
	CreatedAt      time.Time      `json:"created_at"`
}

// PerformanceReport holds metadata for a generated report.
type PerformanceReport struct {
	ID          uuid.UUID      `json:"id"`
	OrgID       uuid.UUID      `json:"org_id"`
	ReportType  string         `json:"report_type"`
	ScopeType   string         `json:"scope_type"`
	ScopeID     uuid.UUID      `json:"scope_id"`
	Parameters  map[string]any `json:"parameters"`
	Status      string         `json:"status"`
	StoragePath *string        `json:"storage_path,omitempty"`
	GeneratedBy uuid.UUID      `json:"generated_by"`
	GeneratedAt *time.Time     `json:"generated_at,omitempty"`
	ExpiresAt   *time.Time     `json:"expires_at,omitempty"`
	CreatedAt   time.Time      `json:"created_at"`
}

// --- Computed analytics types (not stored, calculated by service) ---

// VelocityPoint represents a single data point in velocity trend.
type VelocityPoint struct {
	Date      string `json:"date"`
	Completed int    `json:"completed"`
	Created   int    `json:"created"`
}

// CFDPoint represents a Cumulative Flow Diagram data point.
type CFDPoint struct {
	Date       string `json:"date"`
	Todo       int    `json:"todo"`
	InProgress int    `json:"in_progress"`
	Blocked    int    `json:"blocked"`
	Done       int    `json:"done"`
}

// HealthScore aggregates project health indicators.
type HealthScore struct {
	Overall          float64 `json:"overall"`
	VelocityTrend    float64 `json:"velocity_trend"`
	BlockedRatio     float64 `json:"blocked_ratio"`
	OverdueRatio     float64 `json:"overdue_ratio"`
	CompletionRate   float64 `json:"completion_rate"`
	EstimateAccuracy float64 `json:"estimate_accuracy"`
}

// WorkloadDistribution represents team member workload balance.
type WorkloadDistribution struct {
	UserID       uuid.UUID `json:"user_id"`
	DisplayName  string    `json:"display_name"`
	TaskCount    int       `json:"task_count"`
	DoneCount    int       `json:"done_count"`
	OverdueCount int       `json:"overdue_count"`
	StoryPoints  float64   `json:"story_points"`
}

// BurndownPoint represents a burndown chart data point.
type BurndownPoint struct {
	Date      string  `json:"date"`
	Remaining int     `json:"remaining"`
	Ideal     float64 `json:"ideal"`
}

// CycleTimeStats holds cycle time statistical summary.
type CycleTimeStats struct {
	Mean   float64 `json:"mean"`
	Median float64 `json:"median"`
	P75    float64 `json:"p75"`
	P90    float64 `json:"p90"`
	P95    float64 `json:"p95"`
	StdDev float64 `json:"std_dev"`
}

// LeadTimeStats holds lead time statistical summary.
type LeadTimeStats struct {
	Mean   float64 `json:"mean"`
	Median float64 `json:"median"`
	P75    float64 `json:"p75"`
	P90    float64 `json:"p90"`
}

// ThroughputStats holds throughput data.
type ThroughputStats struct {
	DailyAvg  float64 `json:"daily_avg"`
	WeeklyAvg float64 `json:"weekly_avg"`
	Trend     float64 `json:"trend"`
}

// ProjectAnalytics is the full analytics response for a project.
type ProjectAnalytics struct {
	Health             HealthScore            `json:"health"`
	Velocity           []VelocityPoint        `json:"velocity"`
	CFD                []CFDPoint             `json:"cfd"`
	Burndown           []BurndownPoint        `json:"burndown"`
	CycleTime          CycleTimeStats         `json:"cycle_time"`
	LeadTime           LeadTimeStats          `json:"lead_time"`
	Throughput         ThroughputStats        `json:"throughput"`
	Workload           []WorkloadDistribution `json:"workload"`
	RiskTasks          []RiskScore            `json:"risk_tasks"`
	EstimateAccuracy   float64                `json:"estimate_accuracy"`
	CompletionForecast *time.Time             `json:"completion_forecast,omitempty"`
}

// OrgAnalytics is the full analytics response for an organization.
type OrgAnalytics struct {
	Health         HealthScore            `json:"health"`
	Velocity       []VelocityPoint        `json:"velocity"`
	ProjectHealth  []ProjectHealthSummary `json:"project_health"`
	Workload       []WorkloadDistribution `json:"workload"`
	ActiveAlerts   []MetricAlert          `json:"active_alerts"`
	TotalTasks     int                    `json:"total_tasks"`
	CompletedTasks int                    `json:"completed_tasks"`
	OverdueTasks   int                    `json:"overdue_tasks"`
	AvgCycleTime   float64                `json:"avg_cycle_time"`
}

// ProjectHealthSummary is a light health overview per project.
type ProjectHealthSummary struct {
	ProjectID    uuid.UUID `json:"project_id"`
	ProjectName  string    `json:"project_name"`
	HealthScore  float64   `json:"health_score"`
	TaskCount    int       `json:"task_count"`
	DoneCount    int       `json:"done_count"`
	OverdueCount int       `json:"overdue_count"`
	Velocity     float64   `json:"velocity"`
}

// TeamAnalytics is the full analytics response for a team.
type TeamAnalytics struct {
	Health   HealthScore            `json:"health"`
	Velocity []VelocityPoint        `json:"velocity"`
	Workload []WorkloadDistribution `json:"workload"`
	Projects []ProjectHealthSummary `json:"projects"`
}

// MemberAnalytics is the analytics response for an individual member.
type MemberAnalytics struct {
	TasksCompleted int             `json:"tasks_completed"`
	TasksCreated   int             `json:"tasks_created"`
	AvgCycleTime   float64         `json:"avg_cycle_time"`
	Velocity       []VelocityPoint `json:"velocity"`
	CompletionRate float64         `json:"completion_rate"`
	OverdueTasks   int             `json:"overdue_tasks"`
	ActiveTasks    int             `json:"active_tasks"`
}

// ComparisonData holds data for comparing two scopes.
type ComparisonData struct {
	Labels []string  `json:"labels"`
	DataA  []float64 `json:"data_a"`
	DataB  []float64 `json:"data_b"`
	LabelA string    `json:"label_a"`
	LabelB string    `json:"label_b"`
}

// DashboardAnalytics is the enhanced dashboard response.
type DashboardAnalytics struct {
	Health          HealthScore            `json:"health"`
	Velocity        []VelocityPoint        `json:"velocity"`
	Predictions     DashboardPredictions   `json:"predictions"`
	Warnings        []MetricAlert          `json:"warnings"`
	TopRiskTasks    []RiskScore            `json:"top_risk_tasks"`
	WorkloadBalance []WorkloadDistribution `json:"workload_balance"`
	CompletionTrend []VelocityPoint        `json:"completion_trend"`
}

// DashboardPredictions holds forecasted metrics.
type DashboardPredictions struct {
	CompletionForecast *time.Time `json:"completion_forecast,omitempty"`
	VelocityForecast   float64    `json:"velocity_forecast"`
	RiskTaskCount      int        `json:"risk_task_count"`
}
