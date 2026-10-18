package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/orbispm/orbispm/internal/pkg/tenant"
	"github.com/orbispm/orbispm/internal/repository"
	"github.com/orbispm/orbispm/internal/service"
	"github.com/orbispm/orbispm/internal/storage"
)

// TestDriveHTTPIntegration exercises the Drive API end to end against a real
// Postgres (all migrations applied) and MinIO. Skipped unless both are given:
//
//	DRIVE_IT_DB=postgres://postgres:x@localhost:55432/postgres?sslmode=disable \
//	DRIVE_IT_MINIO=localhost:59000 go test ./internal/handler -run DriveHTTP
func TestDriveHTTPIntegration(t *testing.T) {
	dsn, minioHost := os.Getenv("DRIVE_IT_DB"), os.Getenv("DRIVE_IT_MINIO")
	if dsn == "" || minioHost == "" {
		t.Skip("DRIVE_IT_DB / DRIVE_IT_MINIO not set")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dsn)
	require.NoError(t, err)
	t.Cleanup(pool.Close)

	orgA, orgB := uuid.New(), uuid.New()
	owner, member, outsider, foreign := uuid.New(), uuid.New(), uuid.New(), uuid.New()
	team := uuid.New()
	exec := func(q string, args ...any) {
		_, err := pool.Exec(ctx, q, args...)
		require.NoError(t, err)
	}
	exec(`INSERT INTO orgs (id, name, slug) VALUES ($1, 'Acme', $3), ($2, 'Other', $4)`,
		orgA, orgB, "acme-"+orgA.String(), "other-"+orgB.String())
	for _, u := range []uuid.UUID{owner, member, outsider, foreign} {
		exec(`INSERT INTO users (id, email, display_name) VALUES ($1, $2, $3)`, u, u.String()+"@x.io", "U "+u.String()[:4])
	}
	exec(`INSERT INTO org_members (org_id, user_id, role) VALUES ($1, $2, 'owner'), ($1, $3, 'member'), ($1, $4, 'member'), ($5, $6, 'owner')`,
		orgA, owner, member, outsider, orgB, foreign)
	exec(`INSERT INTO teams (id, org_id, name) VALUES ($1, $2, 'Design')`, team, orgA)
	exec(`INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, 'member')`, team, member)

	store, err := storage.NewClient(minioHost, "minioadmin", "minioadmin", "orbispm-drive-it", "http://"+minioHost, false, false)
	require.NoError(t, err)
	orgMembers, projectMembers := repository.NewOrgMemberRepo(pool), repository.NewProjectMemberRepo(pool)
	resolver := service.NewPermissionResolver(orgMembers, repository.NewTeamMemberRepo(pool), projectMembers,
		repository.NewProjectTeamRepo(pool), repository.NewRoleRepo(pool), repository.NewOrgRepo(pool))
	driveRepo := repository.NewDriveRepo(pool)
	svc := service.NewDriveService(driveRepo, service.NewDriveAccess(resolver, driveRepo), orgMembers, projectMembers,
		store, repository.NewTxManager(pool), nil, nil, 1<<20)

	r := chi.NewRouter()
	r.Route("/orgs/{orgId}", func(r chi.Router) {
		// Stands in for Auth + RLSTenant: the user comes from a test header.
		r.Use(func(next http.Handler) http.Handler {
			return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
				c := tenant.SetOrgID(req.Context(), uuid.MustParse(chi.URLParam(req, "orgId")))
				c = tenant.SetUserID(c, uuid.MustParse(req.Header.Get("X-Test-User")))
				next.ServeHTTP(w, req.WithContext(c))
			})
		})
		r.Mount("/drive", NewDriveHandler(svc).Routes())
	})
	srv := httptest.NewServer(r)
	t.Cleanup(srv.Close)

	send := func(user uuid.UUID, method, path, contentType string, body io.Reader, want int) map[string]any {
		t.Helper()
		req, err := http.NewRequest(method, srv.URL+"/orgs/"+orgA.String()+"/drive"+path, body)
		require.NoError(t, err)
		req.Header.Set("X-Test-User", user.String())
		req.Header.Set("Content-Type", contentType)
		res, err := http.DefaultClient.Do(req)
		require.NoError(t, err)
		defer res.Body.Close()
		raw, _ := io.ReadAll(res.Body)
		require.Equalf(t, want, res.StatusCode, "%s %s: %s", method, path, raw)
		out := map[string]any{}
		_ = json.Unmarshal(raw, &out)
		return out
	}
	call := func(user uuid.UUID, method, path string, body any, want int) map[string]any {
		t.Helper()
		var rd io.Reader
		if body != nil {
			j, _ := json.Marshal(body)
			rd = bytes.NewReader(j)
		}
		return send(user, method, path, "application/json", rd, want)
	}
	upload := func(user uuid.UUID, scopeID, parentID, name string, content []byte, want int) map[string]any {
		t.Helper()
		buf := &bytes.Buffer{}
		mw := multipart.NewWriter(buf)
		_ = mw.WriteField("scope", "team")
		_ = mw.WriteField("scope_id", scopeID)
		if parentID != "" {
			_ = mw.WriteField("parent_id", parentID)
		}
		fw, _ := mw.CreateFormFile("file", name)
		_, _ = fw.Write(content)
		_ = mw.Close()
		return send(user, "POST", "/files", mw.FormDataContentType(), buf, want)
	}
	names := func(v any) []string {
		var out []string
		for _, it := range v.([]any) {
			out = append(out, it.(map[string]any)["name"].(string))
		}
		return out
	}
	share := func(user uuid.UUID, itemID string, grantee uuid.UUID, role string, want int) map[string]any {
		t.Helper()
		return call(user, "POST", "/items/"+itemID+"/shares", map[string]any{
			"grantees": []map[string]string{{"type": "user", "id": grantee.String()}}, "role": role,
		}, want)
	}
	ts := team.String()

	// Spaces follow RBAC: only team members (and owners) see the team space.
	assert.Equal(t, []string{"My files", "Organization", "Design"}, names(call(member, "GET", "/spaces", nil, 200)["spaces"]))
	assert.Equal(t, []string{"My files", "Organization"}, names(call(outsider, "GET", "/spaces", nil, 200)["spaces"]))

	// Team member is an editor: folders, auto-rename, sniffed uploads, size limit.
	folder := call(member, "POST", "/folders", map[string]any{"scope": "team", "scope_id": ts, "name": "Specs"}, 201)
	fid := folder["id"].(string)
	assert.Equal(t, "specs (1)", call(member, "POST", "/folders", map[string]any{"scope": "team", "scope_id": ts, "name": "specs"}, 201)["name"])
	file := upload(member, ts, fid, "notes.txt", []byte("hello drive"), 201)
	fileID := file["id"].(string)
	assert.Equal(t, "text/plain; charset=utf-8", file["mime_type"])
	assert.EqualValues(t, 11, file["size_bytes"])
	assert.Equal(t, "notes (1).txt", upload(member, ts, fid, "notes.txt", []byte("again"), 201)["name"])
	upload(member, ts, "", "big.bin", bytes.Repeat([]byte("x"), 2<<20), 413)

	list := call(member, "GET", "/items?scope=team&scope_id="+ts+"&parent_id="+fid, nil, 200)
	assert.Equal(t, "editor", list["my_role"])
	assert.Equal(t, []string{"notes (1).txt", "notes.txt"}, names(list["items"]))
	assert.Equal(t, []string{"Specs"}, names(list["breadcrumbs"]))

	// No access is 404 (never leak existence), across spaces and orgs.
	call(outsider, "GET", "/items?scope=team&scope_id="+ts, nil, 404)
	call(outsider, "GET", "/items/"+fileID, nil, 404)
	call(foreign, "GET", "/items/"+fileID, nil, 404)
	share(outsider, fid, member, "viewer", 404)

	// Shares: capped at the actor's role, grantee must be in the org.
	share(member, fid, outsider, "manager", 403)
	share(member, fid, foreign, "viewer", 422)
	share(member, fid, outsider, "viewer", 201)

	// A folder share reaches its descendants, read-only.
	shared := call(outsider, "GET", "/shared-with-me", nil, 200)
	assert.Equal(t, []string{"Specs"}, names(shared["items"]))
	assert.Equal(t, "Design", shared["items"].([]any)[0].(map[string]any)["space_name"])
	assert.Equal(t, "viewer", call(outsider, "GET", "/items?scope=team&scope_id="+ts+"&parent_id="+fid, nil, 200)["my_role"])
	inherited := call(outsider, "GET", "/items/"+fileID+"/shares", nil, 200)["shares"].([]any)
	assert.Equal(t, true, inherited[0].(map[string]any)["inherited"])
	call(outsider, "PATCH", "/items/"+fileID, map[string]any{"name": "x.txt"}, 403)
	call(outsider, "DELETE", "/items/"+fileID, nil, 403)

	// Presigned URL serves the bytes; the bucket itself is private.
	u := call(outsider, "GET", "/items/"+fileID+"/url?disposition=inline", nil, 200)
	res, err := http.Get(u["url"].(string))
	require.NoError(t, err)
	body, _ := io.ReadAll(res.Body)
	res.Body.Close()
	assert.Equal(t, "hello drive", string(body))
	anon, err := http.Get("http://" + minioHost + "/orbispm-drive-it/orgs/" + orgA.String() + "/drive/" + fileID)
	require.NoError(t, err)
	anon.Body.Close()
	assert.Equal(t, http.StatusForbidden, anon.StatusCode)
	call(member, "GET", "/items/"+fid+"/url", nil, 422)

	// Rename, move, no move into itself, trash and restore.
	call(member, "PATCH", "/items/"+fileID, map[string]any{"name": "Final.txt"}, 200)
	call(member, "POST", "/items/"+fileID+"/move", map[string]any{"parent_id": nil}, 200)
	call(member, "POST", "/items/"+fid+"/move", map[string]any{"parent_id": fid}, 422)
	call(member, "DELETE", "/items/"+fid, nil, 204)
	assert.Equal(t, []string{"Specs"}, names(call(member, "GET", "/trash", nil, 200)["items"]))
	call(member, "POST", "/items/"+fid+"/restore", nil, 200)

	// Revoking a share removes access immediately.
	shareID := call(member, "GET", "/items/"+fid+"/shares", nil, 200)["shares"].([]any)[0].(map[string]any)["id"].(string)
	call(member, "PATCH", "/shares/"+shareID, map[string]any{"role": "editor"}, 200)
	call(member, "DELETE", "/shares/"+shareID, nil, 204)
	assert.Empty(t, call(outsider, "GET", "/shared-with-me", nil, 200)["items"])

	// Personal spaces are private even from the org owner; org space is admin-write.
	mine := call(outsider, "POST", "/folders", map[string]any{"scope": "user", "scope_id": outsider.String(), "name": "Private"}, 201)
	call(owner, "GET", "/items/"+mine["id"].(string), nil, 404)
	call(owner, "POST", "/folders", map[string]any{"scope": "org", "scope_id": orgA.String(), "name": "Policies"}, 201)
	call(outsider, "POST", "/folders", map[string]any{"scope": "org", "scope_id": orgA.String(), "name": "Nope"}, 403)

	usage := call(member, "GET", "/usage", nil, 200)
	assert.EqualValues(t, 16, usage["bytes_used"])
	assert.EqualValues(t, 1<<30, usage["bytes_limit"])
}
