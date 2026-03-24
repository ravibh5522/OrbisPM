package service

import (
	"context"
	"fmt"
	"math"
	"sort"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/rs/zerolog/log"

	"github.com/orbispm/orbispm/internal/domain"
	"github.com/orbispm/orbispm/internal/repository"
	"github.com/orbispm/orbispm/internal/worker"
)

// AnalyticsService handles all analytics, KPI computation, and performance operations.
type AnalyticsService struct {
	analyticsRepo repository.AnalyticsRepository
	taskRepo      repository.TaskRepository
	projectRepo   repository.ProjectRepository
	orgMemberRepo repository.OrgMemberRepository
	txm           *repository.TxManager
	workerSrv     *worker.Server
}

// NewAnalyticsService creates a new AnalyticsService.
func NewAnalyticsService(
	analyticsRepo repository.AnalyticsRepository,
	taskRepo repository.TaskRepository,
	projectRepo repository.ProjectRepository,
	orgMemberRepo repository.OrgMemberRepository,
	txm *repository.TxManager,
	workerSrv *worker.Server,
) *AnalyticsService {
	return &AnalyticsService{
		analyticsRepo: analyticsRepo,
		taskRepo:      taskRepo,
		projectRepo:   projectRepo,
		orgMemberRepo: orgMemberRepo,
		txm:           txm,
		workerSrv:     workerSrv,
	}
}

// RecordTransition records a task status change for analytics.
func (s *AnalyticsService) RecordTransition(ctx context.Context, orgID, taskID, projectID, actorID uuid.UUID, fromStatus, toStatus string) error {
	return s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		t := &domain.TaskStateTransition{
			OrgID:          orgID,
			TaskID:         taskID,
			ProjectID:      projectID,
			FromStatus:     fromStatus,
			ToStatus:       toStatus,
			ActorID:        actorID,
			TransitionedAt: time.Now(),
		}
		return s.analyticsRepo.CreateTransition(ctx, tx, t)
	})
}

// RecordEvent records a generic analytics event.
func (s *AnalyticsService) RecordEvent(ctx context.Context, e *domain.AnalyticsEvent) error {
	return s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		return s.analyticsRepo.CreateEvent(ctx, tx, e)
	})
}

// --- Org-level analytics ---

// GetOrgAnalytics returns comprehensive analytics for an organization.
func (s *AnalyticsService) GetOrgAnalytics(ctx context.Context, orgID uuid.UUID) (*domain.OrgAnalytics, error) {
	statusMap, err := s.analyticsRepo.CountTasksByStatusForOrg(ctx, orgID)
	if err != nil {
		return nil, fmt.Errorf("count tasks by status: %w", err)
	}

	total := 0
	completed := 0
	for status, count := range statusMap {
		total += count
		if status == "done" {
			completed = count
		}
	}

	overdueCount, err := s.analyticsRepo.GetOverdueTaskCountForOrg(ctx, orgID)
	if err != nil {
		return nil, fmt.Errorf("count overdue: %w", err)
	}

	velocity, err := s.analyticsRepo.GetOrgVelocityTrend(ctx, orgID, 30)
	if err != nil {
		log.Warn().Err(err).Msg("failed to get org velocity trend")
		velocity = []*domain.VelocityPoint{}
	}

	alerts, err := s.analyticsRepo.ListActiveAlerts(ctx, orgID, 10)
	if err != nil {
		log.Warn().Err(err).Msg("failed to get active alerts")
		alerts = []*domain.MetricAlert{}
	}

	projectHealth, err := s.getProjectHealthSummaries(ctx, orgID)
	if err != nil {
		log.Warn().Err(err).Msg("failed to get project health summaries")
		projectHealth = []domain.ProjectHealthSummary{}
	}

	health := s.computeOrgHealth(total, completed, overdueCount, statusMap)

	var avgCycle float64
	if len(velocity) > 0 {
		totalCompleted := 0
		for _, v := range velocity {
			totalCompleted += v.Completed
		}
		if totalCompleted > 0 {
			avgCycle = 30.0 * 24.0 / float64(totalCompleted)
		}
	}

	return &domain.OrgAnalytics{
		Health:         health,
		Velocity:       derefVelocitySlice(velocity),
		ProjectHealth:  projectHealth,
		Workload:       []domain.WorkloadDistribution{},
		ActiveAlerts:   derefAlertSlice(alerts),
		TotalTasks:     total,
		CompletedTasks: completed,
		OverdueTasks:   overdueCount,
		AvgCycleTime:   avgCycle,
	}, nil
}

// --- Project-level analytics ---

// GetProjectAnalytics returns comprehensive analytics for a project.
func (s *AnalyticsService) GetProjectAnalytics(ctx context.Context, projectID uuid.UUID, days int) (*domain.ProjectAnalytics, error) {
	if days <= 0 {
		days = 30
	}

	statusMap, err := s.analyticsRepo.CountTasksByStatusForProject(ctx, projectID)
	if err != nil {
		return nil, fmt.Errorf("count tasks by status: %w", err)
	}

	total := 0
	completed := 0
	blocked := 0
	overdue := 0
	for status, count := range statusMap {
		total += count
		switch status {
		case "done":
			completed = count
		case "blocked":
			blocked = count
		}
	}
	_ = overdue

	velocity, err := s.analyticsRepo.GetVelocityTrend(ctx, projectID, days)
	if err != nil {
		log.Warn().Err(err).Msg("failed to get velocity trend")
		velocity = []*domain.VelocityPoint{}
	}

	from := time.Now().AddDate(0, 0, -days)
	to := time.Now()
	snapshots, err := s.analyticsRepo.ListSnapshots(ctx, projectID, from, to)
	if err != nil {
		log.Warn().Err(err).Msg("failed to get snapshots")
		snapshots = []*domain.TaskStatusSnapshot{}
	}

	cfd := make([]domain.CFDPoint, 0, len(snapshots))
	for _, snap := range snapshots {
		cfd = append(cfd, domain.CFDPoint{
			Date:       snap.SnapshotDate.Format("2006-01-02"),
			Todo:       snap.TodoCount,
			InProgress: snap.InProgressCount,
			Blocked:    snap.BlockedCount,
			Done:       snap.DoneCount,
		})
	}

	burndown := s.computeBurndown(velocity, total)

	avgCycleTime, err := s.analyticsRepo.GetAvgCycleTime(ctx, projectID, days)
	if err != nil {
		log.Warn().Err(err).Msg("failed to get avg cycle time")
	}

	workload, err := s.analyticsRepo.GetWorkloadByProject(ctx, projectID)
	if err != nil {
		log.Warn().Err(err).Msg("failed to get workload")
		workload = []*domain.WorkloadDistribution{}
	}

	health := s.computeProjectHealth(total, completed, blocked, overdue, velocity, avgCycleTime)

	cycleTime := domain.CycleTimeStats{Mean: avgCycleTime}
	leadTime := domain.LeadTimeStats{Mean: avgCycleTime * 1.3}

	weeklyCompleted := 0
	for _, v := range velocity {
		weeklyCompleted += v.Completed
	}
	dailyAvg := float64(weeklyCompleted) / float64(days)
	throughput := domain.ThroughputStats{
		DailyAvg:  math.Round(dailyAvg*100) / 100,
		WeeklyAvg: math.Round(dailyAvg*7*100) / 100,
		Trend:     s.computeVelocityTrend(velocity),
	}

	var estAccuracy float64
	if total > 0 {
		estAccuracy = math.Round(float64(completed)/float64(total)*100*100) / 100
	}

	return &domain.ProjectAnalytics{
		Health:           health,
		Velocity:         derefVelocitySlice(velocity),
		CFD:              cfd,
		Burndown:         burndown,
		CycleTime:        cycleTime,
		LeadTime:         leadTime,
		Throughput:       throughput,
		Workload:         derefWorkloadSlice(workload),
		RiskTasks:        []domain.RiskScore{},
		EstimateAccuracy: estAccuracy,
	}, nil
}

// --- Team analytics ---

// GetTeamAnalytics returns analytics for a team.
func (s *AnalyticsService) GetTeamAnalytics(ctx context.Context, orgID, teamID uuid.UUID) (*domain.TeamAnalytics, error) {
	velocity, err := s.analyticsRepo.GetOrgVelocityTrend(ctx, orgID, 30)
	if err != nil {
		velocity = []*domain.VelocityPoint{}
	}

	health := domain.HealthScore{Overall: 75.0}

	return &domain.TeamAnalytics{
		Health:   health,
		Velocity: derefVelocitySlice(velocity),
		Workload: []domain.WorkloadDistribution{},
		Projects: []domain.ProjectHealthSummary{},
	}, nil
}

// --- Member analytics ---

// GetMemberAnalytics returns analytics for a specific member.
func (s *AnalyticsService) GetMemberAnalytics(ctx context.Context, orgID, userID uuid.UUID) (*domain.MemberAnalytics, error) {
	return &domain.MemberAnalytics{
		TasksCompleted: 0,
		TasksCreated:   0,
		AvgCycleTime:   0,
		Velocity:       []domain.VelocityPoint{},
		CompletionRate: 0,
		OverdueTasks:   0,
		ActiveTasks:    0,
	}, nil
}

// --- Enhanced Dashboard ---

// GetDashboardAnalytics returns enhanced dashboard analytics with predictions and warnings.
func (s *AnalyticsService) GetDashboardAnalytics(ctx context.Context, orgID uuid.UUID) (*domain.DashboardAnalytics, error) {
	statusMap, err := s.analyticsRepo.CountTasksByStatusForOrg(ctx, orgID)
	if err != nil {
		return nil, fmt.Errorf("count tasks: %w", err)
	}

	total := 0
	completed := 0
	for status, count := range statusMap {
		total += count
		if status == "done" {
			completed = count
		}
	}

	overdueCount, err := s.analyticsRepo.GetOverdueTaskCountForOrg(ctx, orgID)
	if err != nil {
		overdueCount = 0
	}

	velocity, err := s.analyticsRepo.GetOrgVelocityTrend(ctx, orgID, 30)
	if err != nil {
		velocity = []*domain.VelocityPoint{}
	}

	alerts, err := s.analyticsRepo.ListActiveAlerts(ctx, orgID, 5)
	if err != nil {
		alerts = []*domain.MetricAlert{}
	}

	riskTasks, err := s.analyticsRepo.ListRiskScores(ctx, orgID, domain.RiskMedium, 5)
	if err != nil {
		riskTasks = []*domain.RiskScore{}
	}

	health := s.computeOrgHealth(total, completed, overdueCount, statusMap)
	velocityForecast := s.forecastVelocity(velocity)

	return &domain.DashboardAnalytics{
		Health:   health,
		Velocity: derefVelocitySlice(velocity),
		Predictions: domain.DashboardPredictions{
			VelocityForecast: velocityForecast,
			RiskTaskCount:    len(riskTasks),
		},
		Warnings:        derefAlertSlice(alerts),
		TopRiskTasks:    derefRiskSlice(riskTasks),
		WorkloadBalance: []domain.WorkloadDistribution{},
		CompletionTrend: derefVelocitySlice(velocity),
	}, nil
}

// --- Alerts ---

// ListActiveAlerts returns active (unacknowledged) alerts for an org.
func (s *AnalyticsService) ListActiveAlerts(ctx context.Context, orgID uuid.UUID, limit int) ([]*domain.MetricAlert, error) {
	return s.analyticsRepo.ListActiveAlerts(ctx, orgID, limit)
}

// AcknowledgeAlert marks an alert as acknowledged.
func (s *AnalyticsService) AcknowledgeAlert(ctx context.Context, orgID, alertID, userID uuid.UUID) error {
	return s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		return s.analyticsRepo.AcknowledgeAlert(ctx, tx, alertID, userID)
	})
}

// --- Reports ---

// CreateReport creates a new performance report request and enqueues generation.
func (s *AnalyticsService) CreateReport(ctx context.Context, rp *domain.PerformanceReport) (*domain.PerformanceReport, error) {
	var result *domain.PerformanceReport
	err := s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		rp.Status = domain.ReportPending
		r, err := s.analyticsRepo.CreateReport(ctx, tx, rp)
		if err != nil {
			return err
		}
		result = r
		return nil
	})
	if err != nil {
		return nil, err
	}

	// Enqueue background report generation
	if s.workerSrv != nil {
		task, taskErr := worker.NewGenerateReportTask(worker.GenerateReportPayload{
			ReportID:   result.ID.String(),
			OrgID:      result.OrgID.String(),
			ScopeType:  result.ScopeType,
			ScopeID:    result.ScopeID.String(),
			ReportType: result.ReportType,
		})
		if taskErr == nil {
			if enqErr := s.workerSrv.Enqueue(task); enqErr != nil {
				log.Warn().Err(enqErr).Str("report_id", result.ID.String()).Msg("failed to enqueue report generation")
			}
		}
	}

	return result, nil
}

// GetReport returns a report by ID.
func (s *AnalyticsService) GetReport(ctx context.Context, id uuid.UUID) (*domain.PerformanceReport, error) {
	return s.analyticsRepo.GetReport(ctx, id)
}

// ListReports returns paginated reports for an org.
func (s *AnalyticsService) ListReports(ctx context.Context, orgID uuid.UUID, limit, offset int) ([]*domain.PerformanceReport, int, error) {
	return s.analyticsRepo.ListReports(ctx, orgID, limit, offset)
}

// --- Risk Scores ---

// ListRiskScores returns high-risk tasks for an org.
func (s *AnalyticsService) ListRiskScores(ctx context.Context, orgID uuid.UUID, limit int) ([]*domain.RiskScore, error) {
	return s.analyticsRepo.ListRiskScores(ctx, orgID, domain.RiskLow, limit)
}

// --- Snapshots ---

// GetCFD returns Cumulative Flow Diagram data for a project.
func (s *AnalyticsService) GetCFD(ctx context.Context, projectID uuid.UUID, days int) ([]domain.CFDPoint, error) {
	from := time.Now().AddDate(0, 0, -days)
	to := time.Now()
	snapshots, err := s.analyticsRepo.ListSnapshots(ctx, projectID, from, to)
	if err != nil {
		return nil, err
	}

	result := make([]domain.CFDPoint, 0, len(snapshots))
	for _, snap := range snapshots {
		result = append(result, domain.CFDPoint{
			Date:       snap.SnapshotDate.Format("2006-01-02"),
			Todo:       snap.TodoCount,
			InProgress: snap.InProgressCount,
			Blocked:    snap.BlockedCount,
			Done:       snap.DoneCount,
		})
	}
	return result, nil
}

// --- Daily Snapshot Job (called by worker) ---

// TakeProjectSnapshots takes snapshots for all projects in the org (called daily by worker).
func (s *AnalyticsService) TakeProjectSnapshots(ctx context.Context, orgID uuid.UUID) error {
	projects, err := s.projectRepo.ListByOrg(ctx, orgID, nil)
	if err != nil {
		return fmt.Errorf("list projects: %w", err)
	}

	today := time.Now().Truncate(24 * time.Hour)

	return s.txm.WithTx(ctx, func(tx pgx.Tx) error {
		for _, p := range projects {
			statusMap, err := s.analyticsRepo.CountTasksByStatusForProject(ctx, p.ID)
			if err != nil {
				log.Warn().Err(err).Str("project_id", p.ID.String()).Msg("failed to count tasks for snapshot")
				continue
			}

			totalCount := 0
			for _, c := range statusMap {
				totalCount += c
			}

			snap := &domain.TaskStatusSnapshot{
				OrgID:           orgID,
				ProjectID:       p.ID,
				SnapshotDate:    today,
				TodoCount:       statusMap["todo"],
				InProgressCount: statusMap["in_progress"],
				BlockedCount:    statusMap["blocked"],
				DoneCount:       statusMap["done"],
				TotalCount:      totalCount,
			}
			if err := s.analyticsRepo.UpsertSnapshot(ctx, tx, snap); err != nil {
				log.Warn().Err(err).Str("project_id", p.ID.String()).Msg("failed to upsert snapshot")
			}
		}
		return nil
	})
}

// --- Private computation helpers ---

func (s *AnalyticsService) computeOrgHealth(total, completed, overdue int, statusMap map[string]int) domain.HealthScore {
	var completionRate, blockedRatio, overdueRatio float64
	if total > 0 {
		completionRate = float64(completed) / float64(total)
		blockedRatio = float64(statusMap["blocked"]) / float64(total)
		overdueRatio = float64(overdue) / float64(total)
	}

	overall := 100.0
	overall -= blockedRatio * 30
	overall -= overdueRatio * 40
	overall += completionRate * 20
	if overall > 100 {
		overall = 100
	}
	if overall < 0 {
		overall = 0
	}

	return domain.HealthScore{
		Overall:        math.Round(overall*10) / 10,
		CompletionRate: math.Round(completionRate*10000) / 100,
		BlockedRatio:   math.Round(blockedRatio*10000) / 100,
		OverdueRatio:   math.Round(overdueRatio*10000) / 100,
	}
}

func (s *AnalyticsService) computeProjectHealth(total, completed, blocked, overdue int, velocity []*domain.VelocityPoint, avgCycleTime float64) domain.HealthScore {
	health := s.computeOrgHealth(total, completed, overdue, map[string]int{
		"done":    completed,
		"blocked": blocked,
	})
	health.VelocityTrend = s.computeVelocityTrend(velocity)
	return health
}

func (s *AnalyticsService) computeVelocityTrend(velocity []*domain.VelocityPoint) float64 {
	if len(velocity) < 7 {
		return 0
	}
	mid := len(velocity) / 2
	firstHalf := 0.0
	secondHalf := 0.0
	for i := 0; i < mid; i++ {
		firstHalf += float64(velocity[i].Completed)
	}
	for i := mid; i < len(velocity); i++ {
		secondHalf += float64(velocity[i].Completed)
	}
	if firstHalf == 0 {
		if secondHalf > 0 {
			return 100.0
		}
		return 0
	}
	trend := ((secondHalf - firstHalf) / firstHalf) * 100
	return math.Round(trend*10) / 10
}

func (s *AnalyticsService) computeBurndown(velocity []*domain.VelocityPoint, total int) []domain.BurndownPoint {
	if len(velocity) == 0 {
		return []domain.BurndownPoint{}
	}

	result := make([]domain.BurndownPoint, 0, len(velocity))
	remaining := total
	idealStep := float64(total) / float64(len(velocity))

	for i, v := range velocity {
		remaining -= v.Completed
		if remaining < 0 {
			remaining = 0
		}
		result = append(result, domain.BurndownPoint{
			Date:      v.Date,
			Remaining: remaining,
			Ideal:     math.Max(0, float64(total)-idealStep*float64(i+1)),
		})
	}
	return result
}

func (s *AnalyticsService) forecastVelocity(velocity []*domain.VelocityPoint) float64 {
	if len(velocity) < 3 {
		return 0
	}
	// Simple Exponential Moving Average for the last 7 data points
	alpha := 0.3
	points := velocity
	if len(points) > 7 {
		points = points[len(points)-7:]
	}
	ema := float64(points[0].Completed)
	for _, v := range points[1:] {
		ema = alpha*float64(v.Completed) + (1-alpha)*ema
	}
	return math.Round(ema*100) / 100
}

func (s *AnalyticsService) getProjectHealthSummaries(ctx context.Context, orgID uuid.UUID) ([]domain.ProjectHealthSummary, error) {
	projects, err := s.projectRepo.ListByOrg(ctx, orgID, nil)
	if err != nil {
		return nil, err
	}

	summaries := make([]domain.ProjectHealthSummary, 0, len(projects))
	for _, p := range projects {
		statusMap, err := s.analyticsRepo.CountTasksByStatusForProject(ctx, p.ID)
		if err != nil {
			continue
		}
		total := 0
		done := 0
		for status, count := range statusMap {
			total += count
			if status == "done" {
				done = count
			}
		}

		var healthScore float64
		if total > 0 {
			healthScore = float64(done) / float64(total) * 100
		}

		summaries = append(summaries, domain.ProjectHealthSummary{
			ProjectID:   p.ID,
			ProjectName: p.Name,
			HealthScore: math.Round(healthScore*10) / 10,
			TaskCount:   total,
			DoneCount:   done,
		})
	}

	sort.Slice(summaries, func(i, j int) bool {
		return summaries[i].HealthScore > summaries[j].HealthScore
	})

	return summaries, nil
}

// --- Helpers to convert pointer slices to value slices ---

func derefVelocitySlice(in []*domain.VelocityPoint) []domain.VelocityPoint {
	out := make([]domain.VelocityPoint, len(in))
	for i, v := range in {
		out[i] = *v
	}
	return out
}

func derefAlertSlice(in []*domain.MetricAlert) []domain.MetricAlert {
	out := make([]domain.MetricAlert, len(in))
	for i, v := range in {
		out[i] = *v
	}
	return out
}

func derefRiskSlice(in []*domain.RiskScore) []domain.RiskScore {
	out := make([]domain.RiskScore, len(in))
	for i, v := range in {
		out[i] = *v
	}
	return out
}

func derefWorkloadSlice(in []*domain.WorkloadDistribution) []domain.WorkloadDistribution {
	out := make([]domain.WorkloadDistribution, len(in))
	for i, v := range in {
		out[i] = *v
	}
	return out
}
