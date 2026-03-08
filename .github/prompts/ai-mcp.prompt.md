---
applyTo: "backend/internal/ai/**,backend/internal/mcp/**"
---

# AI & MCP Integration — OrbisPM

You are implementing AI features and the MCP (Model Context Protocol) server for OrbisPM.

## MCP Server Architecture

The MCP server runs as a separate Go binary (`cmd/mcp/main.go`) and exposes OrbisPM operations as MCP tools that external AI agents (Claude, ChatGPT, custom agents) can call.

### MCP Server Structure
```
internal/mcp/
├── server.go       # MCP protocol server setup, transport (stdio/SSE)
├── tools.go        # Tool definitions and handlers
└── resources.go    # Resource definitions (read-only data access)
```

### Tool Definitions
Each tool MUST have:
- Clear `name` (verb_noun format): `create_task`, `search_tasks`, `get_project_status`
- Detailed `description` explaining what it does and when to use it
- JSON Schema for `inputSchema` with required fields marked
- Error handling that returns user-friendly messages

### Tool Pattern
```go
func (s *MCPServer) registerTools() {
    s.AddTool(mcp.Tool{
        Name:        "create_task",
        Description: "Create a new task or subtask in a project. Use parentTaskId to create a subtask (max depth 5).",
        InputSchema: mcp.Schema{
            Type: "object",
            Properties: map[string]mcp.Property{
                "projectId":    {Type: "string", Description: "UUID of the project"},
                "title":        {Type: "string", Description: "Task title (required)"},
                "description":  {Type: "string", Description: "Task description (optional)"},
                "parentTaskId": {Type: "string", Description: "Parent task UUID for subtasks (optional)"},
                "priority":     {Type: "string", Enum: []string{"critical", "high", "medium", "low"}},
                "assigneeId":   {Type: "string", Description: "UUID of the assignee (optional)"},
            },
            Required: []string{"projectId", "title"},
        },
    }, s.handleCreateTask)
}
```

### MCP Authentication
- MCP server authenticates requests via API keys or JWT tokens
- Each MCP connection is scoped to an org (org_id from API key)
- RBAC is enforced — AI agents have the same permissions as the API key owner

## AI Completion Reviewer

### Architecture
```
internal/ai/
├── client.go       # LLM client abstraction (supports OpenAI, Anthropic, custom)
├── reviewer.go     # Task completion review logic
├── suggester.go    # Smart suggestion engine
└── prompts.go      # LLM prompt templates (Go templates)
```

### Reviewer Pattern
```go
type ReviewResult struct {
    Passed   bool              `json:"passed"`
    Criteria []CriterionResult `json:"criteria"`
    Summary  string            `json:"summary"`
}

type CriterionResult struct {
    Name    string `json:"name"`
    Passed  bool   `json:"passed"`
    Reason  string `json:"reason"`
}

func (r *Reviewer) Review(ctx context.Context, task *domain.Task, rules []domain.TaskRule) (*ReviewResult, error) {
    // 1. Build prompt from task + rules + checklists + comments
    // 2. Call LLM API
    // 3. Parse structured JSON response
    // 4. Return ReviewResult
}
```

### Rules
- ALL AI calls go through Asynq background jobs — NEVER block HTTP requests
- LLM client is abstracted behind an interface for testing and provider switching
- Prompt templates live in `prompts.go` — use Go template syntax
- AI responses are stored in the activity log for audit
- Rate limit AI reviews per org per plan (Free: 10/mo, Pro: 500/mo)
- NEVER send PII (user emails, passwords) to LLM APIs
- Include task metadata + rules + checklists, NOT user personal data
- AI review results are suggestions — final completion requires human confirmation unless org opts in to auto-complete
