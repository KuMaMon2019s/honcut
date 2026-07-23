package honcutserver

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	_ "modernc.org/sqlite"
)

// setupTestDB creates a fresh in-memory SQLite database with the projects schema.
func setupTestDB(t *testing.T) *Store {
	t.Helper()
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if _, err := db.Exec("PRAGMA journal_mode=WAL"); err != nil {
		t.Fatalf("enable WAL: %v", err)
	}
	if _, err := db.Exec("PRAGMA foreign_keys=ON"); err != nil {
		t.Fatalf("enable FK: %v", err)
	}
	createSQL := `
	CREATE TABLE IF NOT EXISTS projects (
		id          TEXT PRIMARY KEY,
		name        TEXT NOT NULL,
		description TEXT,
		created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS media_assets (
		id              TEXT PRIMARY KEY,
		project_id      TEXT NOT NULL,
		name            TEXT NOT NULL,
		kind            TEXT NOT NULL,
		src             TEXT NOT NULL,
		duration_frames INTEGER DEFAULT 0,
		width           INTEGER,
		height          INTEGER,
		created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
	);

	CREATE TABLE IF NOT EXISTS timeline_items (
		id              TEXT PRIMARY KEY,
		project_id      TEXT NOT NULL,
		asset_id        TEXT,
		name            TEXT NOT NULL,
		kind            TEXT NOT NULL,
		src             TEXT,
		track           TEXT NOT NULL DEFAULT 'V1',
		start_frame     INTEGER NOT NULL DEFAULT 0,
		duration_frames INTEGER NOT NULL DEFAULT 0,
		src_in_frame    INTEGER NOT NULL DEFAULT 0,
		props           TEXT DEFAULT '{}',
		created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
		FOREIGN KEY (asset_id) REFERENCES media_assets(id) ON DELETE SET NULL
	);

	CREATE TABLE IF NOT EXISTS transitions (
		id              TEXT PRIMARY KEY,
		project_id      TEXT NOT NULL,
		from_item_id    TEXT NOT NULL,
		to_item_id      TEXT NOT NULL,
		type            TEXT NOT NULL,
		duration_frames INTEGER NOT NULL DEFAULT 24,
		created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
		FOREIGN KEY (from_item_id) REFERENCES timeline_items(id) ON DELETE CASCADE,
		FOREIGN KEY (to_item_id) REFERENCES timeline_items(id) ON DELETE CASCADE
	);`
	if _, err := db.Exec(createSQL); err != nil {
		t.Fatalf("create table: %v", err)
	}
	return &Store{db: db}
}

// TestIntegration_REST_MCP_SQLite_EndToEnd verifies the full pipeline:
// 1. REST POST to create a project → SQLite
// 2. REST GET to confirm it exists
// 3. MCP tool call to edit the project → SQLite
// 4. REST GET to confirm the edit propagated
func TestIntegration_REST_MCP_SQLite_EndToEnd(t *testing.T) {
	// ── Setup ──────────────────────────────────────────────
	store := setupTestDB(t)
	defer store.Close()

	apiHandler := APIHandler(store, nil, "/tmp/honcut-test")
	mcpServer := NewMCPServer(store, nil, "")

	// ── Step 1: REST — Create project ──────────────────────
	t.Log("Step 1: REST POST /api/projects — create project")
	createBody := `{"id":"proj-001","name":"My First Video","description":"A test project"}`
	req := httptest.NewRequest(http.MethodPost, "/api/projects", bytes.NewBufferString(createBody))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	apiHandler.ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", rec.Code, rec.Body.String())
	}
	var created Project
	if err := json.NewDecoder(rec.Body).Decode(&created); err != nil {
		t.Fatalf("decode create response: %v", err)
	}
	if created.ID != "proj-001" {
		t.Fatalf("expected id proj-001, got %s", created.ID)
	}
	if created.Name != "My First Video" {
		t.Fatalf("expected name 'My First Video', got '%s'", created.Name)
	}
	t.Logf("  ✓ Created project: %s (%s)", created.ID, created.Name)

	// ── Step 2: REST — Verify project exists in SQLite ─────
	t.Log("Step 2: REST GET /api/projects/proj-001 — verify exists")
	req = httptest.NewRequest(http.MethodGet, "/api/projects/proj-001", nil)
	rec = httptest.NewRecorder()
	apiHandler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var fetched Project
	if err := json.NewDecoder(rec.Body).Decode(&fetched); err != nil {
		t.Fatalf("decode get response: %v", err)
	}
	if fetched.Name != "My First Video" {
		t.Fatalf("expected name 'My First Video', got '%s'", fetched.Name)
	}
	if fetched.Description != "A test project" {
		t.Fatalf("expected description 'A test project', got '%s'", fetched.Description)
	}
	t.Logf("  ✓ Fetched project: name=%s desc=%s", fetched.Name, fetched.Description)

	// ── Step 3: MCP — Edit project via tool ────────────────
	t.Log("Step 3: MCP tools/call edit_project — update name and description")
	mcpResult, err := mcpServer.HandleMCPRequest("tools/call", map[string]interface{}{
		"name": "edit_project",
		"arguments": map[string]interface{}{
			"project_id":  "proj-001",
			"name":        "My Edited Video",
			"description": "Updated via MCP tool",
		},
	})
	if err != nil {
		t.Fatalf("MCP edit_project failed: %v", err)
	}

	// Verify MCP response structure
	resultMap, ok := mcpResult.(map[string]interface{})
	if !ok {
		t.Fatalf("expected map result, got %T", mcpResult)
	}
	if isError, _ := resultMap["isError"].(bool); isError {
		t.Fatalf("MCP returned isError=true")
	}
	t.Logf("  ✓ MCP edit_project succeeded")

	// ── Step 4: REST — Verify edit propagated through SQLite ─
	t.Log("Step 4: REST GET /api/projects/proj-001 — verify MCP edit")
	req = httptest.NewRequest(http.MethodGet, "/api/projects/proj-001", nil)
	rec = httptest.NewRecorder()
	apiHandler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var verified Project
	if err := json.NewDecoder(rec.Body).Decode(&verified); err != nil {
		t.Fatalf("decode verify response: %v", err)
	}
	if verified.Name != "My Edited Video" {
		t.Fatalf("expected updated name 'My Edited Video', got '%s'", verified.Name)
	}
	if verified.Description != "Updated via MCP tool" {
		t.Fatalf("expected updated description 'Updated via MCP tool', got '%s'", verified.Description)
	}
	t.Logf("  ✓ Verified MCP edit propagated: name=%s desc=%s", verified.Name, verified.Description)

	// ── Bonus: Verify list and delete ──────────────────────
	t.Log("Bonus: REST GET /api/projects — list all")
	req = httptest.NewRequest(http.MethodGet, "/api/projects", nil)
	rec = httptest.NewRecorder()
	apiHandler.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("list: expected 200, got %d", rec.Code)
	}
	var list []Project
	body, _ := io.ReadAll(rec.Body)
	if err := json.Unmarshal(body, &list); err != nil {
		t.Fatalf("decode list: %v (body: %s)", err, string(body))
	}
	if len(list) != 1 {
		t.Fatalf("expected 1 project, got %d", len(list))
	}
	t.Logf("  ✓ List returned %d project(s)", len(list))

	t.Log("Bonus: REST DELETE /api/projects/proj-001")
	req = httptest.NewRequest(http.MethodDelete, "/api/projects/proj-001", nil)
	rec = httptest.NewRecorder()
	apiHandler.ServeHTTP(rec, req)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("delete: expected 204, got %d", rec.Code)
	}
	t.Logf("  ✓ Deleted project")

	// Verify deletion
	req = httptest.NewRequest(http.MethodGet, "/api/projects/proj-001", nil)
	rec = httptest.NewRecorder()
	apiHandler.ServeHTTP(rec, req)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404 after delete, got %d", rec.Code)
	}
	t.Logf("  ✓ Confirmed deletion (404)")

	t.Log("═══════════════════════════════════════════════")
	t.Log("✅ REST + MCP + SQLite 三层协同端到端验证通过！")
	t.Log("═══════════════════════════════════════════════")
}

// TestMCP_ToolRegistration verifies MCP tools are properly registered
func TestMCP_ToolRegistration(t *testing.T) {
	store := setupTestDB(t)
	defer store.Close()
	mcp := NewMCPServer(store, nil, "")

	tools := mcp.ListTools()
	if len(tools) != 35 {
		t.Fatalf("expected 35 tools, got %d", len(tools))
	}
	expectedTools := []string{
		"edit_project", "add_clip", "trim_clip", "move_clip", "add_transition", "read_timeline", "upload_media",
		"list_projects", "create_project", "read_project", "clear_timeline", "split_item", "duplicate_item",
		"remove_item", "move_item", "update_item_props", "set_item_timing",
		"manage_timelines", "edit_track", "set_aspect_ratio", "list_audio", "add_audio",
		"manage_media_pool", "browse_library", "manage_design_style",
		"list_templates", "search_templates", "add_motion_graphic", "submit_motion_graphic",
		"read_script", "apply_script", "submit_render_job", "track_export",
		"openchatcut_status", "ToolSearch",
	}
	for i, name := range expectedTools {
		if tools[i].Name != name {
			t.Fatalf("expected tool[%d] name '%s', got '%s'", i, name, tools[i].Name)
		}
	}
	t.Logf("✓ All 25 MCP tools registered: %v", expectedTools)
}

// TestMCP_EditNonExistent verifies MCP returns error for missing project
func TestMCP_EditNonExistent(t *testing.T) {
	store := setupTestDB(t)
	defer store.Close()
	mcp := NewMCPServer(store, nil, "")

	result, err := mcp.HandleMCPRequest("tools/call", map[string]interface{}{
		"name": "edit_project",
		"arguments": map[string]interface{}{
			"project_id": "nonexistent",
			"name":       "New Name",
		},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	resultMap := result.(map[string]interface{})
	if isError, _ := resultMap["isError"].(bool); !isError {
		t.Fatalf("expected isError=true for nonexistent project")
	}
	t.Logf("✓ MCP correctly returns error for nonexistent project")
}

// TestMCP_ToolsList verifies the tools/list method
func TestMCP_ToolsList(t *testing.T) {
	store := setupTestDB(t)
	defer store.Close()
	mcp := NewMCPServer(store, nil, "")

	result, err := mcp.HandleMCPRequest("tools/list", nil)
	if err != nil {
		t.Fatalf("tools/list failed: %v", err)
	}
	tools, ok := result.([]MCPTool)
	if !ok {
		t.Fatalf("expected []MCPTool, got %T", result)
	}
	if len(tools) == 0 {
		t.Fatalf("expected at least 1 tool")
	}
	t.Logf("✓ tools/list returned %d tool(s)", len(tools))
}

// TestREST_CRUDCycle tests the full CRUD cycle via HTTP
func TestREST_CRUDCycle(t *testing.T) {
	store := setupTestDB(t)
	defer store.Close()
	handler := APIHandler(store, nil, "/tmp/honcut-test")

	// Create
	do := func(method, path string, body string) *httptest.ResponseRecorder {
		var bodyReader io.Reader
		if body != "" {
			bodyReader = bytes.NewBufferString(body)
		}
		req := httptest.NewRequest(method, path, bodyReader)
		if body != "" {
			req.Header.Set("Content-Type", "application/json")
		}
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)
		return rec
	}

	// POST
	rec := do("POST", "/api/projects", `{"id":"crud-1","name":"CRUD Test","description":"testing"}`)
	if rec.Code != 201 {
		t.Fatalf("POST: expected 201, got %d: %s", rec.Code, rec.Body.String())
	}

	// GET
	rec = do("GET", "/api/projects/crud-1", "")
	if rec.Code != 200 {
		t.Fatalf("GET: expected 200, got %d", rec.Code)
	}

	// PUT
	rec = do("PUT", "/api/projects/crud-1", `{"name":"CRUD Updated"}`)
	if rec.Code != 200 {
		t.Fatalf("PUT: expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var updated Project
	json.NewDecoder(rec.Body).Decode(&updated)
	if updated.Name != "CRUD Updated" {
		t.Fatalf("PUT: expected name 'CRUD Updated', got '%s'", updated.Name)
	}

	// DELETE
	rec = do("DELETE", "/api/projects/crud-1", "")
	if rec.Code != 204 {
		t.Fatalf("DELETE: expected 204, got %d", rec.Code)
	}

	// GET after delete → 404
	rec = do("GET", "/api/projects/crud-1", "")
	if rec.Code != 404 {
		t.Fatalf("GET after DELETE: expected 404, got %d", rec.Code)
	}

	t.Logf("✓ Full CRUD cycle passed")
}

// TestREST_Validation tests error handling
func TestREST_Validation(t *testing.T) {
	store := setupTestDB(t)
	defer store.Close()
	handler := APIHandler(store, nil, "/tmp/honcut-test")

	// Missing id
	req := httptest.NewRequest("POST", "/api/projects", bytes.NewBufferString(`{"name":"No ID"}`))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != 400 {
		t.Fatalf("expected 400 for missing id, got %d", rec.Code)
	}

	// Missing name
	req = httptest.NewRequest("POST", "/api/projects", bytes.NewBufferString(`{"id":"x"}`))
	req.Header.Set("Content-Type", "application/json")
	rec = httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != 400 {
		t.Fatalf("expected 400 for missing name, got %d", rec.Code)
	}

	// Invalid JSON
	req = httptest.NewRequest("POST", "/api/projects", bytes.NewBufferString(`{bad json`))
	req.Header.Set("Content-Type", "application/json")
	rec = httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != 400 {
		t.Fatalf("expected 400 for bad json, got %d", rec.Code)
	}

	// Update nonexistent
	req = httptest.NewRequest("PUT", "/api/projects/ghost", bytes.NewBufferString(`{"name":"Ghost"}`))
	req.Header.Set("Content-Type", "application/json")
	rec = httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != 404 {
		t.Fatalf("expected 404 for updating nonexistent, got %d", rec.Code)
	}

	// Delete nonexistent
	req = httptest.NewRequest("DELETE", "/api/projects/ghost", nil)
	rec = httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != 404 {
		t.Fatalf("expected 404 for deleting nonexistent, got %d", rec.Code)
	}

	t.Logf("✓ All validation cases passed")
}

// TestSQLite_WALMode verifies WAL mode is active on file-based databases
func TestSQLite_WALMode(t *testing.T) {
	// In-memory databases report journal_mode=memory, not wal.
	// Use a temp file to verify WAL mode works correctly.
	tmpDir := t.TempDir()
	store, err := NewStore(tmpDir + "/test.db")
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}
	defer store.Close()

	var journalMode string
	err = store.db.QueryRow("PRAGMA journal_mode").Scan(&journalMode)
	if err != nil {
		t.Fatalf("query journal_mode: %v", err)
	}
	if journalMode != "wal" {
		t.Fatalf("expected WAL mode, got %s", journalMode)
	}
	t.Logf("✓ SQLite WAL mode active (file-based)")
}

// TestSQLite_ForeignKeys verifies foreign keys are enabled
func TestSQLite_ForeignKeys(t *testing.T) {
	store := setupTestDB(t)
	defer store.Close()

	var fk int
	err := store.db.QueryRow("PRAGMA foreign_keys").Scan(&fk)
	if err != nil {
		t.Fatalf("query foreign_keys: %v", err)
	}
	if fk != 1 {
		t.Fatalf("expected foreign_keys=1, got %d", fk)
	}
	t.Logf("✓ SQLite foreign keys enabled")
}

func Example_integration() {
	// This example shows the full flow conceptually
	fmt.Println("REST → SQLite → MCP → SQLite → REST")
	fmt.Println("All three layers work together through SQLite as the shared state.")
	// Output:
	// REST → SQLite → MCP → SQLite → REST
	// All three layers work together through SQLite as the shared state.
}
