package handler

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/orbispm/orbispm/internal/domain"
	"github.com/orbispm/orbispm/internal/middleware"
	"github.com/orbispm/orbispm/internal/service"
)

// NotifPrefHandler handles notification preference HTTP endpoints.
type NotifPrefHandler struct {
	prefSvc *service.NotificationPrefService
}

// NewNotifPrefHandler creates a new NotifPrefHandler.
func NewNotifPrefHandler(prefSvc *service.NotificationPrefService) *NotifPrefHandler {
	return &NotifPrefHandler{prefSvc: prefSvc}
}

// Routes registers notification preference routes.
func (h *NotifPrefHandler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Put("/", h.Upsert)
	r.Get("/", h.List)
	return r
}

// Upsert godoc
// @Summary Upsert notification preference
// @Description Create or update a notification preference
// @Tags NotificationPreferences
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Param body body swaggerUpsertNotifPrefParams true "Notification preference data"
// @Success 200 {object} swaggerNotificationPreference
// @Failure 400 {object} ErrorResponse
// @Router /orgs/{orgId}/notification-preferences [put]
func (h *NotifPrefHandler) Upsert(w http.ResponseWriter, r *http.Request) {
	var params service.UpsertPrefParams
	if err := parseBody(r, &params); err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid request", Detail: err.Error()})
		return
	}

	params.UserID = middleware.UserIDFromCtx(r.Context())
	params.OrgID = middleware.OrgIDFromCtx(r.Context())

	if err := h.prefSvc.Upsert(r.Context(), params); err != nil {
		Error(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// List godoc
// @Summary List notification preferences
// @Description List notification preferences for the current user
// @Tags NotificationPreferences
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Success 200 {array} swaggerNotificationPreference
// @Router /orgs/{orgId}/notification-preferences [get]
func (h *NotifPrefHandler) List(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromCtx(r.Context())
	orgID := middleware.OrgIDFromCtx(r.Context())

	prefs, err := h.prefSvc.ListByUser(r.Context(), userID, orgID)
	if err != nil {
		Error(w, r, err)
		return
	}
	if prefs == nil {
		prefs = []*domain.NotificationPreference{}
	}
	JSON(w, http.StatusOK, ListResponse{Data: prefs, Total: len(prefs), Limit: len(prefs), Offset: 0})
}

// --- Import Handler ---

// ImportHandler handles import job HTTP endpoints.
type ImportHandler struct {
	importSvc *service.ImportService
}

// NewImportHandler creates a new ImportHandler.
func NewImportHandler(importSvc *service.ImportService) *ImportHandler {
	return &ImportHandler{importSvc: importSvc}
}

// Routes registers import routes (nested under /projects/{projectId}).
func (h *ImportHandler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Post("/", h.Create)             // legacy CSV
	r.Post("/analyze", h.Analyze)     // Excel analyze
	r.Post("/excel", h.ImportExcel)   // Excel import
	r.Get("/export", h.ExportExcel)   // Excel export
	r.Get("/export/csv", h.ExportCSV) // CSV export
	r.Get("/", h.List)
	r.Get("/{importId}", h.Get)
	return r
}

// Analyze godoc
// @Summary Analyze Excel file
// @Description Upload an Excel file and get sheet names with column headers
// @Tags Imports
// @Accept multipart/form-data
// @Produce json
// @Security BearerAuth
// @Param file formData file true "Excel file to analyze"
// @Success 200 {array} service.SheetInfo
// @Failure 400 {object} ErrorResponse
// @Router /orgs/{orgId}/projects/{projectId}/imports/analyze [post]
func (h *ImportHandler) Analyze(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 10<<20)
	if err := r.ParseMultipartForm(10 << 20); err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "file too large (max 10MB)", Detail: err.Error()})
		return
	}

	file, _, err := r.FormFile("file")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "missing file field", Detail: err.Error()})
		return
	}
	defer file.Close()

	data, err := io.ReadAll(file)
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "failed to read file", Detail: err.Error()})
		return
	}

	sheets, err := h.importSvc.AnalyzeExcel(data)
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "failed to analyze file", Detail: err.Error()})
		return
	}
	JSON(w, http.StatusOK, sheets)
}

// ImportExcel godoc
// @Summary Import tasks from Excel
// @Description Import tasks from an Excel file with sheet selection and column mapping
// @Tags Imports
// @Accept multipart/form-data
// @Produce json
// @Security BearerAuth
// @Param file formData file true "Excel file"
// @Param config formData string true "JSON import config with sheet configs"
// @Success 201 {object} service.ProcessExcelResult
// @Failure 400 {object} ErrorResponse
// @Router /orgs/{orgId}/projects/{projectId}/imports/excel [post]
func (h *ImportHandler) ImportExcel(w http.ResponseWriter, r *http.Request) {
	projectID, err := uuidParam(r, "projectId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid project id"})
		return
	}
	orgID := middleware.OrgIDFromCtx(r.Context())
	userID := middleware.UserIDFromCtx(r.Context())

	r.Body = http.MaxBytesReader(w, r.Body, 10<<20)
	if err := r.ParseMultipartForm(10 << 20); err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "file too large (max 10MB)", Detail: err.Error()})
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "missing file field", Detail: err.Error()})
		return
	}
	defer file.Close()

	data, err := io.ReadAll(file)
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "failed to read file", Detail: err.Error()})
		return
	}

	configStr := r.FormValue("config")
	if configStr == "" {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "missing config field"})
		return
	}

	var sheets []service.SheetImportConfig
	if err := json.Unmarshal([]byte(configStr), &sheets); err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid config JSON", Detail: err.Error()})
		return
	}

	if len(sheets) == 0 {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "no sheets selected"})
		return
	}

	result, err := h.importSvc.ProcessExcel(r.Context(), service.ProcessExcelParams{
		OrgID:     orgID,
		ProjectID: projectID,
		UserID:    userID,
		FileName:  header.Filename,
		Data:      data,
		Sheets:    sheets,
	})
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusCreated, result)
}

// Create godoc
// @Summary Create import job
// @Description Upload a CSV file to import tasks into a project
// @Tags Imports
// @Accept multipart/form-data
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Param projectId path string true "Project ID" format(uuid)
// @Param file formData file true "CSV file to import"
// @Param column_mapping formData string true "JSON column mapping"
// @Success 201 {object} swaggerImportJob
// @Failure 400 {object} ErrorResponse
// @Router /orgs/{orgId}/projects/{projectId}/imports [post]
func (h *ImportHandler) Create(w http.ResponseWriter, r *http.Request) {
	projectID, err := uuidParam(r, "projectId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid project id"})
		return
	}

	orgID := middleware.OrgIDFromCtx(r.Context())
	userID := middleware.UserIDFromCtx(r.Context())

	// Limit upload to 10MB
	r.Body = http.MaxBytesReader(w, r.Body, 10<<20)
	if err := r.ParseMultipartForm(10 << 20); err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "file too large (max 10MB)", Detail: err.Error()})
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "missing file field", Detail: err.Error()})
		return
	}
	defer file.Close()

	// Parse column mapping from form field
	mappingStr := r.FormValue("column_mapping")
	if mappingStr == "" {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "missing column_mapping field"})
		return
	}

	var columnMapping map[string]string
	if err := json.Unmarshal([]byte(mappingStr), &columnMapping); err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid column_mapping JSON", Detail: err.Error()})
		return
	}

	job, err := h.importSvc.ProcessCSV(r.Context(), service.ProcessCSVParams{
		OrgID:         orgID,
		ProjectID:     projectID,
		UserID:        userID,
		FileName:      header.Filename,
		Reader:        file,
		ColumnMapping: columnMapping,
	})
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusCreated, job)
}

// Get godoc
// @Summary Get import job
// @Description Retrieve an import job by ID
// @Tags Imports
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Param projectId path string true "Project ID" format(uuid)
// @Param importId path string true "Import Job ID" format(uuid)
// @Success 200 {object} swaggerImportJob
// @Failure 404 {object} ErrorResponse
// @Router /orgs/{orgId}/projects/{projectId}/imports/{importId} [get]
func (h *ImportHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, err := uuidParam(r, "importId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid import id"})
		return
	}
	job, err := h.importSvc.Get(r.Context(), id)
	if err != nil {
		Error(w, r, err)
		return
	}
	JSON(w, http.StatusOK, job)
}

// List godoc
// @Summary List import jobs
// @Description List all import jobs in a project
// @Tags Imports
// @Produce json
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Param projectId path string true "Project ID" format(uuid)
// @Success 200 {array} swaggerImportJob
// @Router /orgs/{orgId}/projects/{projectId}/imports [get]
func (h *ImportHandler) List(w http.ResponseWriter, r *http.Request) {
	projectID, err := uuidParam(r, "projectId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid project id"})
		return
	}
	jobs, err := h.importSvc.ListByProject(r.Context(), projectID)
	if err != nil {
		Error(w, r, err)
		return
	}
	if jobs == nil {
		jobs = []*domain.ImportJob{}
	}
	JSON(w, http.StatusOK, ListResponse{Data: jobs, Total: len(jobs), Limit: len(jobs), Offset: 0})
}

// ExportExcel godoc
// @Summary Export tasks as Excel
// @Description Export all tasks in a project as an Excel file with hierarchy
// @Tags Imports
// @Produce application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Param projectId path string true "Project ID" format(uuid)
// @Success 200
// @Router /orgs/{orgId}/projects/{projectId}/imports/export [get]
func (h *ImportHandler) ExportExcel(w http.ResponseWriter, r *http.Request) {
	projectID, err := uuidParam(r, "projectId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid project id"})
		return
	}
	orgID := middleware.OrgIDFromCtx(r.Context())

	data, err := h.importSvc.ExportExcel(r.Context(), orgID, projectID)
	if err != nil {
		Error(w, r, err)
		return
	}

	w.Header().Set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
	w.Header().Set("Content-Disposition", "attachment; filename=tasks_export.xlsx")
	w.Header().Set("Content-Length", fmt.Sprintf("%d", len(data)))
	w.Write(data)
}

// ExportCSV godoc
// @Summary Export tasks as CSV
// @Description Export all tasks in a project as a CSV file with parent task and assignee emails
// @Tags Imports
// @Produce text/csv
// @Security BearerAuth
// @Param orgId path string true "Organization ID" format(uuid)
// @Param projectId path string true "Project ID" format(uuid)
// @Success 200
// @Router /orgs/{orgId}/projects/{projectId}/imports/export/csv [get]
func (h *ImportHandler) ExportCSV(w http.ResponseWriter, r *http.Request) {
	projectID, err := uuidParam(r, "projectId")
	if err != nil {
		JSON(w, http.StatusBadRequest, ErrorResponse{Message: "invalid project id"})
		return
	}
	orgID := middleware.OrgIDFromCtx(r.Context())

	data, err := h.importSvc.ExportCSV(r.Context(), orgID, projectID)
	if err != nil {
		Error(w, r, err)
		return
	}

	w.Header().Set("Content-Type", "text/csv")
	w.Header().Set("Content-Disposition", "attachment; filename=tasks_export.csv")
	w.Header().Set("Content-Length", fmt.Sprintf("%d", len(data)))
	w.Write(data)
}
