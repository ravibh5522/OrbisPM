// Package evaluator provides business rule evaluation
package evaluator

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog/log"
)

// BusinessEvaluator evaluates business rule alerts from PostgreSQL
type BusinessEvaluator struct {
	db *pgxpool.Pool
}

// NewBusinessEvaluator creates a new business evaluator
func NewBusinessEvaluator(db *pgxpool.Pool) *BusinessEvaluator {
	return &BusinessEvaluator{db: db}
}

// DBAlertConfig represents an alert config from the database
type DBAlertConfig struct {
	ID         string
	OrgID      string
	Name       string
	RuleType   string
	Expression string
	Threshold  json.RawMessage
	Severity   string
	Channels   []string
	IsActive   bool
	Cooldown   time.Duration
}

// Evaluate checks business rules defined in PostgreSQL
func (e *BusinessEvaluator) Evaluate(ctx context.Context) ([]Alert, error) {
	var alerts []Alert

	// Check for overdue tasks
	overdueAlerts, err := e.evaluateOverdueTasks(ctx)
	if err != nil {
		log.Error().Err(err).Msg("Failed to evaluate overdue tasks")
	} else {
		alerts = append(alerts, overdueAlerts...)
	}

	// Check for SLA breaches (approvals pending too long)
	slaAlerts, err := e.evaluateSLABreaches(ctx)
	if err != nil {
		log.Error().Err(err).Msg("Failed to evaluate SLA breaches")
	} else {
		alerts = append(alerts, slaAlerts...)
	}

	// Check custom business rules from monitoring.alert_configs
	customAlerts, err := e.evaluateCustomRules(ctx)
	if err != nil {
		log.Error().Err(err).Msg("Failed to evaluate custom rules")
	} else {
		alerts = append(alerts, customAlerts...)
	}

	log.Debug().Int("business_alerts", len(alerts)).Msg("Business evaluation complete")
	return alerts, nil
}

// evaluateOverdueTasks checks for tasks past their due date
func (e *BusinessEvaluator) evaluateOverdueTasks(ctx context.Context) ([]Alert, error) {
	query := `
		SELECT 
			o.id as org_id,
			o.name as org_name,
			COUNT(*) as overdue_count
		FROM tasks t
		JOIN projects p ON t.project_id = p.id
		JOIN orgs o ON p.org_id = o.id
		WHERE t.due_date < NOW()
		  AND t.status != 'done'
		  AND t.deleted_at IS NULL
		GROUP BY o.id, o.name
		HAVING COUNT(*) > 10
	`

	rows, err := e.db.Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("querying overdue tasks: %w", err)
	}
	defer rows.Close()

	var alerts []Alert
	for rows.Next() {
		var orgID, orgName string
		var count int

		if err := rows.Scan(&orgID, &orgName, &count); err != nil {
			continue
		}

		alert := Alert{
			Name:     "OverdueTasksHigh",
			Severity: "warning",
			Status:   "firing",
			Labels: map[string]string{
				"alertname": "OverdueTasksHigh",
				"severity":  "warning",
				"type":      "business",
				"org_id":    orgID,
				"org_name":  orgName,
			},
			Annotations: map[string]string{
				"summary":     fmt.Sprintf("High number of overdue tasks in %s", orgName),
				"description": fmt.Sprintf("Organization %s has %d overdue tasks", orgName, count),
			},
			StartsAt:    time.Now(),
			Fingerprint: generateFingerprint(map[string]string{"alertname": "OverdueTasksHigh", "org_id": orgID}),
		}
		alerts = append(alerts, alert)
	}

	return alerts, nil
}

// evaluateSLABreaches checks for approvals pending beyond SLA
func (e *BusinessEvaluator) evaluateSLABreaches(ctx context.Context) ([]Alert, error) {
	// Check for approvals pending more than 48 hours
	query := `
		SELECT 
			o.id as org_id,
			o.name as org_name,
			COUNT(*) as pending_count
		FROM approvals a
		JOIN tasks t ON a.task_id = t.id
		JOIN projects p ON t.project_id = p.id
		JOIN orgs o ON p.org_id = o.id
		WHERE a.status = 'pending'
		  AND a.created_at < NOW() - INTERVAL '48 hours'
		GROUP BY o.id, o.name
		HAVING COUNT(*) > 0
	`

	rows, err := e.db.Query(ctx, query)
	if err != nil {
		// If table doesn't exist yet, don't fail
		log.Debug().Err(err).Msg("SLA breach query failed (table may not exist)")
		return nil, nil
	}
	defer rows.Close()

	var alerts []Alert
	for rows.Next() {
		var orgID, orgName string
		var count int

		if err := rows.Scan(&orgID, &orgName, &count); err != nil {
			continue
		}

		alert := Alert{
			Name:     "ApprovalSLABreach",
			Severity: "critical",
			Status:   "firing",
			Labels: map[string]string{
				"alertname": "ApprovalSLABreach",
				"severity":  "critical",
				"type":      "business",
				"org_id":    orgID,
				"org_name":  orgName,
			},
			Annotations: map[string]string{
				"summary":     fmt.Sprintf("Approval SLA breach in %s", orgName),
				"description": fmt.Sprintf("Organization %s has %d approvals pending > 48 hours", orgName, count),
			},
			StartsAt:    time.Now(),
			Fingerprint: generateFingerprint(map[string]string{"alertname": "ApprovalSLABreach", "org_id": orgID}),
		}
		alerts = append(alerts, alert)
	}

	return alerts, nil
}

// evaluateCustomRules evaluates rules from monitoring.alert_configs table
func (e *BusinessEvaluator) evaluateCustomRules(ctx context.Context) ([]Alert, error) {
	// Check if monitoring schema exists
	var schemaExists bool
	err := e.db.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM information_schema.schemata 
			WHERE schema_name = 'monitoring'
		)
	`).Scan(&schemaExists)

	if err != nil || !schemaExists {
		log.Debug().Msg("Monitoring schema not found, skipping custom rules")
		return nil, nil
	}

	// Query custom alert configs
	query := `
		SELECT id, org_id, name, rule_type, expression, threshold, severity, channels, is_active, cooldown
		FROM monitoring.alert_configs
		WHERE is_active = true AND rule_type = 'business'
	`

	rows, err := e.db.Query(ctx, query)
	if err != nil {
		log.Debug().Err(err).Msg("Custom rules query failed (table may not exist)")
		return nil, nil
	}
	defer rows.Close()

	// For now, just log that custom rules exist
	// Full implementation would evaluate each rule's expression
	var count int
	for rows.Next() {
		count++
	}

	if count > 0 {
		log.Info().Int("custom_rules", count).Msg("Found custom alert rules")
	}

	return nil, nil
}
