package handler

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/rs/zerolog/log"
	ws "nhooyr.io/websocket"

	"github.com/orbispm/orbispm/internal/cache"
	"github.com/orbispm/orbispm/internal/domain"
	"github.com/orbispm/orbispm/internal/middleware"
	"github.com/orbispm/orbispm/internal/repository"
	"github.com/orbispm/orbispm/internal/service"
	"github.com/orbispm/orbispm/internal/websocket"
)

// WSHandler handles the bi-directional WebSocket for an org-level connection.
type WSHandler struct {
	hub        *websocket.OrgHub
	taskSvc    *service.TaskService
	commentSvc *service.CommentService
	checkSvc   *service.ChecklistService
	depSvc     *service.DependencyService
	watcherSvc *service.WatcherService
	crSvc      *service.TaskChangeRequestService
}

// NewWSHandler creates a new WSHandler.
func NewWSHandler(
	hub *websocket.OrgHub,
	taskSvc *service.TaskService,
	commentSvc *service.CommentService,
	checkSvc *service.ChecklistService,
	depSvc *service.DependencyService,
	watcherSvc *service.WatcherService,
	crSvc *service.TaskChangeRequestService,
) *WSHandler {
	return &WSHandler{
		hub:        hub,
		taskSvc:    taskSvc,
		commentSvc: commentSvc,
		checkSvc:   checkSvc,
		depSvc:     depSvc,
		watcherSvc: watcherSvc,
		crSvc:      crSvc,
	}
}

// ServeWS upgrades to WebSocket and runs the read/write pump for an org connection.
func (h *WSHandler) ServeWS(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromCtx(r.Context())
	orgID := middleware.OrgIDFromCtx(r.Context())

	if userID == uuid.Nil || orgID == uuid.Nil {
		http.Error(w, `{"message":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	// Clear HTTP server read/write deadlines so the long-lived WS isn't killed.
	rc := http.NewResponseController(w)
	_ = rc.SetReadDeadline(time.Time{})
	_ = rc.SetWriteDeadline(time.Time{})

	c, err := ws.Accept(w, r, &ws.AcceptOptions{
		OriginPatterns: []string{"*"},
	})
	if err != nil {
		log.Error().Err(err).Msg("ws: accept failed")
		return
	}

	conn := websocket.NewOrgConn(userID, orgID, c, 256)

	h.hub.Join(conn)
	defer h.hub.Leave(conn)

	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()

	// Start write pump in background
	go websocket.OrgWritePump(ctx, conn)

	// Send initial connection info
	h.hub.SendTo(conn, websocket.WSMessage{
		Action:  "connected",
		Payload: mustMarshal(map[string]any{"org_size": h.hub.OrgSize(orgID)}),
	})

	// Read pump: read messages from client and dispatch
	for {
		_, data, err := c.Read(ctx)
		if err != nil {
			break // Client disconnected
		}

		var msg websocket.WSMessage
		if err := json.Unmarshal(data, &msg); err != nil {
			h.hub.SendTo(conn, websocket.WSMessage{
				Action: "error",
				Error:  "invalid message format",
			})
			continue
		}

		h.dispatch(ctx, conn, msg)
	}
}

// dispatch routes a WebSocket message to the appropriate handler.
func (h *WSHandler) dispatch(ctx context.Context, conn *websocket.OrgConn, msg websocket.WSMessage) {
	switch msg.Action {
	// ──── Project room ────
	case "project:join":
		h.handleProjectJoin(conn, msg)
	case "project:leave":
		h.handleProjectLeave(conn, msg)

	// ──── Task CRUD ────
	case "task:list":
		h.handleTaskList(ctx, conn, msg)
	case "task:tree":
		h.handleTaskTree(ctx, conn, msg)
	case "task:get":
		h.handleTaskGet(ctx, conn, msg)
	case "task:create":
		h.handleTaskCreate(ctx, conn, msg)
	case "task:update":
		h.handleTaskUpdate(ctx, conn, msg)
	case "task:delete":
		h.handleTaskDelete(ctx, conn, msg)
	case "task:bulk-create":
		h.handleTaskBulkCreate(ctx, conn, msg)
	case "task:bulk-update":
		h.handleTaskBulkUpdate(ctx, conn, msg)
	case "task:reorder":
		h.handleTaskReorder(ctx, conn, msg)
	case "task:duplicate":
		h.handleTaskDuplicate(ctx, conn, msg)
	case "task:submit-review":
		h.handleTaskSubmitReview(ctx, conn, msg)
	case "task:complete":
		h.handleTaskComplete(ctx, conn, msg)

	// ──── Checklists ────
	case "checklist:list":
		h.handleChecklistList(ctx, conn, msg)
	case "checklist:create":
		h.handleChecklistCreate(ctx, conn, msg)
	case "checklist:update":
		h.handleChecklistUpdate(ctx, conn, msg)
	case "checklist:delete":
		h.handleChecklistDelete(ctx, conn, msg)

	// ──── Comments ────
	case "comment:list":
		h.handleCommentList(ctx, conn, msg)
	case "comment:create":
		h.handleCommentCreate(ctx, conn, msg)
	case "comment:delete":
		h.handleCommentDelete(ctx, conn, msg)

	// ──── Dependencies ────
	case "dependency:list":
		h.handleDependencyList(ctx, conn, msg)
	case "dependency:add":
		h.handleDependencyAdd(ctx, conn, msg)
	case "dependency:remove":
		h.handleDependencyRemove(ctx, conn, msg)

	// ──── Watchers ────
	case "watcher:list":
		h.handleWatcherList(ctx, conn, msg)
	case "watcher:watch":
		h.handleWatcherWatch(ctx, conn, msg)
	case "watcher:unwatch":
		h.handleWatcherUnwatch(ctx, conn, msg)

	// ──── Change Requests ────
	case "cr:list":
		h.handleCRList(ctx, conn, msg)
	case "cr:approve":
		h.handleCRApprove(ctx, conn, msg)
	case "cr:reject":
		h.handleCRReject(ctx, conn, msg)

	default:
		h.reply(conn, msg.ID, msg.Action, nil, "unknown action: "+msg.Action)
	}
}

// ═══════════════════════════════════════
//  Helper methods
// ═══════════════════════════════════════

func (h *WSHandler) reply(conn *websocket.OrgConn, reqID, action string, payload any, errMsg string) {
	msg := websocket.WSMessage{ID: reqID, Action: action, Error: errMsg}
	if payload != nil {
		msg.Payload = mustMarshal(payload)
	}
	h.hub.SendTo(conn, msg)
}

func (h *WSHandler) broadcastProject(orgID, projectID uuid.UUID, action string, payload any, actorID string, exclude *websocket.OrgConn) {
	msg := websocket.WSMessage{Action: action, ActorID: actorID}
	if payload != nil {
		msg.Payload = mustMarshal(payload)
	}
	h.hub.BroadcastProject(orgID, projectID, msg, exclude)
}

func mustMarshal(v any) json.RawMessage {
	data, _ := json.Marshal(v)
	return data
}

func parsePayload[T any](raw json.RawMessage) (T, error) {
	var v T
	err := json.Unmarshal(raw, &v)
	return v, err
}

func extractProjectID(raw json.RawMessage) (uuid.UUID, error) {
	var p struct {
		ProjectID string `json:"project_id"`
	}
	if err := json.Unmarshal(raw, &p); err != nil || p.ProjectID == "" {
		return uuid.Nil, fmt.Errorf("missing project_id")
	}
	return uuid.Parse(p.ProjectID)
}

// ═══════════════════════════════════════
//  Project Room Handlers
// ═══════════════════════════════════════

func (h *WSHandler) handleProjectJoin(conn *websocket.OrgConn, msg websocket.WSMessage) {
	type req struct {
		ProjectID string `json:"project_id"`
	}
	r, _ := parsePayload[req](msg.Payload)
	pid, err := uuid.Parse(r.ProjectID)
	if err != nil {
		h.reply(conn, msg.ID, msg.Action, nil, "invalid project_id")
		return
	}

	conn.JoinProject(pid)
	roomSize := h.hub.ProjectRoomSize(conn.OrgID, pid)
	h.reply(conn, msg.ID, msg.Action, map[string]any{
		"project_id": r.ProjectID,
		"room_size":  roomSize,
	}, "")

	// Trigger cache preload in background
	go h.taskSvc.PreloadProjectCache(context.Background(), pid)

	log.Info().
		Str("user_id", conn.UserID.String()).
		Str("project_id", r.ProjectID).
		Int("room_size", roomSize).
		Msg("ws: user joined project room")
}

func (h *WSHandler) handleProjectLeave(conn *websocket.OrgConn, msg websocket.WSMessage) {
	type req struct {
		ProjectID string `json:"project_id"`
	}
	r, _ := parsePayload[req](msg.Payload)
	pid, err := uuid.Parse(r.ProjectID)
	if err != nil {
		h.reply(conn, msg.ID, msg.Action, nil, "invalid project_id")
		return
	}

	conn.LeaveProject(pid)
	h.reply(conn, msg.ID, msg.Action, map[string]any{
		"project_id": r.ProjectID,
	}, "")
}

// ═══════════════════════════════════════
//  Task Handlers
// ═══════════════════════════════════════

func (h *WSHandler) handleTaskList(ctx context.Context, conn *websocket.OrgConn, msg websocket.WSMessage) {
	projectID, err := extractProjectID(msg.Payload)
	if err != nil {
		h.reply(conn, msg.ID, msg.Action, nil, err.Error())
		return
	}

	type listReq struct {
		Limit       int      `json:"limit"`
		Offset      int      `json:"offset"`
		Status      string   `json:"status"`
		Priority    string   `json:"priority"`
		AssigneeID  string   `json:"assignee_id"`
		ParentID    string   `json:"parent_id"`
		Search      string   `json:"search"`
		SortBy      string   `json:"sort_by"`
		SortOrder   string   `json:"sort_order"`
		Statuses    []string `json:"statuses"`
		Priorities  []string `json:"priorities"`
		AssigneeIDs []string `json:"assignee_ids"`
		Labels      []string `json:"labels"`
		DueDateFrom string   `json:"due_date_from"`
		DueDateTo   string   `json:"due_date_to"`
	}
	req, _ := parsePayload[listReq](msg.Payload)

	filter := repository.TaskFilter{
		SortBy:    req.SortBy,
		SortOrder: req.SortOrder,
	}
	filter.Limit = req.Limit
	filter.Offset = req.Offset
	if req.Status != "" {
		filter.Status = &req.Status
	}
	if req.Priority != "" {
		filter.Priority = &req.Priority
	}
	if req.Search != "" {
		filter.Search = &req.Search
	}
	if req.AssigneeID != "" {
		if uid, err := uuid.Parse(req.AssigneeID); err == nil {
			filter.AssigneeID = &uid
		}
	}
	if req.ParentID != "" {
		filter.ParentID = &req.ParentID
	}
	// Multi-value filters
	if len(req.Statuses) > 0 {
		filter.Statuses = req.Statuses
	}
	if len(req.Priorities) > 0 {
		filter.Priorities = req.Priorities
	}
	if len(req.AssigneeIDs) > 0 {
		for _, idStr := range req.AssigneeIDs {
			if uid, err := uuid.Parse(idStr); err == nil {
				filter.AssigneeIDs = append(filter.AssigneeIDs, uid)
			}
		}
	}
	if len(req.Labels) > 0 {
		filter.Labels = req.Labels
	}
	if req.DueDateFrom != "" {
		filter.DueDateFrom = &req.DueDateFrom
	}
	if req.DueDateTo != "" {
		filter.DueDateTo = &req.DueDateTo
	}
	if filter.Limit == 0 {
		filter.Limit = 100
	}

	tasks, total, err := h.taskSvc.List(ctx, projectID, filter)
	if err != nil {
		h.reply(conn, msg.ID, msg.Action, nil, err.Error())
		return
	}
	h.reply(conn, msg.ID, msg.Action, map[string]any{
		"data": tasks, "total": total, "limit": filter.Limit, "offset": filter.Offset,
	}, "")
}

func (h *WSHandler) handleTaskTree(ctx context.Context, conn *websocket.OrgConn, msg websocket.WSMessage) {
	projectID, err := extractProjectID(msg.Payload)
	if err != nil {
		h.reply(conn, msg.ID, msg.Action, nil, err.Error())
		return
	}

	tasks, err := h.taskSvc.ListTreeByProject(ctx, projectID)
	if err != nil {
		h.reply(conn, msg.ID, msg.Action, nil, err.Error())
		return
	}
	tree := buildTaskTree(tasks)
	h.reply(conn, msg.ID, msg.Action, tree, "")
}

func (h *WSHandler) handleTaskGet(ctx context.Context, conn *websocket.OrgConn, msg websocket.WSMessage) {
	type getReq struct {
		TaskID string `json:"task_id"`
	}
	req, _ := parsePayload[getReq](msg.Payload)
	id, err := uuid.Parse(req.TaskID)
	if err != nil {
		h.reply(conn, msg.ID, msg.Action, nil, "invalid task_id")
		return
	}
	task, err := h.taskSvc.Get(ctx, id)
	if err != nil {
		h.reply(conn, msg.ID, msg.Action, nil, err.Error())
		return
	}
	h.reply(conn, msg.ID, msg.Action, task, "")
}

func (h *WSHandler) handleTaskCreate(ctx context.Context, conn *websocket.OrgConn, msg websocket.WSMessage) {
	projectID, err := extractProjectID(msg.Payload)
	if err != nil {
		h.reply(conn, msg.ID, msg.Action, nil, err.Error())
		return
	}

	var params service.CreateTaskParams
	if err := json.Unmarshal(msg.Payload, &params); err != nil {
		h.reply(conn, msg.ID, msg.Action, nil, "invalid payload")
		return
	}
	params.OrgID = conn.OrgID
	params.ProjectID = projectID

	result, err := h.taskSvc.Create(ctx, params)
	if err != nil {
		h.reply(conn, msg.ID, msg.Action, nil, err.Error())
		return
	}

	// If only deadline conflicts returned (no task created), send warning
	if result.Task == nil && len(result.DeadlineConflicts) > 0 {
		h.reply(conn, msg.ID, "task:deadline-warning", result, "")
		return
	}

	h.reply(conn, msg.ID, msg.Action, result.Task, "")
	h.broadcastProject(conn.OrgID, projectID, "task:created", result.Task, conn.UserID.String(), conn)

	// If ancestors were updated, broadcast those updates too
	for _, anc := range result.AncestorsUpdated {
		h.broadcastProject(conn.OrgID, projectID, "task:updated", &domain.TaskUpdateResult{Task: anc}, "", nil)
	}
}

func (h *WSHandler) handleTaskUpdate(ctx context.Context, conn *websocket.OrgConn, msg websocket.WSMessage) {
	projectID, err := extractProjectID(msg.Payload)
	if err != nil {
		h.reply(conn, msg.ID, msg.Action, nil, err.Error())
		return
	}

	type updateReq struct {
		TaskID string `json:"task_id"`
		service.UpdateTaskParams
	}
	var req updateReq
	if err := json.Unmarshal(msg.Payload, &req); err != nil {
		h.reply(conn, msg.ID, msg.Action, nil, "invalid payload")
		return
	}

	id, err := uuid.Parse(req.TaskID)
	if err != nil {
		h.reply(conn, msg.ID, msg.Action, nil, "invalid task_id")
		return
	}
	req.UpdateTaskParams.ActorID = &conn.UserID

	result, err := h.taskSvc.Update(ctx, id, req.UpdateTaskParams)
	if err != nil {
		// Check for cache conflict error
		var conflictErr *cache.ConflictError
		if errors.As(err, &conflictErr) {
			h.reply(conn, msg.ID, "task:conflict", conflictErr, "")
			return
		}
		h.reply(conn, msg.ID, msg.Action, nil, err.Error())
		return
	}

	// If only deadline conflicts returned (no actual update), send warning
	if len(result.DeadlineConflicts) > 0 && len(result.AppliedChanges) == 0 {
		h.reply(conn, msg.ID, "task:deadline-warning", result, "")
		return
	}

	h.reply(conn, msg.ID, msg.Action, result, "")
	h.broadcastProject(conn.OrgID, projectID, "task:updated", result, conn.UserID.String(), conn)

	// If ancestors were updated, broadcast those updates too
	for _, anc := range result.AncestorsUpdated {
		h.broadcastProject(conn.OrgID, projectID, "task:updated", &domain.TaskUpdateResult{Task: anc}, "", nil)
	}
}

func (h *WSHandler) handleTaskDelete(ctx context.Context, conn *websocket.OrgConn, msg websocket.WSMessage) {
	projectID, err := extractProjectID(msg.Payload)
	if err != nil {
		h.reply(conn, msg.ID, msg.Action, nil, err.Error())
		return
	}

	type delReq struct {
		TaskID string `json:"task_id"`
	}
	req, _ := parsePayload[delReq](msg.Payload)
	id, err := uuid.Parse(req.TaskID)
	if err != nil {
		h.reply(conn, msg.ID, msg.Action, nil, "invalid task_id")
		return
	}
	progressAncestors, err := h.taskSvc.Delete(ctx, id)
	if err != nil {
		h.reply(conn, msg.ID, msg.Action, nil, err.Error())
		return
	}

	h.reply(conn, msg.ID, msg.Action, map[string]string{"task_id": req.TaskID}, "")
	h.broadcastProject(conn.OrgID, projectID, "task:deleted", map[string]string{"task_id": req.TaskID}, conn.UserID.String(), conn)

	// Broadcast progress-updated ancestors
	for _, anc := range progressAncestors {
		h.broadcastProject(conn.OrgID, projectID, "task:updated", &domain.TaskUpdateResult{Task: anc}, "", nil)
	}
}

func (h *WSHandler) handleTaskBulkCreate(ctx context.Context, conn *websocket.OrgConn, msg websocket.WSMessage) {
	projectID, err := extractProjectID(msg.Payload)
	if err != nil {
		h.reply(conn, msg.ID, msg.Action, nil, err.Error())
		return
	}

	var params service.BulkCreateParams
	if err := json.Unmarshal(msg.Payload, &params); err != nil {
		h.reply(conn, msg.ID, msg.Action, nil, "invalid payload")
		return
	}
	params.OrgID = conn.OrgID
	params.ProjectID = projectID

	tasks, err := h.taskSvc.BulkCreate(ctx, params)
	if err != nil {
		h.reply(conn, msg.ID, msg.Action, nil, err.Error())
		return
	}

	h.reply(conn, msg.ID, msg.Action, tasks, "")
	h.broadcastProject(conn.OrgID, projectID, "task:bulk-created", tasks, conn.UserID.String(), conn)
}

func (h *WSHandler) handleTaskBulkUpdate(ctx context.Context, conn *websocket.OrgConn, msg websocket.WSMessage) {
	projectID, err := extractProjectID(msg.Payload)
	if err != nil {
		h.reply(conn, msg.ID, msg.Action, nil, err.Error())
		return
	}

	var params service.BulkUpdateParams
	if err := json.Unmarshal(msg.Payload, &params); err != nil {
		h.reply(conn, msg.ID, msg.Action, nil, "invalid payload")
		return
	}

	tasks, err := h.taskSvc.BulkUpdate(ctx, params)
	if err != nil {
		h.reply(conn, msg.ID, msg.Action, nil, err.Error())
		return
	}

	h.reply(conn, msg.ID, msg.Action, tasks, "")
	h.broadcastProject(conn.OrgID, projectID, "task:bulk-updated", tasks, conn.UserID.String(), conn)
}

func (h *WSHandler) handleTaskReorder(ctx context.Context, conn *websocket.OrgConn, msg websocket.WSMessage) {
	projectID, err := extractProjectID(msg.Payload)
	if err != nil {
		h.reply(conn, msg.ID, msg.Action, nil, err.Error())
		return
	}

	type reorderReq struct {
		Items []service.ReorderItem `json:"items"`
	}
	req, _ := parsePayload[reorderReq](msg.Payload)
	if err := h.taskSvc.Reorder(ctx, req.Items); err != nil {
		h.reply(conn, msg.ID, msg.Action, nil, err.Error())
		return
	}

	h.reply(conn, msg.ID, msg.Action, map[string]string{"status": "ok"}, "")
	h.broadcastProject(conn.OrgID, projectID, "task:reordered", req.Items, conn.UserID.String(), conn)
}

func (h *WSHandler) handleTaskDuplicate(ctx context.Context, conn *websocket.OrgConn, msg websocket.WSMessage) {
	projectID, err := extractProjectID(msg.Payload)
	if err != nil {
		h.reply(conn, msg.ID, msg.Action, nil, err.Error())
		return
	}

	type dupReq struct {
		TaskID string `json:"task_id"`
	}
	req, _ := parsePayload[dupReq](msg.Payload)
	id, err := uuid.Parse(req.TaskID)
	if err != nil {
		h.reply(conn, msg.ID, msg.Action, nil, "invalid task_id")
		return
	}

	task, err := h.taskSvc.Duplicate(ctx, id)
	if err != nil {
		h.reply(conn, msg.ID, msg.Action, nil, err.Error())
		return
	}

	h.reply(conn, msg.ID, msg.Action, task, "")
	h.broadcastProject(conn.OrgID, projectID, "task:created", task, conn.UserID.String(), conn)
}

func (h *WSHandler) handleTaskSubmitReview(ctx context.Context, conn *websocket.OrgConn, msg websocket.WSMessage) {
	projectID, err := extractProjectID(msg.Payload)
	if err != nil {
		h.reply(conn, msg.ID, msg.Action, nil, err.Error())
		return
	}

	type req struct {
		TaskID string `json:"task_id"`
	}
	r, _ := parsePayload[req](msg.Payload)
	id, err := uuid.Parse(r.TaskID)
	if err != nil {
		h.reply(conn, msg.ID, msg.Action, nil, "invalid task_id")
		return
	}

	task, err := h.taskSvc.SubmitForReview(ctx, id)
	if err != nil {
		h.reply(conn, msg.ID, msg.Action, nil, err.Error())
		return
	}

	h.reply(conn, msg.ID, msg.Action, task, "")
	h.broadcastProject(conn.OrgID, projectID, "task:updated", map[string]any{"task": task}, conn.UserID.String(), conn)
}

func (h *WSHandler) handleTaskComplete(ctx context.Context, conn *websocket.OrgConn, msg websocket.WSMessage) {
	projectID, err := extractProjectID(msg.Payload)
	if err != nil {
		h.reply(conn, msg.ID, msg.Action, nil, err.Error())
		return
	}

	type req struct {
		TaskID string `json:"task_id"`
	}
	r, _ := parsePayload[req](msg.Payload)
	id, err := uuid.Parse(r.TaskID)
	if err != nil {
		h.reply(conn, msg.ID, msg.Action, nil, "invalid task_id")
		return
	}

	task, err := h.taskSvc.MarkComplete(ctx, id)
	if err != nil {
		h.reply(conn, msg.ID, msg.Action, nil, err.Error())
		return
	}

	h.reply(conn, msg.ID, msg.Action, task, "")
	h.broadcastProject(conn.OrgID, projectID, "task:updated", map[string]any{"task": task}, conn.UserID.String(), conn)
}

// ═══════════════════════════════════════
//  Checklist Handlers
// ═══════════════════════════════════════

func (h *WSHandler) handleChecklistList(ctx context.Context, conn *websocket.OrgConn, msg websocket.WSMessage) {
	type req struct {
		TaskID string `json:"task_id"`
	}
	r, _ := parsePayload[req](msg.Payload)
	taskID, err := uuid.Parse(r.TaskID)
	if err != nil {
		h.reply(conn, msg.ID, msg.Action, nil, "invalid task_id")
		return
	}

	items, err := h.checkSvc.ListByTask(ctx, taskID)
	if err != nil {
		h.reply(conn, msg.ID, msg.Action, nil, err.Error())
		return
	}
	h.reply(conn, msg.ID, msg.Action, map[string]any{"data": items, "total": len(items)}, "")
}

func (h *WSHandler) handleChecklistCreate(ctx context.Context, conn *websocket.OrgConn, msg websocket.WSMessage) {
	projectID, err := extractProjectID(msg.Payload)
	if err != nil {
		h.reply(conn, msg.ID, msg.Action, nil, err.Error())
		return
	}

	type req struct {
		TaskID string `json:"task_id"`
		service.CreateChecklistParams
	}
	var r req
	if err := json.Unmarshal(msg.Payload, &r); err != nil {
		h.reply(conn, msg.ID, msg.Action, nil, "invalid payload")
		return
	}
	taskID, err := uuid.Parse(r.TaskID)
	if err != nil {
		h.reply(conn, msg.ID, msg.Action, nil, "invalid task_id")
		return
	}
	r.CreateChecklistParams.OrgID = conn.OrgID
	r.CreateChecklistParams.TaskID = taskID

	item, err := h.checkSvc.Create(ctx, r.CreateChecklistParams)
	if err != nil {
		h.reply(conn, msg.ID, msg.Action, nil, err.Error())
		return
	}

	h.reply(conn, msg.ID, msg.Action, item, "")
	h.broadcastProject(conn.OrgID, projectID, "checklist:created", map[string]any{"task_id": r.TaskID, "item": item}, conn.UserID.String(), conn)
}

func (h *WSHandler) handleChecklistUpdate(ctx context.Context, conn *websocket.OrgConn, msg websocket.WSMessage) {
	projectID, err := extractProjectID(msg.Payload)
	if err != nil {
		h.reply(conn, msg.ID, msg.Action, nil, err.Error())
		return
	}

	type req struct {
		TaskID string `json:"task_id"`
		ID     string `json:"id"`
		service.UpdateChecklistParams
	}
	var r req
	if err := json.Unmarshal(msg.Payload, &r); err != nil {
		h.reply(conn, msg.ID, msg.Action, nil, "invalid payload")
		return
	}
	id, err := uuid.Parse(r.ID)
	if err != nil {
		h.reply(conn, msg.ID, msg.Action, nil, "invalid id")
		return
	}

	item, err := h.checkSvc.Update(ctx, id, r.UpdateChecklistParams)
	if err != nil {
		h.reply(conn, msg.ID, msg.Action, nil, err.Error())
		return
	}

	h.reply(conn, msg.ID, msg.Action, item, "")
	h.broadcastProject(conn.OrgID, projectID, "checklist:updated", map[string]any{"task_id": r.TaskID, "item": item}, conn.UserID.String(), conn)
}

func (h *WSHandler) handleChecklistDelete(ctx context.Context, conn *websocket.OrgConn, msg websocket.WSMessage) {
	projectID, err := extractProjectID(msg.Payload)
	if err != nil {
		h.reply(conn, msg.ID, msg.Action, nil, err.Error())
		return
	}

	type req struct {
		TaskID string `json:"task_id"`
		ID     string `json:"id"`
	}
	r, _ := parsePayload[req](msg.Payload)
	id, err := uuid.Parse(r.ID)
	if err != nil {
		h.reply(conn, msg.ID, msg.Action, nil, "invalid id")
		return
	}

	if err := h.checkSvc.Delete(ctx, id); err != nil {
		h.reply(conn, msg.ID, msg.Action, nil, err.Error())
		return
	}

	h.reply(conn, msg.ID, msg.Action, map[string]string{"id": r.ID}, "")
	h.broadcastProject(conn.OrgID, projectID, "checklist:deleted", map[string]string{"task_id": r.TaskID, "id": r.ID}, conn.UserID.String(), conn)
}

// ═══════════════════════════════════════
//  Comment Handlers
// ═══════════════════════════════════════

func (h *WSHandler) handleCommentList(ctx context.Context, conn *websocket.OrgConn, msg websocket.WSMessage) {
	type req struct {
		TaskID string `json:"task_id"`
	}
	r, _ := parsePayload[req](msg.Payload)
	taskID, err := uuid.Parse(r.TaskID)
	if err != nil {
		h.reply(conn, msg.ID, msg.Action, nil, "invalid task_id")
		return
	}

	items, err := h.commentSvc.ListByTask(ctx, taskID)
	if err != nil {
		h.reply(conn, msg.ID, msg.Action, nil, err.Error())
		return
	}
	h.reply(conn, msg.ID, msg.Action, map[string]any{"data": items, "total": len(items)}, "")
}

func (h *WSHandler) handleCommentCreate(ctx context.Context, conn *websocket.OrgConn, msg websocket.WSMessage) {
	projectID, err := extractProjectID(msg.Payload)
	if err != nil {
		h.reply(conn, msg.ID, msg.Action, nil, err.Error())
		return
	}

	type req struct {
		TaskID   string     `json:"task_id"`
		Body     string     `json:"body"`
		ParentID *uuid.UUID `json:"parent_id,omitempty"`
	}
	var r req
	if err := json.Unmarshal(msg.Payload, &r); err != nil {
		h.reply(conn, msg.ID, msg.Action, nil, "invalid payload")
		return
	}
	taskID, err := uuid.Parse(r.TaskID)
	if err != nil {
		h.reply(conn, msg.ID, msg.Action, nil, "invalid task_id")
		return
	}

	item, err := h.commentSvc.Create(ctx, service.CreateCommentParams{
		OrgID:    conn.OrgID,
		TaskID:   taskID,
		UserID:   conn.UserID,
		Body:     r.Body,
		ParentID: r.ParentID,
	})
	if err != nil {
		h.reply(conn, msg.ID, msg.Action, nil, err.Error())
		return
	}

	h.reply(conn, msg.ID, msg.Action, item, "")
	h.broadcastProject(conn.OrgID, projectID, "comment:created", map[string]any{"task_id": r.TaskID, "item": item}, conn.UserID.String(), conn)
}

func (h *WSHandler) handleCommentDelete(ctx context.Context, conn *websocket.OrgConn, msg websocket.WSMessage) {
	projectID, err := extractProjectID(msg.Payload)
	if err != nil {
		h.reply(conn, msg.ID, msg.Action, nil, err.Error())
		return
	}

	type req struct {
		TaskID string `json:"task_id"`
		ID     string `json:"id"`
	}
	r, _ := parsePayload[req](msg.Payload)
	id, err := uuid.Parse(r.ID)
	if err != nil {
		h.reply(conn, msg.ID, msg.Action, nil, "invalid id")
		return
	}

	if err := h.commentSvc.Delete(ctx, id); err != nil {
		h.reply(conn, msg.ID, msg.Action, nil, err.Error())
		return
	}

	h.reply(conn, msg.ID, msg.Action, map[string]string{"id": r.ID}, "")
	h.broadcastProject(conn.OrgID, projectID, "comment:deleted", map[string]string{"task_id": r.TaskID, "id": r.ID}, conn.UserID.String(), conn)
}

// ═══════════════════════════════════════
//  Dependency Handlers
// ═══════════════════════════════════════

func (h *WSHandler) handleDependencyList(ctx context.Context, conn *websocket.OrgConn, msg websocket.WSMessage) {
	type req struct {
		TaskID string `json:"task_id"`
	}
	r, _ := parsePayload[req](msg.Payload)
	taskID, err := uuid.Parse(r.TaskID)
	if err != nil {
		h.reply(conn, msg.ID, msg.Action, nil, "invalid task_id")
		return
	}

	items, err := h.depSvc.ListByTask(ctx, taskID)
	if err != nil {
		h.reply(conn, msg.ID, msg.Action, nil, err.Error())
		return
	}
	h.reply(conn, msg.ID, msg.Action, map[string]any{"data": items, "total": len(items)}, "")
}

func (h *WSHandler) handleDependencyAdd(ctx context.Context, conn *websocket.OrgConn, msg websocket.WSMessage) {
	projectID, err := extractProjectID(msg.Payload)
	if err != nil {
		h.reply(conn, msg.ID, msg.Action, nil, err.Error())
		return
	}

	type req struct {
		TaskID      string `json:"task_id"`
		DependsOnID string `json:"depends_on_id"`
		Type        string `json:"type"`
	}
	var r req
	if err := json.Unmarshal(msg.Payload, &r); err != nil {
		h.reply(conn, msg.ID, msg.Action, nil, "invalid payload")
		return
	}
	taskID, _ := uuid.Parse(r.TaskID)
	depOnID, _ := uuid.Parse(r.DependsOnID)

	if err := h.depSvc.Add(ctx, service.AddDependencyParams{
		TaskID: taskID, DependsOnID: depOnID, Type: r.Type,
	}); err != nil {
		h.reply(conn, msg.ID, msg.Action, nil, err.Error())
		return
	}

	h.reply(conn, msg.ID, msg.Action, map[string]string{"status": "ok"}, "")
	h.broadcastProject(conn.OrgID, projectID, "dependency:added", r, conn.UserID.String(), conn)
}

func (h *WSHandler) handleDependencyRemove(ctx context.Context, conn *websocket.OrgConn, msg websocket.WSMessage) {
	projectID, err := extractProjectID(msg.Payload)
	if err != nil {
		h.reply(conn, msg.ID, msg.Action, nil, err.Error())
		return
	}

	type req struct {
		TaskID      string `json:"task_id"`
		DependsOnID string `json:"depends_on_id"`
	}
	r, _ := parsePayload[req](msg.Payload)
	taskID, _ := uuid.Parse(r.TaskID)
	depOnID, _ := uuid.Parse(r.DependsOnID)

	if err := h.depSvc.Remove(ctx, taskID, depOnID); err != nil {
		h.reply(conn, msg.ID, msg.Action, nil, err.Error())
		return
	}

	h.reply(conn, msg.ID, msg.Action, map[string]string{"status": "ok"}, "")
	h.broadcastProject(conn.OrgID, projectID, "dependency:removed", r, conn.UserID.String(), conn)
}

// ═══════════════════════════════════════
//  Watcher Handlers
// ═══════════════════════════════════════

func (h *WSHandler) handleWatcherList(ctx context.Context, conn *websocket.OrgConn, msg websocket.WSMessage) {
	type req struct {
		TaskID string `json:"task_id"`
	}
	r, _ := parsePayload[req](msg.Payload)
	taskID, err := uuid.Parse(r.TaskID)
	if err != nil {
		h.reply(conn, msg.ID, msg.Action, nil, "invalid task_id")
		return
	}

	items, err := h.watcherSvc.ListByTask(ctx, taskID)
	if err != nil {
		h.reply(conn, msg.ID, msg.Action, nil, err.Error())
		return
	}
	h.reply(conn, msg.ID, msg.Action, map[string]any{"data": items, "total": len(items)}, "")
}

func (h *WSHandler) handleWatcherWatch(ctx context.Context, conn *websocket.OrgConn, msg websocket.WSMessage) {
	type req struct {
		TaskID string `json:"task_id"`
	}
	r, _ := parsePayload[req](msg.Payload)
	taskID, _ := uuid.Parse(r.TaskID)

	if err := h.watcherSvc.Watch(ctx, taskID, conn.UserID); err != nil {
		h.reply(conn, msg.ID, msg.Action, nil, err.Error())
		return
	}
	h.reply(conn, msg.ID, msg.Action, map[string]string{"status": "ok"}, "")
}

func (h *WSHandler) handleWatcherUnwatch(ctx context.Context, conn *websocket.OrgConn, msg websocket.WSMessage) {
	type req struct {
		TaskID string `json:"task_id"`
	}
	r, _ := parsePayload[req](msg.Payload)
	taskID, _ := uuid.Parse(r.TaskID)

	if err := h.watcherSvc.Unwatch(ctx, taskID, conn.UserID); err != nil {
		h.reply(conn, msg.ID, msg.Action, nil, err.Error())
		return
	}
	h.reply(conn, msg.ID, msg.Action, map[string]string{"status": "ok"}, "")
}

// ═══════════════════════════════════════
//  Change Request Handlers
// ═══════════════════════════════════════

func (h *WSHandler) handleCRList(ctx context.Context, conn *websocket.OrgConn, msg websocket.WSMessage) {
	projectID, err := extractProjectID(msg.Payload)
	if err != nil {
		h.reply(conn, msg.ID, msg.Action, nil, err.Error())
		return
	}

	type req struct {
		TaskID string  `json:"task_id"`
		Status *string `json:"status"`
	}
	r, _ := parsePayload[req](msg.Payload)

	if r.TaskID != "" {
		taskID, _ := uuid.Parse(r.TaskID)
		items, err := h.crSvc.ListByTask(ctx, taskID, r.Status)
		if err != nil {
			h.reply(conn, msg.ID, msg.Action, nil, err.Error())
			return
		}
		h.reply(conn, msg.ID, msg.Action, map[string]any{"data": items, "total": len(items)}, "")
	} else {
		items, total, err := h.crSvc.ListByProject(ctx, projectID, r.Status, 50, 0)
		if err != nil {
			h.reply(conn, msg.ID, msg.Action, nil, err.Error())
			return
		}
		h.reply(conn, msg.ID, msg.Action, map[string]any{"data": items, "total": total}, "")
	}
}

func (h *WSHandler) handleCRApprove(ctx context.Context, conn *websocket.OrgConn, msg websocket.WSMessage) {
	projectID, err := extractProjectID(msg.Payload)
	if err != nil {
		h.reply(conn, msg.ID, msg.Action, nil, err.Error())
		return
	}

	type req struct {
		ID   string `json:"id"`
		Note string `json:"note"`
	}
	r, _ := parsePayload[req](msg.Payload)
	crID, _ := uuid.Parse(r.ID)

	cr, err := h.crSvc.Approve(ctx, crID, conn.UserID, r.Note)
	if err != nil {
		h.reply(conn, msg.ID, msg.Action, nil, err.Error())
		return
	}

	h.reply(conn, msg.ID, msg.Action, cr, "")
	h.broadcastProject(conn.OrgID, projectID, "cr:approved", cr, conn.UserID.String(), conn)
}

func (h *WSHandler) handleCRReject(ctx context.Context, conn *websocket.OrgConn, msg websocket.WSMessage) {
	projectID, err := extractProjectID(msg.Payload)
	if err != nil {
		h.reply(conn, msg.ID, msg.Action, nil, err.Error())
		return
	}

	type req struct {
		ID   string `json:"id"`
		Note string `json:"note"`
	}
	r, _ := parsePayload[req](msg.Payload)
	crID, _ := uuid.Parse(r.ID)

	cr, err := h.crSvc.Reject(ctx, crID, conn.UserID, r.Note)
	if err != nil {
		h.reply(conn, msg.ID, msg.Action, nil, err.Error())
		return
	}

	h.reply(conn, msg.ID, msg.Action, cr, "")
	h.broadcastProject(conn.OrgID, projectID, "cr:rejected", cr, conn.UserID.String(), conn)
}
