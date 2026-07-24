package honcutserver

import (
	"database/sql"
	"fmt"
	"honcut-server/internal/render"
	"os"
	"path/filepath"
	"time"

	_ "modernc.org/sqlite"
)

// Project represents a project in the database
type Project struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	CreatedAt   string `json:"created_at"`
	UpdatedAt   string `json:"updated_at"`
}

// MediaAsset represents a media file in the database
type MediaAsset struct {
	ID             string  `json:"id"`
	ProjectID      string  `json:"project_id"`
	Name           string  `json:"name"`
	Kind           string  `json:"kind"`
	Src            string  `json:"src"`
	DurationFrames int     `json:"duration_frames"`
	Width          *int    `json:"width,omitempty"`
	Height         *int    `json:"height,omitempty"`
	CreatedAt      string  `json:"created_at"`
}

// TimelineItem represents a clip on the timeline
type TimelineItem struct {
	ID             string `json:"id"`
	ProjectID      string `json:"project_id"`
	AssetID        string `json:"asset_id,omitempty"`
	Name           string `json:"name"`
	Kind           string `json:"kind"`
	Src            string `json:"src,omitempty"`
	Track          string `json:"track"`
	StartFrame     int    `json:"start_frame"`
	DurationFrames int    `json:"duration_frames"`
	SrcInFrame     int    `json:"src_in_frame"`
	Props          string `json:"props"`
	CreatedAt      string `json:"created_at"`
}

func (t *TimelineItem) GetID() string             { return t.ID }
func (t *TimelineItem) GetSrc() string            { return t.Src }
func (t *TimelineItem) GetKind() string           { return t.Kind }
func (t *TimelineItem) GetStartFrame() int        { return t.StartFrame }
func (t *TimelineItem) GetDurationFrames() int    { return t.DurationFrames }
func (t *TimelineItem) GetSrcInFrame() int        { return t.SrcInFrame }
func (t *TimelineItem) GetTrack() string          { return t.Track }

// Transition represents a transition between two timeline items
type Transition struct {
	ID             string `json:"id"`
	ProjectID      string `json:"project_id"`
	FromItemID     string `json:"from_item_id"`
	ToItemID       string `json:"to_item_id"`
	Type           string `json:"type"`
	DurationFrames int    `json:"duration_frames"`
	CreatedAt      string `json:"created_at"`
}

func (t *Transition) GetFromItemID() string     { return t.FromItemID }
func (t *Transition) GetToItemID() string       { return t.ToItemID }
func (t *Transition) GetType() string           { return t.Type }
func (t *Transition) GetDurationFrames() int    { return t.DurationFrames }

// Timeline represents a timeline (sequence) in a project
type Timeline struct {
	ID        string `json:"id"`
	ProjectID string `json:"project_id"`
	Name      string `json:"name"`
	FPS       int    `json:"fps"`
	Width     int    `json:"width"`
	Height    int    `json:"height"`
	Ratio     string `json:"ratio"`
	Hidden    bool   `json:"hidden"`
	CreatedAt string `json:"created_at"`
}

// Track represents a track (video/audio row) in a timeline
type Track struct {
	ID         string `json:"id"`
	ProjectID  string `json:"project_id"`
	Name       string `json:"name"`
	Kind       string `json:"kind"` // video or audio
	OrderIndex int    `json:"order_index"`
	Hidden     bool   `json:"hidden"`
	CreatedAt  string `json:"created_at"`
}

// DesignStyle represents a brand/design style for a project
type DesignStyle struct {
	ID        string `json:"id"`
	ProjectID string `json:"project_id"`
	Name      string `json:"name"`
	Colors    string `json:"colors"` // JSON
	Fonts     string `json:"fonts"`  // JSON
	CreatedAt string `json:"created_at"`
}

// Marker represents a timeline marker at a specific frame
type Marker struct {
	ID        string `json:"id"`
	ProjectID string `json:"project_id"`
	Frame     int    `json:"frame"`
	Label     string `json:"label"`
	Color     string `json:"color"`
	CreatedAt string `json:"created_at"`
}

// Store handles SQLite persistence for projects
type Store struct {
	db *sql.DB
}

// NewStore creates a Store backed by a SQLite database at dbPath.
func NewStore(dbPath string) (*Store, error) {
	dir := filepath.Dir(dbPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, fmt.Errorf("create db directory: %w", err)
	}

	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, fmt.Errorf("open database: %w", err)
	}

	if _, err := db.Exec("PRAGMA journal_mode=WAL"); err != nil {
		db.Close()
		return nil, fmt.Errorf("enable WAL: %w", err)
	}
	if _, err := db.Exec("PRAGMA foreign_keys=ON"); err != nil {
		db.Close()
		return nil, fmt.Errorf("enable foreign keys: %w", err)
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
	);

	CREATE TABLE IF NOT EXISTS timelines (
		id          TEXT PRIMARY KEY,
		project_id  TEXT NOT NULL,
		name        TEXT NOT NULL,
		fps         INTEGER NOT NULL DEFAULT 24,
		width       INTEGER NOT NULL DEFAULT 1920,
		height      INTEGER NOT NULL DEFAULT 1080,
		ratio       TEXT NOT NULL DEFAULT '16:9',
		hidden      INTEGER NOT NULL DEFAULT 0,
		created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
	);

	CREATE TABLE IF NOT EXISTS tracks (
		id          TEXT PRIMARY KEY,
		project_id  TEXT NOT NULL,
		name        TEXT NOT NULL,
		kind        TEXT NOT NULL DEFAULT 'video',
		order_index INTEGER NOT NULL DEFAULT 0,
		hidden      INTEGER NOT NULL DEFAULT 0,
		created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
	);

	CREATE TABLE IF NOT EXISTS design_styles (
		id          TEXT PRIMARY KEY,
		project_id  TEXT NOT NULL,
		name        TEXT NOT NULL,
		colors      TEXT DEFAULT '{}',
		fonts       TEXT DEFAULT '{}',
		created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
	);

	CREATE TABLE IF NOT EXISTS markers (
		id          TEXT PRIMARY KEY,
		project_id  TEXT NOT NULL,
		frame       INTEGER NOT NULL,
		label       TEXT DEFAULT '',
		color       TEXT DEFAULT '#facc15',
		created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
	);`
	if _, err := db.Exec(createSQL); err != nil {
		db.Close()
		return nil, fmt.Errorf("create tables: %w", err)
	}

	// Migrate timeline_items if old schema exists
	if err := migrateTimelineItems(db); err != nil {
		db.Close()
		return nil, fmt.Errorf("migrate timeline_items: %w", err)
	}

	return &Store{db: db}, nil
}

// migrateTimelineItems handles schema migration for timeline_items table
func migrateTimelineItems(db *sql.DB) error {
	// Check if old schema exists (has 'track' as INTEGER instead of TEXT)
	var trackType string
	err := db.QueryRow("SELECT typeof(track) FROM timeline_items LIMIT 1").Scan(&trackType)
	if err != nil && err != sql.ErrNoRows {
		// Table might not exist or other error
		return nil
	}

	// If track is INTEGER, we have old schema - migrate it
	if trackType == "integer" {
		// Drop old table and recreate with new schema
		if _, err := db.Exec("DROP TABLE IF EXISTS timeline_items"); err != nil {
			return fmt.Errorf("drop old timeline_items: %w", err)
		}

		createSQL := `
		CREATE TABLE timeline_items (
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
		);`
		if _, err := db.Exec(createSQL); err != nil {
			return fmt.Errorf("recreate timeline_items: %w", err)
		}
	}

	return nil
}

// NewStoreWithDB wraps an existing *sql.DB (useful for tests with httptest).
func NewStoreWithDB(db *sql.DB) *Store {
	return &Store{db: db}
}

// Close releases the underlying database connection.
func (s *Store) Close() error {
	return s.db.Close()
}

// DB returns the underlying *sql.DB (for handler wiring).
func (s *Store) DB() *sql.DB {
	return s.db
}

// Create inserts a new project.
func (s *Store) Create(id, name, description string) (*Project, error) {
	now := time.Now().UTC().Format(time.RFC3339)
	_, err := s.db.Exec(
		"INSERT INTO projects (id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
		id, name, description, now, now,
	)
	if err != nil {
		return nil, fmt.Errorf("insert project: %w", err)
	}
	return &Project{
		ID: id, Name: name, Description: description,
		CreatedAt: now, UpdatedAt: now,
	}, nil
}

// Get retrieves a project by ID. Returns nil, nil when not found.
func (s *Store) Get(id string) (*Project, error) {
	row := s.db.QueryRow("SELECT id, name, description, created_at, updated_at FROM projects WHERE id = ?", id)
	var p Project
	if err := row.Scan(&p.ID, &p.Name, &p.Description, &p.CreatedAt, &p.UpdatedAt); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("query project: %w", err)
	}
	return &p, nil
}

// List returns every project.
func (s *Store) List() ([]*Project, error) {
	rows, err := s.db.Query("SELECT id, name, description, created_at, updated_at FROM projects ORDER BY created_at")
	if err != nil {
		return nil, fmt.Errorf("list projects: %w", err)
	}
	defer rows.Close()

	var projects []*Project
	for rows.Next() {
		var p Project
		if err := rows.Scan(&p.ID, &p.Name, &p.Description, &p.CreatedAt, &p.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan project: %w", err)
		}
		projects = append(projects, &p)
	}
	return projects, rows.Err()
}

// Update patches name and/or description. Returns nil, nil if not found.
func (s *Store) Update(id string, name, description *string) (*Project, error) {
	existing, err := s.Get(id)
	if err != nil {
		return nil, err
	}
	if existing == nil {
		return nil, nil
	}

	if name != nil {
		existing.Name = *name
	}
	if description != nil {
		existing.Description = *description
	}
	existing.UpdatedAt = time.Now().UTC().Format(time.RFC3339)

	_, err = s.db.Exec(
		"UPDATE projects SET name = ?, description = ?, updated_at = ? WHERE id = ?",
		existing.Name, existing.Description, existing.UpdatedAt, id,
	)
	if err != nil {
		return nil, fmt.Errorf("update project: %w", err)
	}
	return existing, nil
}

// Delete removes a project. Returns true if a row was deleted.
func (s *Store) Delete(id string) (bool, error) {
	res, err := s.db.Exec("DELETE FROM projects WHERE id = ?", id)
	if err != nil {
		return false, fmt.Errorf("delete project: %w", err)
	}
	n, _ := res.RowsAffected()
	return n > 0, nil
}

// ─── Media Asset CRUD ────────────────────────────────────────────────

// CreateAsset inserts a new media asset.
func (s *Store) CreateAsset(asset *MediaAsset) error {
	now := time.Now().UTC().Format(time.RFC3339)
	asset.CreatedAt = now
	_, err := s.db.Exec(
		"INSERT INTO media_assets (id, project_id, name, kind, src, duration_frames, width, height, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
		asset.ID, asset.ProjectID, asset.Name, asset.Kind, asset.Src, asset.DurationFrames, asset.Width, asset.Height, now,
	)
	if err != nil {
		return fmt.Errorf("insert asset: %w", err)
	}
	return nil
}

// GetAsset retrieves a media asset by ID. Returns nil, nil when not found.
func (s *Store) GetAsset(id string) (*MediaAsset, error) {
	row := s.db.QueryRow("SELECT id, project_id, name, kind, src, duration_frames, width, height, created_at FROM media_assets WHERE id = ?", id)
	var a MediaAsset
	if err := row.Scan(&a.ID, &a.ProjectID, &a.Name, &a.Kind, &a.Src, &a.DurationFrames, &a.Width, &a.Height, &a.CreatedAt); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("query asset: %w", err)
	}
	return &a, nil
}

// ListAssets returns all assets for a project.
func (s *Store) ListAssets(projectID string) ([]*MediaAsset, error) {
	rows, err := s.db.Query("SELECT id, project_id, name, kind, src, duration_frames, width, height, created_at FROM media_assets WHERE project_id = ? ORDER BY created_at", projectID)
	if err != nil {
		return nil, fmt.Errorf("list assets: %w", err)
	}
	defer rows.Close()

	var assets []*MediaAsset
	for rows.Next() {
		var a MediaAsset
		if err := rows.Scan(&a.ID, &a.ProjectID, &a.Name, &a.Kind, &a.Src, &a.DurationFrames, &a.Width, &a.Height, &a.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan asset: %w", err)
		}
		assets = append(assets, &a)
	}
	return assets, rows.Err()
}

// ─── Timeline Item CRUD ────────────────────────────────────────────────

// CreateTimelineItem inserts a new timeline item.
func (s *Store) CreateTimelineItem(item *TimelineItem) error {
	now := time.Now().UTC().Format(time.RFC3339)
	item.CreatedAt = now

	// Empty asset_id must be nil, not empty string, to satisfy FK constraint
	var assetID interface{}
	if item.AssetID != "" {
		assetID = item.AssetID
	}

	_, err := s.db.Exec(
		"INSERT INTO timeline_items (id, project_id, asset_id, name, kind, src, track, start_frame, duration_frames, src_in_frame, props, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
		item.ID, item.ProjectID, assetID, item.Name, item.Kind, item.Src, item.Track, item.StartFrame, item.DurationFrames, item.SrcInFrame, item.Props, now,
	)
	if err != nil {
		return fmt.Errorf("insert timeline item: %w", err)
	}
	return nil
}

// GetTimelineItem retrieves a timeline item by ID. Returns nil, nil when not found.
func (s *Store) GetTimelineItem(id string) (*TimelineItem, error) {
	row := s.db.QueryRow("SELECT id, project_id, asset_id, name, kind, src, track, start_frame, duration_frames, src_in_frame, props, created_at FROM timeline_items WHERE id = ?", id)
	var item TimelineItem
	var assetID, srcNull sql.NullString
	if err := row.Scan(&item.ID, &item.ProjectID, &assetID, &item.Name, &item.Kind, &srcNull, &item.Track, &item.StartFrame, &item.DurationFrames, &item.SrcInFrame, &item.Props, &item.CreatedAt); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("query timeline item: %w", err)
	}
	item.AssetID = assetID.String
	item.Src = srcNull.String
	return &item, nil
}

// ListTimelineItems returns all timeline items for a project.
func (s *Store) ListTimelineItems(projectID string) ([]*TimelineItem, error) {
	rows, err := s.db.Query("SELECT id, project_id, asset_id, name, kind, src, track, start_frame, duration_frames, src_in_frame, props, created_at FROM timeline_items WHERE project_id = ? ORDER BY start_frame", projectID)
	if err != nil {
		return nil, fmt.Errorf("list timeline items: %w", err)
	}
	defer rows.Close()

	var items []*TimelineItem
	for rows.Next() {
		var item TimelineItem
		var assetID, srcNull sql.NullString
		if err := rows.Scan(&item.ID, &item.ProjectID, &assetID, &item.Name, &item.Kind, &srcNull, &item.Track, &item.StartFrame, &item.DurationFrames, &item.SrcInFrame, &item.Props, &item.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan timeline item: %w", err)
		}
		item.AssetID = assetID.String
		item.Src = srcNull.String
		items = append(items, &item)
	}
	return items, rows.Err()
}

// UpdateTimelineItem updates a timeline item's track, start_frame, duration_frames, or src_in_frame.
func (s *Store) UpdateTimelineItem(id string, track *string, startFrame *int, durationFrames *int, srcInFrame *int) error {
	item, err := s.GetTimelineItem(id)
	if err != nil {
		return err
	}
	if item == nil {
		return fmt.Errorf("timeline item not found: %s", id)
	}

	if track != nil {
		item.Track = *track
	}
	if startFrame != nil {
		item.StartFrame = *startFrame
	}
	if durationFrames != nil {
		item.DurationFrames = *durationFrames
	}
	if srcInFrame != nil {
		item.SrcInFrame = *srcInFrame
	}

	_, err = s.db.Exec(
		"UPDATE timeline_items SET track = ?, start_frame = ?, duration_frames = ?, src_in_frame = ? WHERE id = ?",
		item.Track, item.StartFrame, item.DurationFrames, item.SrcInFrame, id,
	)
	if err != nil {
		return fmt.Errorf("update timeline item: %w", err)
	}
	return nil
}

// DeleteTimelineItem removes a timeline item.
func (s *Store) DeleteTimelineItem(id string) (bool, error) {
	res, err := s.db.Exec("DELETE FROM timeline_items WHERE id = ?", id)
	if err != nil {
		return false, fmt.Errorf("delete timeline item: %w", err)
	}
	n, _ := res.RowsAffected()
	return n > 0, nil
}

// ─── Transition CRUD ────────────────────────────────────────────────

// CreateTransition inserts a new transition.
func (s *Store) CreateTransition(trans *Transition) error {
	now := time.Now().UTC().Format(time.RFC3339)
	trans.CreatedAt = now
	_, err := s.db.Exec(
		"INSERT INTO transitions (id, project_id, from_item_id, to_item_id, type, duration_frames, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
		trans.ID, trans.ProjectID, trans.FromItemID, trans.ToItemID, trans.Type, trans.DurationFrames, now,
	)
	if err != nil {
		return fmt.Errorf("insert transition: %w", err)
	}
	return nil
}

// ─── Interface adapters for render.TimelineReader ────────────────────

// StoreTimelineReader adapts *Store to render.TimelineReader
type StoreTimelineReader struct {
	Store *Store
}

func (r *StoreTimelineReader) ListTimelineItems(projectID string) ([]render.TimelineItemLike, error) {
	items, err := r.Store.ListTimelineItems(projectID)
	if err != nil {
		return nil, err
	}
	result := make([]render.TimelineItemLike, len(items))
	for i, item := range items {
		result[i] = item
	}
	return result, nil
}

func (r *StoreTimelineReader) ListTransitions(projectID string) ([]render.TransitionLike, error) {
	transitions, err := r.Store.ListTransitions(projectID)
	if err != nil {
		return nil, err
	}
	result := make([]render.TransitionLike, len(transitions))
	for i, t := range transitions {
		result[i] = t
	}
	return result, nil
}

// ─── Transition CRUD (continued) ────────────────────────────────────

// ListTransitions returns all transitions for a project.
func (s *Store) ListTransitions(projectID string) ([]*Transition, error) {
	rows, err := s.db.Query("SELECT id, project_id, from_item_id, to_item_id, type, duration_frames, created_at FROM transitions WHERE project_id = ? ORDER BY created_at", projectID)
	if err != nil {
		return nil, fmt.Errorf("list transitions: %w", err)
	}
	defer rows.Close()

	var transitions []*Transition
	for rows.Next() {
		var t Transition
		if err := rows.Scan(&t.ID, &t.ProjectID, &t.FromItemID, &t.ToItemID, &t.Type, &t.DurationFrames, &t.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan transition: %w", err)
		}
		transitions = append(transitions, &t)
	}
	return transitions, rows.Err()
}

// GetTransition returns a single transition by ID.
func (s *Store) GetTransition(id string) (*Transition, error) {
	row := s.db.QueryRow("SELECT id, project_id, from_item_id, to_item_id, type, duration_frames, created_at FROM transitions WHERE id = ?", id)
	var t Transition
	if err := row.Scan(&t.ID, &t.ProjectID, &t.FromItemID, &t.ToItemID, &t.Type, &t.DurationFrames, &t.CreatedAt); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("get transition: %w", err)
	}
	return &t, nil
}

// UpdateTransition updates type and/or duration_frames of a transition.
func (s *Store) UpdateTransition(t *Transition) error {
	res, err := s.db.Exec("UPDATE transitions SET type = ?, duration_frames = ? WHERE id = ?", t.Type, t.DurationFrames, t.ID)
	if err != nil {
		return fmt.Errorf("update transition: %w", err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return fmt.Errorf("transition not found: %s", t.ID)
	}
	return nil
}

// DeleteTransition removes a transition by ID.
func (s *Store) DeleteTransition(id string) error {
	res, err := s.db.Exec("DELETE FROM transitions WHERE id = ?", id)
	if err != nil {
		return fmt.Errorf("delete transition: %w", err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return fmt.Errorf("transition not found: %s", id)
	}
	return nil
}

// DeleteTransitionsByItemPair removes any existing transition between two items.
func (s *Store) DeleteTransitionsByItemPair(fromItemID, toItemID string) error {
	_, err := s.db.Exec("DELETE FROM transitions WHERE from_item_id = ? AND to_item_id = ?", fromItemID, toItemID)
	if err != nil {
		return fmt.Errorf("delete transitions by pair: %w", err)
	}
	return nil
}

// ─── Additional Store methods for MCP tools ────────────────────────────

// DeleteAllTimelineItems deletes ALL timeline items for a project.
// Schema: DELETE FROM timeline_items WHERE project_id = ?
func (s *Store) DeleteAllTimelineItems(projectID string) (int, error) {
	res, err := s.db.Exec("DELETE FROM timeline_items WHERE project_id = ?", projectID)
	if err != nil {
		return 0, fmt.Errorf("delete all timeline items: %w", err)
	}
	n, _ := res.RowsAffected()
	return int(n), nil
}

// UpdateTimelineItemProps updates the props JSON field of a timeline item.
// Schema: UPDATE timeline_items SET props = ? WHERE id = ?
func (s *Store) UpdateTimelineItemProps(id string, props string) error {
	res, err := s.db.Exec("UPDATE timeline_items SET props = ? WHERE id = ?", props, id)
	if err != nil {
		return fmt.Errorf("update timeline item props: %w", err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return fmt.Errorf("timeline item not found: %s", id)
	}
	return nil
}

// CountAssets returns the number of media assets for a project.
// Schema: SELECT COUNT(*) FROM media_assets WHERE project_id = ?
func (s *Store) CountAssets(projectID string) (int, error) {
	var count int
	err := s.db.QueryRow("SELECT COUNT(*) FROM media_assets WHERE project_id = ?", projectID).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("count assets: %w", err)
	}
	return count, nil
}

// CountTimelineItems returns the number of timeline items for a project.
// Schema: SELECT COUNT(*) FROM timeline_items WHERE project_id = ?
func (s *Store) CountTimelineItems(projectID string) (int, error) {
	var count int
	err := s.db.QueryRow("SELECT COUNT(*) FROM timeline_items WHERE project_id = ?", projectID).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("count timeline items: %w", err)
	}
	return count, nil
}

// ListTimelineItemsByTrack returns timeline items for a project filtered by track, ordered by start_frame.
// Schema: SELECT ... FROM timeline_items WHERE project_id = ? AND track = ? ORDER BY start_frame
func (s *Store) ListTimelineItemsByTrack(projectID, track string) ([]*TimelineItem, error) {
	rows, err := s.db.Query("SELECT id, project_id, asset_id, name, kind, src, track, start_frame, duration_frames, src_in_frame, props, created_at FROM timeline_items WHERE project_id = ? AND track = ? ORDER BY start_frame", projectID, track)
	if err != nil {
		return nil, fmt.Errorf("list timeline items by track: %w", err)
	}
	defer rows.Close()

	var items []*TimelineItem
	for rows.Next() {
		var item TimelineItem
		var assetID, srcNull sql.NullString
		if err := rows.Scan(&item.ID, &item.ProjectID, &assetID, &item.Name, &item.Kind, &srcNull, &item.Track, &item.StartFrame, &item.DurationFrames, &item.SrcInFrame, &item.Props, &item.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan timeline item: %w", err)
		}
		item.AssetID = assetID.String
		item.Src = srcNull.String
		items = append(items, &item)
	}
	return items, rows.Err()
}

// ─── Timeline CRUD ────────────────────────────────────────────────────

// CreateTimeline inserts a new timeline.
func (s *Store) CreateTimeline(tl *Timeline) error {
	now := time.Now().UTC().Format(time.RFC3339)
	tl.CreatedAt = now
	_, err := s.db.Exec(
		"INSERT INTO timelines (id, project_id, name, fps, width, height, ratio, hidden, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
		tl.ID, tl.ProjectID, tl.Name, tl.FPS, tl.Width, tl.Height, tl.Ratio, tl.Hidden, now,
	)
	if err != nil {
		return fmt.Errorf("insert timeline: %w", err)
	}
	return nil
}

// ListTimelines returns all timelines for a project.
func (s *Store) ListTimelines(projectID string) ([]*Timeline, error) {
	rows, err := s.db.Query("SELECT id, project_id, name, fps, width, height, ratio, hidden, created_at FROM timelines WHERE project_id = ? ORDER BY created_at", projectID)
	if err != nil {
		return nil, fmt.Errorf("list timelines: %w", err)
	}
	defer rows.Close()

	var timelines []*Timeline
	for rows.Next() {
		var tl Timeline
		var hidden int
		if err := rows.Scan(&tl.ID, &tl.ProjectID, &tl.Name, &tl.FPS, &tl.Width, &tl.Height, &tl.Ratio, &hidden, &tl.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan timeline: %w", err)
		}
		tl.Hidden = hidden != 0
		timelines = append(timelines, &tl)
	}
	return timelines, rows.Err()
}

// GetTimeline retrieves a timeline by ID. Returns nil, nil when not found.
func (s *Store) GetTimeline(id string) (*Timeline, error) {
	row := s.db.QueryRow("SELECT id, project_id, name, fps, width, height, ratio, hidden, created_at FROM timelines WHERE id = ?", id)
	var tl Timeline
	var hidden int
	if err := row.Scan(&tl.ID, &tl.ProjectID, &tl.Name, &tl.FPS, &tl.Width, &tl.Height, &tl.Ratio, &hidden, &tl.CreatedAt); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("query timeline: %w", err)
	}
	tl.Hidden = hidden != 0
	return &tl, nil
}

// UpdateTimeline updates a timeline's name, width, height, ratio, and/or hidden.
func (s *Store) UpdateTimeline(id string, name *string, width *int, height *int, ratio *string, hidden *bool) error {
	tl, err := s.GetTimeline(id)
	if err != nil {
		return err
	}
	if tl == nil {
		return fmt.Errorf("timeline not found: %s", id)
	}
	if name != nil {
		tl.Name = *name
	}
	if width != nil {
		tl.Width = *width
	}
	if height != nil {
		tl.Height = *height
	}
	if ratio != nil {
		tl.Ratio = *ratio
	}
	if hidden != nil {
		tl.Hidden = *hidden
	}
	_, err = s.db.Exec(
		"UPDATE timelines SET name = ?, width = ?, height = ?, ratio = ?, hidden = ? WHERE id = ?",
		tl.Name, tl.Width, tl.Height, tl.Ratio, tl.Hidden, id,
	)
	if err != nil {
		return fmt.Errorf("update timeline: %w", err)
	}
	return nil
}

// DeleteTimeline removes a timeline. Returns true if a row was deleted.
func (s *Store) DeleteTimeline(id string) (bool, error) {
	res, err := s.db.Exec("DELETE FROM timelines WHERE id = ?", id)
	if err != nil {
		return false, fmt.Errorf("delete timeline: %w", err)
	}
	n, _ := res.RowsAffected()
	return n > 0, nil
}

// ─── Track CRUD ────────────────────────────────────────────────────────

// CreateTrack inserts a new track.
func (s *Store) CreateTrack(t *Track) error {
	now := time.Now().UTC().Format(time.RFC3339)
	t.CreatedAt = now
	_, err := s.db.Exec(
		"INSERT INTO tracks (id, project_id, name, kind, order_index, hidden, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
		t.ID, t.ProjectID, t.Name, t.Kind, t.OrderIndex, t.Hidden, now,
	)
	if err != nil {
		return fmt.Errorf("insert track: %w", err)
	}
	return nil
}

// ListTracks returns all tracks for a project, ordered by order_index.
func (s *Store) ListTracks(projectID string) ([]*Track, error) {
	rows, err := s.db.Query("SELECT id, project_id, name, kind, order_index, hidden, created_at FROM tracks WHERE project_id = ? ORDER BY order_index", projectID)
	if err != nil {
		return nil, fmt.Errorf("list tracks: %w", err)
	}
	defer rows.Close()

	var tracks []*Track
	for rows.Next() {
		var t Track
		var hidden int
		if err := rows.Scan(&t.ID, &t.ProjectID, &t.Name, &t.Kind, &t.OrderIndex, &hidden, &t.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan track: %w", err)
		}
		t.Hidden = hidden != 0
		tracks = append(tracks, &t)
	}
	return tracks, rows.Err()
}

// GetTrack retrieves a track by ID. Returns nil, nil when not found.
func (s *Store) GetTrack(id string) (*Track, error) {
	row := s.db.QueryRow("SELECT id, project_id, name, kind, order_index, hidden, created_at FROM tracks WHERE id = ?", id)
	var t Track
	var hidden int
	if err := row.Scan(&t.ID, &t.ProjectID, &t.Name, &t.Kind, &t.OrderIndex, &hidden, &t.CreatedAt); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("query track: %w", err)
	}
	t.Hidden = hidden != 0
	return &t, nil
}

// UpdateTrack updates a track's name, kind, order_index, and/or hidden.
func (s *Store) UpdateTrack(id string, name *string, kind *string, orderIndex *int, hidden *bool) error {
	t, err := s.GetTrack(id)
	if err != nil {
		return err
	}
	if t == nil {
		return fmt.Errorf("track not found: %s", id)
	}
	if name != nil {
		t.Name = *name
	}
	if kind != nil {
		t.Kind = *kind
	}
	if orderIndex != nil {
		t.OrderIndex = *orderIndex
	}
	if hidden != nil {
		t.Hidden = *hidden
	}
	_, err = s.db.Exec(
		"UPDATE tracks SET name = ?, kind = ?, order_index = ?, hidden = ? WHERE id = ?",
		t.Name, t.Kind, t.OrderIndex, t.Hidden, id,
	)
	if err != nil {
		return fmt.Errorf("update track: %w", err)
	}
	return nil
}

// DeleteTrack removes a track. Returns true if a row was deleted.
func (s *Store) DeleteTrack(id string) (bool, error) {
	res, err := s.db.Exec("DELETE FROM tracks WHERE id = ?", id)
	if err != nil {
		return false, fmt.Errorf("delete track: %w", err)
	}
	n, _ := res.RowsAffected()
	return n > 0, nil
}

// ─── Design Style CRUD ────────────────────────────────────────────────

// CreateDesignStyle inserts a new design style.
func (s *Store) CreateDesignStyle(ds *DesignStyle) error {
	now := time.Now().UTC().Format(time.RFC3339)
	ds.CreatedAt = now
	_, err := s.db.Exec(
		"INSERT INTO design_styles (id, project_id, name, colors, fonts, created_at) VALUES (?, ?, ?, ?, ?, ?)",
		ds.ID, ds.ProjectID, ds.Name, ds.Colors, ds.Fonts, now,
	)
	if err != nil {
		return fmt.Errorf("insert design style: %w", err)
	}
	return nil
}

// ListDesignStyles returns all design styles for a project.
func (s *Store) ListDesignStyles(projectID string) ([]*DesignStyle, error) {
	rows, err := s.db.Query("SELECT id, project_id, name, colors, fonts, created_at FROM design_styles WHERE project_id = ? ORDER BY created_at", projectID)
	if err != nil {
		return nil, fmt.Errorf("list design styles: %w", err)
	}
	defer rows.Close()

	var styles []*DesignStyle
	for rows.Next() {
		var ds DesignStyle
		if err := rows.Scan(&ds.ID, &ds.ProjectID, &ds.Name, &ds.Colors, &ds.Fonts, &ds.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan design style: %w", err)
		}
		styles = append(styles, &ds)
	}
	return styles, rows.Err()
}

// GetDesignStyle retrieves a design style by ID. Returns nil, nil when not found.
func (s *Store) GetDesignStyle(id string) (*DesignStyle, error) {
	row := s.db.QueryRow("SELECT id, project_id, name, colors, fonts, created_at FROM design_styles WHERE id = ?", id)
	var ds DesignStyle
	if err := row.Scan(&ds.ID, &ds.ProjectID, &ds.Name, &ds.Colors, &ds.Fonts, &ds.CreatedAt); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("query design style: %w", err)
	}
	return &ds, nil
}

// UpdateDesignStyle updates a design style's name, colors, and/or fonts.
func (s *Store) UpdateDesignStyle(id string, name *string, colors *string, fonts *string) error {
	ds, err := s.GetDesignStyle(id)
	if err != nil {
		return err
	}
	if ds == nil {
		return fmt.Errorf("design style not found: %s", id)
	}
	if name != nil {
		ds.Name = *name
	}
	if colors != nil {
		ds.Colors = *colors
	}
	if fonts != nil {
		ds.Fonts = *fonts
	}
	_, err = s.db.Exec(
		"UPDATE design_styles SET name = ?, colors = ?, fonts = ? WHERE id = ?",
		ds.Name, ds.Colors, ds.Fonts, id,
	)
	if err != nil {
		return fmt.Errorf("update design style: %w", err)
	}
	return nil
}

// DeleteDesignStyle removes a design style. Returns true if a row was deleted.
func (s *Store) DeleteDesignStyle(id string) (bool, error) {
	res, err := s.db.Exec("DELETE FROM design_styles WHERE id = ?", id)
	if err != nil {
		return false, fmt.Errorf("delete design style: %w", err)
	}
	n, _ := res.RowsAffected()
	return n > 0, nil
}

// ─── Media Asset additional methods ────────────────────────────────────

// RenameAsset updates a media asset's name.
func (s *Store) RenameAsset(id, name string) error {
	res, err := s.db.Exec("UPDATE media_assets SET name = ? WHERE id = ?", name, id)
	if err != nil {
		return fmt.Errorf("rename asset: %w", err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return fmt.Errorf("asset not found: %s", id)
	}
	return nil
}

// DeleteAsset removes a media asset. Returns true if a row was deleted.
func (s *Store) DeleteAsset(id string) (bool, error) {
	res, err := s.db.Exec("DELETE FROM media_assets WHERE id = ?", id)
	if err != nil {
		return false, fmt.Errorf("delete asset: %w", err)
	}
	n, _ := res.RowsAffected()
	return n > 0, nil
}

// ─── Marker CRUD ────────────────────────────────────────────────────────

// CreateMarker inserts a new marker.
func (s *Store) CreateMarker(m *Marker) error {
	now := time.Now().UTC().Format(time.RFC3339)
	m.CreatedAt = now
	_, err := s.db.Exec(
		"INSERT INTO markers (id, project_id, frame, label, color, created_at) VALUES (?, ?, ?, ?, ?, ?)",
		m.ID, m.ProjectID, m.Frame, m.Label, m.Color, now,
	)
	if err != nil {
		return fmt.Errorf("insert marker: %w", err)
	}
	return nil
}

// ListMarkers returns all markers for a project, ordered by frame.
func (s *Store) ListMarkers(projectID string) ([]*Marker, error) {
	rows, err := s.db.Query("SELECT id, project_id, frame, label, color, created_at FROM markers WHERE project_id = ? ORDER BY frame", projectID)
	if err != nil {
		return nil, fmt.Errorf("list markers: %w", err)
	}
	defer rows.Close()

	var markers []*Marker
	for rows.Next() {
		var m Marker
		if err := rows.Scan(&m.ID, &m.ProjectID, &m.Frame, &m.Label, &m.Color, &m.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan marker: %w", err)
		}
		markers = append(markers, &m)
	}
	return markers, rows.Err()
}

// GetMarker retrieves a marker by ID. Returns nil, nil when not found.
func (s *Store) GetMarker(id string) (*Marker, error) {
	row := s.db.QueryRow("SELECT id, project_id, frame, label, color, created_at FROM markers WHERE id = ?", id)
	var m Marker
	if err := row.Scan(&m.ID, &m.ProjectID, &m.Frame, &m.Label, &m.Color, &m.CreatedAt); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("query marker: %w", err)
	}
	return &m, nil
}

// UpdateMarker updates a marker's frame, label, and/or color.
func (s *Store) UpdateMarker(id string, frame *int, label *string, color *string) error {
	m, err := s.GetMarker(id)
	if err != nil {
		return err
	}
	if m == nil {
		return fmt.Errorf("marker not found: %s", id)
	}
	if frame != nil {
		m.Frame = *frame
	}
	if label != nil {
		m.Label = *label
	}
	if color != nil {
		m.Color = *color
	}
	_, err = s.db.Exec(
		"UPDATE markers SET frame = ?, label = ?, color = ? WHERE id = ?",
		m.Frame, m.Label, m.Color, id,
	)
	if err != nil {
		return fmt.Errorf("update marker: %w", err)
	}
	return nil
}

// DeleteMarker removes a marker. Returns true if a row was deleted.
func (s *Store) DeleteMarker(id string) (bool, error) {
	res, err := s.db.Exec("DELETE FROM markers WHERE id = ?", id)
	if err != nil {
		return false, fmt.Errorf("delete marker: %w", err)
	}
	n, _ := res.RowsAffected()
	return n > 0, nil
}
