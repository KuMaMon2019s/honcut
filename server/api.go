package honcutserver

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"honcut-server/internal/render"

	"github.com/google/uuid"
)

// APIHandler returns an http.Handler that serves the REST API.
// Routes:
//
//	POST   /api/projects                        — create
//	GET    /api/projects                        — list
//	GET    /api/projects/{id}                   — get
//	PUT    /api/projects/{id}                   — update
//	DELETE /api/projects/{id}                   — delete
//	POST   /api/projects/{id}/clips             — add clip to timeline
//	GET    /api/projects/{id}/clips             — list clips
//	GET    /api/projects/{id}/clips/{clip_id}   — get clip
//	PUT    /api/projects/{id}/clips/{clip_id}   — update clip
//	DELETE /api/projects/{id}/clips/{clip_id}   — delete clip
//	POST   /api/upload                          — upload media
func APIHandler(store *Store, pm *render.ProgressManager, outputDir string) http.Handler {
	mux := http.NewServeMux()
	mcpServer := NewMCPServer(store, pm, outputDir)
	// Project collection — POST create, GET list
	mux.HandleFunc("POST /api/projects", func(w http.ResponseWriter, r *http.Request) {
		createProject(w, r, store)
	})
	mux.HandleFunc("GET /api/projects", func(w http.ResponseWriter, r *http.Request) {
		listProjects(w, r, store)
	})

	// Single project — GET, PUT, DELETE
	mux.HandleFunc("GET /api/projects/{id}", func(w http.ResponseWriter, r *http.Request) {
		getProject(w, r, store, r.PathValue("id"))
	})
	mux.HandleFunc("PUT /api/projects/{id}", func(w http.ResponseWriter, r *http.Request) {
		updateProject(w, r, store, r.PathValue("id"))
	})
	mux.HandleFunc("DELETE /api/projects/{id}", func(w http.ResponseWriter, r *http.Request) {
		deleteProject(w, r, store, r.PathValue("id"))
	})

	// Clips — POST create, GET list
	mux.HandleFunc("POST /api/projects/{id}/clips", func(w http.ResponseWriter, r *http.Request) {
		createClip(w, r, store, r.PathValue("id"))
	})
	mux.HandleFunc("GET /api/projects/{id}/clips", func(w http.ResponseWriter, r *http.Request) {
		listClips(w, r, store, r.PathValue("id"))
	})

	// Single clip — GET, PUT, DELETE
	mux.HandleFunc("GET /api/projects/{id}/clips/{clip_id}", func(w http.ResponseWriter, r *http.Request) {
		getClip(w, r, store, r.PathValue("clip_id"))
	})
	mux.HandleFunc("PUT /api/projects/{id}/clips/{clip_id}", func(w http.ResponseWriter, r *http.Request) {
		updateClip(w, r, store, r.PathValue("clip_id"))
	})
	mux.HandleFunc("DELETE /api/projects/{id}/clips/{clip_id}", func(w http.ResponseWriter, r *http.Request) {
		deleteClip(w, r, store, r.PathValue("clip_id"))

	// Transitions
	mux.HandleFunc("GET /api/projects/{id}/transitions", func(w http.ResponseWriter, r *http.Request) {
		listTransitions(w, r, store, r.PathValue("id"))
	})
	})

	// New endpoints for Batch A tools
	mux.HandleFunc("DELETE /api/projects/{id}/timeline", func(w http.ResponseWriter, r *http.Request) {
		clearTimeline(w, r, store, r.PathValue("id"))
	})
	mux.HandleFunc("POST /api/projects/{id}/clips/{clip_id}/split", func(w http.ResponseWriter, r *http.Request) {
		splitClip(w, r, store, r.PathValue("id"), r.PathValue("clip_id"))
	})
	mux.HandleFunc("POST /api/projects/{id}/clips/{clip_id}/duplicate", func(w http.ResponseWriter, r *http.Request) {
		duplicateClip(w, r, store, r.PathValue("id"), r.PathValue("clip_id"))
	})
	mux.HandleFunc("PATCH /api/projects/{id}/clips/{clip_id}/props", func(w http.ResponseWriter, r *http.Request) {
		updateClipProps(w, r, store, r.PathValue("id"), r.PathValue("clip_id"))
	})
	mux.HandleFunc("PATCH /api/projects/{id}/clips/{clip_id}/timing", func(w http.ResponseWriter, r *http.Request) {
		setClipTiming(w, r, store, r.PathValue("id"), r.PathValue("clip_id"))
	})

	// Batch B: Timelines, Tracks, Design Styles, Media Pool
	mux.HandleFunc("GET /api/projects/{id}/timelines", func(w http.ResponseWriter, r *http.Request) {
		listTimelines(w, r, store, r.PathValue("id"))
	})
	mux.HandleFunc("POST /api/projects/{id}/timelines", func(w http.ResponseWriter, r *http.Request) {
		createTimeline(w, r, store, r.PathValue("id"))
	})
	mux.HandleFunc("PUT /api/projects/{id}/timelines/{timeline_id}", func(w http.ResponseWriter, r *http.Request) {
		updateTimeline(w, r, store, r.PathValue("id"), r.PathValue("timeline_id"))
	})
	mux.HandleFunc("DELETE /api/projects/{id}/timelines/{timeline_id}", func(w http.ResponseWriter, r *http.Request) {
		deleteTimeline(w, r, store, r.PathValue("id"), r.PathValue("timeline_id"))
	})

	mux.HandleFunc("GET /api/projects/{id}/tracks", func(w http.ResponseWriter, r *http.Request) {
		listTracks(w, r, store, r.PathValue("id"))
	})
	mux.HandleFunc("POST /api/projects/{id}/tracks", func(w http.ResponseWriter, r *http.Request) {
		createTrack(w, r, store, r.PathValue("id"))
	})
	mux.HandleFunc("PUT /api/projects/{id}/tracks/{track_id}", func(w http.ResponseWriter, r *http.Request) {
		updateTrack(w, r, store, r.PathValue("id"), r.PathValue("track_id"))
	})
	mux.HandleFunc("DELETE /api/projects/{id}/tracks/{track_id}", func(w http.ResponseWriter, r *http.Request) {
		deleteTrack(w, r, store, r.PathValue("id"), r.PathValue("track_id"))
	})

	mux.HandleFunc("GET /api/projects/{id}/design-styles", func(w http.ResponseWriter, r *http.Request) {
		listDesignStyles(w, r, store, r.PathValue("id"))
	})
	mux.HandleFunc("POST /api/projects/{id}/design-styles", func(w http.ResponseWriter, r *http.Request) {
		createDesignStyle(w, r, store, r.PathValue("id"))
	})
	mux.HandleFunc("PUT /api/projects/{id}/design-styles/{style_id}", func(w http.ResponseWriter, r *http.Request) {
		updateDesignStyle(w, r, store, r.PathValue("id"), r.PathValue("style_id"))
	})
	mux.HandleFunc("DELETE /api/projects/{id}/design-styles/{style_id}", func(w http.ResponseWriter, r *http.Request) {
		deleteDesignStyle(w, r, store, r.PathValue("id"), r.PathValue("style_id"))
	})

	mux.HandleFunc("GET /api/projects/{id}/assets", func(w http.ResponseWriter, r *http.Request) {
		listAssets(w, r, store, r.PathValue("id"))
	})
	mux.HandleFunc("DELETE /api/projects/{id}/assets/{asset_id}", func(w http.ResponseWriter, r *http.Request) {
		deleteAsset(w, r, store, r.PathValue("id"), r.PathValue("asset_id"))
	})
	mux.HandleFunc("PATCH /api/projects/{id}/assets/{asset_id}", func(w http.ResponseWriter, r *http.Request) {
		renameAsset(w, r, store, r.PathValue("id"), r.PathValue("asset_id"))
	})

	// Library (effects / transitions / zoom presets / sounds)
	mux.HandleFunc("GET /api/library", func(w http.ResponseWriter, r *http.Request) {
		libraryAPI(w, r)
	})

	// Batch C: Templates, Script, Status
	mux.HandleFunc("GET /api/templates", func(w http.ResponseWriter, r *http.Request) {
		listTemplatesAPI(w, r)
	})
	mux.HandleFunc("GET /api/templates/search", func(w http.ResponseWriter, r *http.Request) {
		searchTemplatesAPI(w, r)
	})
	mux.HandleFunc("GET /api/status", func(w http.ResponseWriter, r *http.Request) {
		statusAPI(w, r, store)
	})

	// Upload
	mux.HandleFunc("POST /api/upload", func(w http.ResponseWriter, r *http.Request) {
		uploadHandler(w, r, store)
	})

	// MCP JSON-RPC over HTTP
	mux.HandleFunc("POST /api/mcp", func(w http.ResponseWriter, r *http.Request) {
		handleMCPHTTP(w, r, mcpServer)
	})

	return mux
}

type createRequest struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
}

type updateRequest struct {
	Name        *string `json:"name"`
	Description *string `json:"description"`
}

func createProject(w http.ResponseWriter, r *http.Request, store *Store) {
	var req createRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	if req.ID == "" || req.Name == "" {
		http.Error(w, "id and name required", http.StatusBadRequest)
		return
	}

	p, err := store.Create(req.ID, req.Name, req.Description)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(p)
}

func listProjects(w http.ResponseWriter, r *http.Request, store *Store) {
	projects, err := store.List()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(projects)
}

func getProject(w http.ResponseWriter, r *http.Request, store *Store, id string) {
	p, err := store.Get(id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if p == nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(p)
}

func updateProject(w http.ResponseWriter, r *http.Request, store *Store, id string) {
	var req updateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}

	p, err := store.Update(id, req.Name, req.Description)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if p == nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(p)
}

func deleteProject(w http.ResponseWriter, r *http.Request, store *Store, id string) {
	deleted, err := store.Delete(id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if !deleted {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// uploadHandler handles media uploads via multipart or base64 JSON
func uploadHandler(w http.ResponseWriter, r *http.Request, store *Store) {
	projectID := r.URL.Query().Get("project_id")
	if projectID == "" {
		http.Error(w, "project_id query param required", http.StatusBadRequest)
		return
	}

	// Verify project exists
	project, err := store.Get(projectID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if project == nil {
		http.Error(w, "project not found", http.StatusNotFound)
		return
	}

	contentType := r.Header.Get("Content-Type")

	var fileName, fileKind, srcPath string
	var fileSize int64

	if strings.Contains(contentType, "multipart/form-data") {
		// Multipart upload
		if err := r.ParseMultipartForm(32 << 20); err != nil { // 32MB max
			http.Error(w, "failed to parse multipart: "+err.Error(), http.StatusBadRequest)
			return
		}

		file, header, err := r.FormFile("file")
		if err != nil {
			http.Error(w, "file field required: "+err.Error(), http.StatusBadRequest)
			return
		}
		defer file.Close()

		fileName = r.FormValue("name")
		if fileName == "" {
			fileName = header.Filename
		}
		fileKind = r.FormValue("kind")
		if fileKind == "" {
			fileKind = kindFromMime(header.Header.Get("Content-Type"))
		}

		// Save to uploads dir
		homeDir, _ := os.UserHomeDir()
		uploadDir := filepath.Join(homeDir, ".honcut", "uploads")
		os.MkdirAll(uploadDir, 0755)

		safeName := uuid.New().String()[:8] + "_" + sanitizeFilename(fileName)
		srcPath = filepath.Join(uploadDir, safeName)

		dst, err := os.Create(srcPath)
		if err != nil {
			http.Error(w, "failed to create file: "+err.Error(), http.StatusInternalServerError)
			return
		}
		defer dst.Close()

		written, err := io.Copy(dst, file)
		if err != nil {
			http.Error(w, "failed to write file: "+err.Error(), http.StatusInternalServerError)
			return
		}
		fileSize = written
		srcPath = "/uploads/" + safeName

	} else if strings.Contains(contentType, "application/json") {
		// Base64 JSON upload
		var req struct {
			Name string `json:"name"`
			Kind string `json:"kind"`
			Data string `json:"data"` // base64 encoded
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid json", http.StatusBadRequest)
			return
		}

		fileName = req.Name
		fileKind = req.Kind
		if fileKind == "" {
			fileKind = "video"
		}

		data, err := base64.StdEncoding.DecodeString(req.Data)
		if err != nil {
			http.Error(w, "invalid base64 data", http.StatusBadRequest)
			return
		}

		homeDir, _ := os.UserHomeDir()
		uploadDir := filepath.Join(homeDir, ".honcut", "uploads")
		os.MkdirAll(uploadDir, 0755)

		safeName := uuid.New().String()[:8] + "_" + sanitizeFilename(fileName)
		srcPath = filepath.Join(uploadDir, safeName)

		if err := os.WriteFile(srcPath, data, 0644); err != nil {
			http.Error(w, "failed to write file: "+err.Error(), http.StatusInternalServerError)
			return
		}
		fileSize = int64(len(data))
		srcPath = "/uploads/" + safeName

	} else {
		http.Error(w, "unsupported content type, use multipart/form-data or application/json", http.StatusBadRequest)
		return
	}

	// Create asset record
	assetID := uuid.New().String()
	asset := &MediaAsset{
		ID:             assetID,
		ProjectID:      projectID,
		Name:           fileName,
		Kind:           fileKind,
		Src:            srcPath,
		DurationFrames: 120,
	}

	if err := store.CreateAsset(asset); err != nil {
		http.Error(w, "failed to create asset: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"asset_id":   assetID,
		"name":       fileName,
		"kind":       fileKind,
		"src":        srcPath,
		"size":       fileSize,
		"project_id": projectID,
	})
}

func sanitizeFilename(name string) string {
	name = filepath.Base(name)
	var b strings.Builder
	for _, r := range name {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '.' || r == '-' || r == '_' {
			b.WriteRune(r)
		}
	}
	if b.Len() == 0 {
		return "file"
	}
	return b.String()
}

func kindFromMime(mime string) string {
	switch {
	case strings.HasPrefix(mime, "video"):
		return "video"
	case strings.HasPrefix(mime, "audio"):
		return "audio"
	case strings.HasPrefix(mime, "image"):
		return "image"
	default:
		return "video"
	}
}

// ── Clip handlers ────────────────────────────────────────────────────────

type clipCreateRequest struct {
	ID             string `json:"id"`
	AssetID        string `json:"asset_id"`
	Name           string `json:"name"`
	Kind           string `json:"kind"`
	Src            string `json:"src"`
	Track          string `json:"track"`
	StartFrame     int    `json:"start_frame"`
	DurationFrames int    `json:"duration_frames"`
	SrcInFrame     int    `json:"src_in_frame"`
	Props          string `json:"props"`
}

type clipUpdateRequest struct {
	Track          *string `json:"track"`
	StartFrame     *int    `json:"start_frame"`
	DurationFrames *int    `json:"duration_frames"`
	SrcInFrame     *int    `json:"src_in_frame"`
}

func createClip(w http.ResponseWriter, r *http.Request, store *Store, projectID string) {
	var req clipCreateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	if req.Name == "" {
		http.Error(w, "name required", http.StatusBadRequest)
		return
	}

	if req.ID == "" {
		req.ID = uuid.New().String()
	}
	if req.Kind == "" {
		req.Kind = "video"
	}
	if req.Track == "" {
		req.Track = "V1"
	}

	clip := &TimelineItem{
		ID:             req.ID,
		ProjectID:      projectID,
		AssetID:        req.AssetID,
		Name:           req.Name,
		Kind:           req.Kind,
		Src:            req.Src,
		Track:          req.Track,
		StartFrame:     req.StartFrame,
		DurationFrames: req.DurationFrames,
		SrcInFrame:     req.SrcInFrame,
		Props:          req.Props,
	}

	if err := store.CreateTimelineItem(clip); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(clip)
}

func listClips(w http.ResponseWriter, r *http.Request, store *Store, projectID string) {
	clips, err := store.ListTimelineItems(projectID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(clips)
}

func getClip(w http.ResponseWriter, r *http.Request, store *Store, clipID string) {
	clip, err := store.GetTimelineItem(clipID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if clip == nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(clip)
}

func updateClip(w http.ResponseWriter, r *http.Request, store *Store, clipID string) {
	var req clipUpdateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}

	if err := store.UpdateTimelineItem(clipID, req.Track, req.StartFrame, req.DurationFrames, req.SrcInFrame); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	clip, err := store.GetTimelineItem(clipID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(clip)
}

func deleteClip(w http.ResponseWriter, r *http.Request, store *Store, clipID string) {
	deleted, err := store.DeleteTimelineItem(clipID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if !deleted {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ── Batch A: New REST handlers ─────────────────────────────────────

type splitRequest struct {
	AtFrame int `json:"at_frame"`
}

type timingRequest struct {
	StartFrame     *int     `json:"start_frame"`
	DurationFrames *int     `json:"duration_frames"`
	FadeInSeconds  *float64 `json:"fade_in_seconds"`
	FadeOutSeconds *float64 `json:"fade_out_seconds"`
}

func clearTimeline(w http.ResponseWriter, r *http.Request, store *Store, projectID string) {
	count, err := store.DeleteAllTimelineItems(projectID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":       true,
		"deleted_count": count,
	})
}

func splitClip(w http.ResponseWriter, r *http.Request, store *Store, projectID, clipID string) {
	var req splitRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}

	item, err := store.GetTimelineItem(clipID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if item == nil {
		http.Error(w, "clip not found", http.StatusNotFound)
		return
	}

	// Validate split point
	if req.AtFrame <= item.StartFrame || req.AtFrame >= item.StartFrame+item.DurationFrames {
		http.Error(w, fmt.Sprintf("split frame %d must be within clip range [%d, %d)", req.AtFrame, item.StartFrame, item.StartFrame+item.DurationFrames), http.StatusBadRequest)
		return
	}

	// Calculate new durations
	originalDuration := req.AtFrame - item.StartFrame
	splitDuration := item.DurationFrames - originalDuration
	splitSrcInFrame := item.SrcInFrame + originalDuration

	// Update original item duration
	err = store.UpdateTimelineItem(clipID, nil, nil, &originalDuration, nil)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Create new item for the split portion
	newItemID := uuid.New().String()
	newItem := &TimelineItem{
		ID:             newItemID,
		ProjectID:      item.ProjectID,
		AssetID:        item.AssetID,
		Name:           item.Name + " (split)",
		Kind:           item.Kind,
		Src:            item.Src,
		Track:          item.Track,
		StartFrame:     req.AtFrame,
		DurationFrames: splitDuration,
		SrcInFrame:     splitSrcInFrame,
		Props:          item.Props,
	}

	if err := store.CreateTimelineItem(newItem); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":     true,
		"original_id": clipID,
		"split_id":    newItemID,
	})
}

func duplicateClip(w http.ResponseWriter, r *http.Request, store *Store, projectID, clipID string) {
	item, err := store.GetTimelineItem(clipID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if item == nil {
		http.Error(w, "clip not found", http.StatusNotFound)
		return
	}

	// Find end of track
	items, err := store.ListTimelineItemsByTrack(item.ProjectID, item.Track)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	endFrame := 0
	for _, i := range items {
		if i.StartFrame+i.DurationFrames > endFrame {
			endFrame = i.StartFrame + i.DurationFrames
		}
	}

	// Create duplicate at end of track
	newItemID := uuid.New().String()
	newItem := &TimelineItem{
		ID:             newItemID,
		ProjectID:      item.ProjectID,
		AssetID:        item.AssetID,
		Name:           item.Name + " (copy)",
		Kind:           item.Kind,
		Src:            item.Src,
		Track:          item.Track,
		StartFrame:     endFrame,
		DurationFrames: item.DurationFrames,
		SrcInFrame:     item.SrcInFrame,
		Props:          item.Props,
	}

	if err := store.CreateTimelineItem(newItem); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":      true,
		"original_id":  clipID,
		"duplicate_id": newItemID,
		"start_frame":  endFrame,
	})
}

func updateClipProps(w http.ResponseWriter, r *http.Request, store *Store, projectID, clipID string) {
	var req map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}

	propsJSON, err := json.Marshal(req)
	if err != nil {
		http.Error(w, "failed to serialize props", http.StatusInternalServerError)
		return
	}

	if err := store.UpdateTimelineItemProps(clipID, string(propsJSON)); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	clip, err := store.GetTimelineItem(clipID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(clip)
}

func setClipTiming(w http.ResponseWriter, r *http.Request, store *Store, projectID, clipID string) {
	var req timingRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}

	// Update timing fields
	if req.StartFrame != nil || req.DurationFrames != nil {
		if err := store.UpdateTimelineItem(clipID, nil, req.StartFrame, req.DurationFrames, nil); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	}

	// Update fade-in/fade-out in props
	if req.FadeInSeconds != nil || req.FadeOutSeconds != nil {
		item, err := store.GetTimelineItem(clipID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if item == nil {
			http.Error(w, "clip not found", http.StatusNotFound)
			return
		}

		// Parse existing props
		var propsMap map[string]interface{}
		if item.Props != "" && item.Props != "{}" {
			if err := json.Unmarshal([]byte(item.Props), &propsMap); err != nil {
				propsMap = make(map[string]interface{})
			}
		} else {
			propsMap = make(map[string]interface{})
		}

		if req.FadeInSeconds != nil {
			if *req.FadeInSeconds == 0 {
				delete(propsMap, "fadeIn")
			} else {
				propsMap["fadeIn"] = *req.FadeInSeconds
			}
		}
		if req.FadeOutSeconds != nil {
			if *req.FadeOutSeconds == 0 {
				delete(propsMap, "fadeOut")
			} else {
				propsMap["fadeOut"] = *req.FadeOutSeconds
			}
		}

		propsJSON, err := json.Marshal(propsMap)
		if err != nil {
			http.Error(w, "marshal props: "+err.Error(), http.StatusInternalServerError)
			return
		}
		if err := store.UpdateTimelineItemProps(clipID, string(propsJSON)); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	}

	clip, err := store.GetTimelineItem(clipID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(clip)
}

// ── Batch B: Timeline/Track/DesignStyle/Asset handlers ─────────────────────────────────────

type timelineRequest struct {
	Name   string `json:"name"`
	Width  int    `json:"width"`
	Height int    `json:"height"`
	FPS    int    `json:"fps"`
}

type trackRequest struct {
	Name string `json:"name"`
	Kind string `json:"kind"` // video or audio
}

type designStyleRequest struct {
	Name   string                 `json:"name"`
	Colors map[string]interface{} `json:"colors"`
	Fonts  map[string]interface{} `json:"fonts"`
}

func listTimelines(w http.ResponseWriter, r *http.Request, store *Store, projectID string) {
	timelines, err := store.ListTimelines(projectID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(timelines)
}

func createTimeline(w http.ResponseWriter, r *http.Request, store *Store, projectID string) {
	var req timelineRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	if req.Name == "" {
		http.Error(w, "name required", http.StatusBadRequest)
		return
	}
	if req.Width == 0 {
		req.Width = 1920
	}
	if req.Height == 0 {
		req.Height = 1080
	}
	if req.FPS == 0 {
		req.FPS = 30
	}

	tl := &Timeline{
		ID:        uuid.New().String(),
		ProjectID: projectID,
		Name:      req.Name,
		FPS:       req.FPS,
		Width:     req.Width,
		Height:    req.Height,
	}

	if err := store.CreateTimeline(tl); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(tl)
}

func updateTimeline(w http.ResponseWriter, r *http.Request, store *Store, projectID, timelineID string) {
	var req timelineRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}

	var namePtr *string
	var widthPtr *int
	var heightPtr *int

	if req.Name != "" {
		namePtr = &req.Name
	}
	if req.Width != 0 {
		widthPtr = &req.Width
	}
	if req.Height != 0 {
		heightPtr = &req.Height
	}

	if err := store.UpdateTimeline(timelineID, namePtr, widthPtr, heightPtr, nil, nil); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	tl, err := store.GetTimeline(timelineID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(tl)
}

func deleteTimeline(w http.ResponseWriter, r *http.Request, store *Store, projectID, timelineID string) {
	deleted, err := store.DeleteTimeline(timelineID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if !deleted {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func listTracks(w http.ResponseWriter, r *http.Request, store *Store, projectID string) {
	tracks, err := store.ListTracks(projectID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(tracks)
}

func createTrack(w http.ResponseWriter, r *http.Request, store *Store, projectID string) {
	var req trackRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	if req.Name == "" {
		http.Error(w, "name required", http.StatusBadRequest)
		return
	}
	if req.Kind == "" {
		req.Kind = "video"
	}

	trk := &Track{
		ID:        uuid.New().String(),
		ProjectID: projectID,
		Name:      req.Name,
		Kind:      req.Kind,
	}

	if err := store.CreateTrack(trk); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(trk)
}

func updateTrack(w http.ResponseWriter, r *http.Request, store *Store, projectID, trackID string) {
	var req trackRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}

	var namePtr *string
	var kindPtr *string

	if req.Name != "" {
		namePtr = &req.Name
	}
	if req.Kind != "" {
		kindPtr = &req.Kind
	}

	if err := store.UpdateTrack(trackID, namePtr, kindPtr, nil, nil); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	trk, err := store.GetTrack(trackID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(trk)
}

func deleteTrack(w http.ResponseWriter, r *http.Request, store *Store, projectID, trackID string) {
	deleted, err := store.DeleteTrack(trackID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if !deleted {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func listDesignStyles(w http.ResponseWriter, r *http.Request, store *Store, projectID string) {
	styles, err := store.ListDesignStyles(projectID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(styles)
}

func createDesignStyle(w http.ResponseWriter, r *http.Request, store *Store, projectID string) {
	var req designStyleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	if req.Name == "" {
		http.Error(w, "name required", http.StatusBadRequest)
		return
	}

	colorsJSON, err := json.Marshal(req.Colors)
	if err != nil {
		http.Error(w, "marshal colors: "+err.Error(), http.StatusInternalServerError)
		return
	}
	fontsJSON, err := json.Marshal(req.Fonts)
	if err != nil {
		http.Error(w, "marshal fonts: "+err.Error(), http.StatusInternalServerError)
		return
	}

	ds := &DesignStyle{
		ID:        uuid.New().String(),
		ProjectID: projectID,
		Name:      req.Name,
		Colors:    string(colorsJSON),
		Fonts:     string(fontsJSON),
	}

	if err := store.CreateDesignStyle(ds); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(ds)
}

func updateDesignStyle(w http.ResponseWriter, r *http.Request, store *Store, projectID, styleID string) {
	var req designStyleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}

	var namePtr *string
	var colorsPtr *string
	var fontsPtr *string

	if req.Name != "" {
		namePtr = &req.Name
	}
	if req.Colors != nil {
		colorsJSON, err := json.Marshal(req.Colors)
		if err != nil {
			http.Error(w, "marshal colors: "+err.Error(), http.StatusInternalServerError)
			return
		}
		colorsStr := string(colorsJSON)
		colorsPtr = &colorsStr
	}
	if req.Fonts != nil {
		fontsJSON, err := json.Marshal(req.Fonts)
		if err != nil {
			http.Error(w, "marshal fonts: "+err.Error(), http.StatusInternalServerError)
			return
		}
		fontsStr := string(fontsJSON)
		fontsPtr = &fontsStr
	}

	if err := store.UpdateDesignStyle(styleID, namePtr, colorsPtr, fontsPtr); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	ds, err := store.GetDesignStyle(styleID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(ds)
}

func deleteDesignStyle(w http.ResponseWriter, r *http.Request, store *Store, projectID, styleID string) {
	deleted, err := store.DeleteDesignStyle(styleID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if !deleted {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func listAssets(w http.ResponseWriter, r *http.Request, store *Store, projectID string) {
	assets, err := store.ListAssets(projectID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(assets)
}

func deleteAsset(w http.ResponseWriter, r *http.Request, store *Store, projectID, assetID string) {
	deleted, err := store.DeleteAsset(assetID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if !deleted {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func renameAsset(w http.ResponseWriter, r *http.Request, store *Store, projectID, assetID string) {
	var req struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	if req.Name == "" {
		http.Error(w, "name required", http.StatusBadRequest)
		return
	}

	if err := store.RenameAsset(assetID, req.Name); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	asset, err := store.GetAsset(assetID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(asset)
}

// ── Batch C: Templates, Script, Status REST handlers ─────────────────────────────────────

// libraryAPI returns the built-in library catalog (effects, transitions, zoom presets, sounds).
// Optional ?type=effects|transitions|zoom|sounds filter.
func libraryAPI(w http.ResponseWriter, r *http.Request) {
	libType := r.URL.Query().Get("type")

	result := map[string]interface{}{}
	if libType == "" || libType == "effects" || libType == "all" {
		result["effects"] = []string{"Blur", "Sharpen", "Vignette", "Chromatic Aberration", "Glow", "Noise"}
	}
	if libType == "" || libType == "transitions" || libType == "all" {
		result["transitions"] = []string{"Dissolve", "Wipe", "Fade", "Slide", "Zoom Blur"}
	}
	if libType == "" || libType == "zoom" || libType == "all" {
		result["zoom"] = []string{"Ken Burns Slow", "Dynamic Zoom In", "Smooth Pan"}
	}
	if libType == "" || libType == "sounds" || libType == "all" {
		result["sounds"] = []string{"Whoosh", "Click", "Pop", "Swoosh", "Bell", "Chime"}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

func listTemplatesAPI(w http.ResponseWriter, r *http.Request) {
	category := r.URL.Query().Get("category")

	if category == "" {
		categories := ListTemplateCategories()
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"categories": categories,
			"total":      len(templateCatalog),
		})
		return
	}

	templates := ListTemplatesByCategory(category)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"category":  category,
		"templates": templates,
		"count":     len(templates),
	})
}

func searchTemplatesAPI(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query().Get("q")
	if query == "" {
		http.Error(w, "q query parameter required", http.StatusBadRequest)
		return
	}

	templates := SearchTemplates(query)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"query":     query,
		"templates": templates,
		"count":     len(templates),
	})
}

func statusAPI(w http.ResponseWriter, r *http.Request, store *Store) {
	projects, err := store.List()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":        "online",
		"project_count": len(projects),
		"message":       "Honcut server is running",
	})
}

// ── MCP HTTP handler ─────────────────────────────────────────────────────

// handleMCPHTTP handles JSON-RPC style MCP requests over HTTP POST.
// Accepts: {"jsonrpc":"2.0","id":1,"method":"tools/list"}
//
//	{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"...","arguments":{}}}
func handleMCPHTTP(w http.ResponseWriter, r *http.Request, mcpServer *MCPServer) {
	var request struct {
		JSONRPC string                 `json:"jsonrpc"`
		ID      interface{}            `json:"id"`
		Method  string                 `json:"method"`
		Params  map[string]interface{} `json:"params"`
	}
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"jsonrpc": "2.0",
			"id":      nil,
			"error":   map[string]interface{}{"code": -32700, "message": "Parse error"},
		})
		return
	}

	w.Header().Set("Content-Type", "application/json")

	switch request.Method {
	case "initialize":
		json.NewEncoder(w).Encode(map[string]interface{}{
			"jsonrpc": "2.0",
			"id":      request.ID,
			"result": map[string]interface{}{
				"protocolVersion": "2024-11-05",
				"capabilities": map[string]interface{}{
					"tools": map[string]interface{}{},
				},
				"serverInfo": map[string]interface{}{
					"name":    "honcut-mcp",
					"version": "1.0.0",
				},
			},
		})

	case "tools/list":
		tools := mcpServer.ListTools()
		json.NewEncoder(w).Encode(map[string]interface{}{
			"jsonrpc": "2.0",
			"id":      request.ID,
			"result": map[string]interface{}{
				"tools": tools,
			},
		})

	case "tools/call":
		result, err := mcpServer.HandleMCPRequest("tools/call", request.Params)
		if err != nil {
			json.NewEncoder(w).Encode(map[string]interface{}{
				"jsonrpc": "2.0",
				"id":      request.ID,
				"error":   map[string]interface{}{"code": -32603, "message": err.Error()},
			})
			return
		}
		json.NewEncoder(w).Encode(map[string]interface{}{
			"jsonrpc": "2.0",
			"id":      request.ID,
			"result":  result,
		})

	case "notifications/initialized":
		// Notification — no response body needed, but return 204
		w.WriteHeader(http.StatusNoContent)

	default:
		json.NewEncoder(w).Encode(map[string]interface{}{
			"jsonrpc": "2.0",
			"id":      request.ID,
			"error":   map[string]interface{}{"code": -32601, "message": fmt.Sprintf("Method not found: %s", request.Method)},
		})
	}
}



// listTransitions returns all transitions for a project
func listTransitions(w http.ResponseWriter, r *http.Request, store *Store, projectID string) {
	transitions, err := store.ListTransitions(projectID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(transitions)
}
