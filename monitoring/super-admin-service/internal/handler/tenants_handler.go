// Package handler provides HTTP handlers for the super admin service
package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog/log"
)

// TenantsHandler handles tenant/organization endpoints
type TenantsHandler struct {
	db *pgxpool.Pool
}

// NewTenantsHandler creates a new tenants handler
func NewTenantsHandler(db *pgxpool.Pool) *TenantsHandler {
	return &TenantsHandler{db: db}
}

// Tenant represents an organization tenant
type Tenant struct {
	ID          uuid.UUID `json:"id"`
	Name        string    `json:"name"`
	Slug        string    `json:"slug"`
	PlanID      uuid.UUID `json:"plan_id"`
	PlanName    string    `json:"plan_name"`
	MemberCount int       `json:"member_count"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// TenantMetrics represents tenant usage metrics
type TenantMetrics struct {
	Projects      int `json:"projects"`
	Teams         int `json:"teams"`
	Tasks         int `json:"tasks"`
	ActiveUsers   int `json:"active_users"`
	StorageUsedMB int `json:"storage_used_mb"`
	APIRequests   int `json:"api_requests_24h"`
}

// List returns all tenants with basic info
func (h *TenantsHandler) List(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	query := `
		SELECT 
			o.id, o.name, o.slug, o.plan_id, 
			COALESCE(p.name, 'Unknown') as plan_name,
			COUNT(DISTINCT om.user_id) as member_count,
			o.created_at, o.updated_at
		FROM orgs o
		LEFT JOIN plans p ON o.plan_id = p.id
		LEFT JOIN org_members om ON o.id = om.org_id
		GROUP BY o.id, o.name, o.slug, o.plan_id, p.name, o.created_at, o.updated_at
		ORDER BY o.created_at DESC
	`

	rows, err := h.db.Query(ctx, query)
	if err != nil {
		log.Error().Err(err).Msg("Failed to fetch tenants")
		http.Error(w, `{"error":"failed to fetch tenants"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var tenants []Tenant
	for rows.Next() {
		var t Tenant
		if err := rows.Scan(&t.ID, &t.Name, &t.Slug, &t.PlanID, &t.PlanName, &t.MemberCount, &t.CreatedAt, &t.UpdatedAt); err != nil {
			log.Warn().Err(err).Msg("Failed to scan tenant row")
			continue
		}
		tenants = append(tenants, t)
	}

	response := map[string]interface{}{
		"timestamp": time.Now(),
		"tenants":   tenants,
		"total":     len(tenants),
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// Get returns a single tenant by ID
func (h *TenantsHandler) Get(w http.ResponseWriter, r *http.Request) {
	orgIDStr := chi.URLParam(r, "orgID")
	orgID, err := uuid.Parse(orgIDStr)
	if err != nil {
		http.Error(w, `{"error":"invalid org ID"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	query := `
		SELECT 
			o.id, o.name, o.slug, o.plan_id, 
			COALESCE(p.name, 'Unknown') as plan_name,
			COUNT(DISTINCT om.user_id) as member_count,
			o.created_at, o.updated_at
		FROM orgs o
		LEFT JOIN plans p ON o.plan_id = p.id
		LEFT JOIN org_members om ON o.id = om.org_id
		WHERE o.id = $1
		GROUP BY o.id, o.name, o.slug, o.plan_id, p.name, o.created_at, o.updated_at
	`

	var t Tenant
	err = h.db.QueryRow(ctx, query, orgID).Scan(
		&t.ID, &t.Name, &t.Slug, &t.PlanID, &t.PlanName, &t.MemberCount, &t.CreatedAt, &t.UpdatedAt,
	)
	if err != nil {
		log.Error().Err(err).Str("org_id", orgIDStr).Msg("Failed to fetch tenant")
		http.Error(w, `{"error":"tenant not found"}`, http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(t)
}

// Metrics returns metrics for a specific tenant
func (h *TenantsHandler) Metrics(w http.ResponseWriter, r *http.Request) {
	orgIDStr := chi.URLParam(r, "orgID")
	orgID, err := uuid.Parse(orgIDStr)
	if err != nil {
		http.Error(w, `{"error":"invalid org ID"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	metrics := TenantMetrics{}

	// Count projects
	h.db.QueryRow(ctx, `SELECT COUNT(*) FROM projects WHERE org_id = $1`, orgID).Scan(&metrics.Projects)

	// Count teams
	h.db.QueryRow(ctx, `SELECT COUNT(*) FROM teams WHERE org_id = $1`, orgID).Scan(&metrics.Teams)

	// Count tasks (across all projects in org)
	h.db.QueryRow(ctx, `
		SELECT COUNT(*) FROM tasks t 
		JOIN projects p ON t.project_id = p.id 
		WHERE p.org_id = $1 AND t.deleted_at IS NULL
	`, orgID).Scan(&metrics.Tasks)

	// Count active users (logged in last 7 days)
	h.db.QueryRow(ctx, `
		SELECT COUNT(DISTINCT user_id) 
		FROM org_members 
		WHERE org_id = $1
	`, orgID).Scan(&metrics.ActiveUsers)

	response := map[string]interface{}{
		"timestamp": time.Now(),
		"org_id":    orgID,
		"metrics":   metrics,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// Usage returns detailed usage stats for a tenant
func (h *TenantsHandler) Usage(w http.ResponseWriter, r *http.Request) {
	orgIDStr := chi.URLParam(r, "orgID")
	orgID, err := uuid.Parse(orgIDStr)
	if err != nil {
		http.Error(w, `{"error":"invalid org ID"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	// Gather usage data
	usage := map[string]interface{}{
		"org_id":    orgID,
		"timestamp": time.Now(),
	}

	// Member count
	var memberCount int
	h.db.QueryRow(ctx, `SELECT COUNT(*) FROM org_members WHERE org_id = $1`, orgID).Scan(&memberCount)
	usage["members"] = memberCount

	// Projects by status
	projectStats := map[string]int{}
	rows, _ := h.db.Query(ctx, `
		SELECT status, COUNT(*) FROM projects WHERE org_id = $1 GROUP BY status
	`, orgID)
	if rows != nil {
		for rows.Next() {
			var status string
			var count int
			rows.Scan(&status, &count)
			projectStats[status] = count
		}
		rows.Close()
	}
	usage["projects_by_status"] = projectStats

	// Tasks by status
	taskStats := map[string]int{}
	rows, _ = h.db.Query(ctx, `
		SELECT t.status, COUNT(*) FROM tasks t 
		JOIN projects p ON t.project_id = p.id 
		WHERE p.org_id = $1 AND t.deleted_at IS NULL
		GROUP BY t.status
	`, orgID)
	if rows != nil {
		for rows.Next() {
			var status string
			var count int
			rows.Scan(&status, &count)
			taskStats[status] = count
		}
		rows.Close()
	}
	usage["tasks_by_status"] = taskStats

	// Overdue tasks
	var overdueCount int
	h.db.QueryRow(ctx, `
		SELECT COUNT(*) FROM tasks t 
		JOIN projects p ON t.project_id = p.id 
		WHERE p.org_id = $1 
		  AND t.deleted_at IS NULL 
		  AND t.due_date < NOW() 
		  AND t.status != 'done'
	`, orgID).Scan(&overdueCount)
	usage["overdue_tasks"] = overdueCount

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(usage)
}
