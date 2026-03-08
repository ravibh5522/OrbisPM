---
applyTo: "**/*_test.go,**/tests/**"
---

# Testing — OrbisPM

You are writing tests for OrbisPM. Follow these testing principles.

## Testing Layers

### Unit Tests (Service Layer)
- Test business logic in isolation
- Mock repository interfaces
- Verify: data validation, depth enforcement, permission logic, rule evaluation
- Location: alongside source files (`task_service_test.go` next to `task_service.go`)

### Integration Tests (Full Stack)
- Test handler → service → repository → database
- Use real PostgreSQL and Redis via Docker Compose
- Verify: RLS isolation, RBAC enforcement, API contracts
- Location: `backend/tests/integration/`

### Frontend Component Tests
- Use Vitest + React Testing Library
- Test component rendering, user interactions, form validation
- Mock API calls with MSW (Mock Service Worker)
- Location: `frontend/tests/components/`

### E2E Tests
- Use Playwright
- Test full user journeys: login → create org → create project → create task → complete
- Location: `frontend/tests/e2e/`

## Code Patterns

### Go Unit Test
```go
func TestTaskService_Create_MaxDepthEnforced(t *testing.T) {
    mockRepo := &mocks.TaskRepository{}
    svc := service.NewTaskService(mockRepo, nil, nil)

    # Parent at depth 3 (MaxTaskDepth)
    mockRepo.On("GetByID", mock.Anything, parentID).Return(&domain.Task{Depth: 3}, nil)

    _, err := svc.Create(context.Background(), service.CreateTaskParams{
        ParentTaskID: &parentID,
        Title:        "Should fail",
    })

    assert.ErrorIs(t, err, domain.ErrMaxDepthExceeded)
}
```

### Go Integration Test
```go
func TestTaskAPI_CrossTenantIsolation(t *testing.T) {
    // Create task in Org A
    taskA := createTask(t, orgAToken, projectA)

    // Try to access from Org B — must return 404
    resp := request(t, "GET", "/api/v1/orgs/"+orgB.ID+"/tasks/"+taskA.ID, orgBToken)
    assert.Equal(t, http.StatusNotFound, resp.StatusCode)
}
```

### Frontend Component Test
```tsx
import { render, screen } from '@testing-library/react'
import { TaskTreeRow } from '@/components/task/task-tree-row'

test('renders task with correct depth indentation', () => {
  render(<TaskTreeRow task={mockTask} depth={3} />)
  const row = screen.getByTestId('task-row')
  expect(row).toHaveStyle({ paddingLeft: '72px' }) // 24px per depth level
})
```

## Mandatory Test Cases

Every new feature MUST include tests for:
1. **Happy path** — feature works as designed
2. **Validation** — invalid input returns proper errors
3. **Authorization** — unauthorized access is blocked
4. **RLS isolation** — cross-tenant access is impossible
5. **Edge cases** — empty lists, max depth, duplicate names

## Rules

- ALWAYS use table-driven tests for Go functions with multiple input scenarios
- ALWAYS use `t.Parallel()` for independent tests
- ALWAYS use test fixtures from `backend/tests/fixtures/`
- ALWAYS clean up test data (use `t.Cleanup()` or transactions)
- NEVER hardcode UUIDs — generate them with `uuid.New()`
- NEVER skip RLS isolation tests
- Run Go tests: `go test ./...`
- Run integration tests: `docker compose -f docker-compose.test.yml run --rm test`
- Run frontend tests: `cd frontend && npm run test`
- Run E2E tests: `cd frontend && npx playwright test`
