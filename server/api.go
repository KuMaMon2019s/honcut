package honcutserver

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
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
	})

	// Transitions
	mux.HandleFunc("GET /api/projects/{id}/transitions", func(w http.ResponseWriter, r *http.Request) {
		listTransitions(w, r, store, r.PathValue("id"))
	})
	mux.HandleFunc("POST /api/projects/{id}/transitions", func(w http.ResponseWriter, r *http.Request) {
		createTransition(w, r, store, r.PathValue("id"))
	})
	mux.HandleFunc("PATCH /api/projects/{id}/transitions/{transition_id}", func(w http.ResponseWriter, r *http.Request) {
		updateTransition(w, r, store, r.PathValue("id"), r.PathValue("transition_id"))
	})
	mux.HandleFunc("DELETE /api/projects/{id}/transitions/{transition_id}", func(w http.ResponseWriter, r *http.Request) {
		deleteTransition(w, r, store, r.PathValue("id"), r.PathValue("transition_id"))
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

	mux.HandleFunc("GET /api/projects/{id}/markers", func(w http.ResponseWriter, r *http.Request) {
		listMarkers(w, r, store, r.PathValue("id"))
	})
	mux.HandleFunc("POST /api/projects/{id}/markers", func(w http.ResponseWriter, r *http.Request) {
		createMarker(w, r, store, r.PathValue("id"))
	})
	mux.HandleFunc("PATCH /api/projects/{id}/markers/{marker_id}", func(w http.ResponseWriter, r *http.Request) {
		updateMarker(w, r, store, r.PathValue("id"), r.PathValue("marker_id"))
	})
	mux.HandleFunc("DELETE /api/projects/{id}/markers/{marker_id}", func(w http.ResponseWriter, r *http.Request) {
		deleteMarker(w, r, store, r.PathValue("id"), r.PathValue("marker_id"))
	})

	// Captions
	mux.HandleFunc("GET /api/projects/{id}/captions", func(w http.ResponseWriter, r *http.Request) {
		listCaptions(w, r, store, r.PathValue("id"))
	})
	mux.HandleFunc("POST /api/projects/{id}/captions", func(w http.ResponseWriter, r *http.Request) {
		createCaption(w, r, store, r.PathValue("id"))
	})
	mux.HandleFunc("PATCH /api/projects/{id}/captions/{caption_id}", func(w http.ResponseWriter, r *http.Request) {
		updateCaption(w, r, store, r.PathValue("id"), r.PathValue("caption_id"))
	})
	mux.HandleFunc("DELETE /api/projects/{id}/captions/{caption_id}", func(w http.ResponseWriter, r *http.Request) {
		deleteCaption(w, r, store, r.PathValue("id"), r.PathValue("caption_id"))
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

	// MCP HTTP endpoint
	mux.HandleFunc("POST /api/mcp", func(w http.ResponseWriter, r *http.Request) {
		handleMCPHTTP(w, r, mcpServer)
	})

	// P7: Scene detection + auto-split
	mux.HandleFunc("POST /api/projects/{id}/detect-scenes", func(w http.ResponseWriter, r *http.Request) {
		detectScenes(w, r, store, r.PathValue("id"))
	})
	mux.HandleFunc("POST /api/projects/{id}/auto-split", func(w http.ResponseWriter, r *http.Request) {
		autoSplit(w, r, store, r.PathValue("id"))
	})

	// P7: Transcription (ASR)
	mux.HandleFunc("POST /api/projects/{id}/transcribe", func(w http.ResponseWriter, r *http.Request) {
		transcribe(w, r, store, r.PathValue("id"))
	})

	// P7: Mobile upload page (standalone HTML)
	mux.HandleFunc("GET /mobile", func(w http.ResponseWriter, r *http.Request) {
		mobileUploadPage(w, r)
	})

	// Static file server for uploaded media
	homeDir, _ := os.UserHomeDir()
	uploadDir := filepath.Join(homeDir, ".honcut", "uploads")
	mux.Handle("GET /uploads/", http.StripPrefix("/uploads/", http.FileServer(http.Dir(uploadDir))))

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
		// Preserve file extension
		if ext := filepath.Ext(fileName); ext != "" && !strings.HasSuffix(safeName, ext) {
			safeName += ext
		}
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
		// Preserve file extension
		if ext := filepath.Ext(fileName); ext != "" && !strings.HasSuffix(safeName, ext) {
			safeName += ext
		}
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
	// Backfill empty src from linked asset
	for _, c := range clips {
		if c.Src == "" && c.AssetID != "" {
			if asset, err := store.GetAsset(c.AssetID); err == nil && asset != nil {
				c.Src = asset.Src
			}
		}
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
	// Backfill empty src from linked asset
	if clip.Src == "" && clip.AssetID != "" {
		if asset, err := store.GetAsset(clip.AssetID); err == nil && asset != nil {
			clip.Src = asset.Src
		}
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

// ── Marker handlers ─────────────────────────────────────────────────────

type markerCreateRequest struct {
	Frame int    `json:"frame"`
	Label string `json:"label"`
	Color string `json:"color"`
}

type markerUpdateRequest struct {
	Frame *int    `json:"frame"`
	Label *string `json:"label"`
	Color *string `json:"color"`
}

func listMarkers(w http.ResponseWriter, r *http.Request, store *Store, projectID string) {
	markers, err := store.ListMarkers(projectID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(markers)
}

func createMarker(w http.ResponseWriter, r *http.Request, store *Store, projectID string) {
	var req markerCreateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	if req.Color == "" {
		req.Color = "#facc15"
	}

	m := &Marker{
		ID:        uuid.New().String(),
		ProjectID: projectID,
		Frame:     req.Frame,
		Label:     req.Label,
		Color:     req.Color,
	}

	if err := store.CreateMarker(m); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(m)
}

func updateMarker(w http.ResponseWriter, r *http.Request, store *Store, projectID, markerID string) {
	var req markerUpdateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}

	if err := store.UpdateMarker(markerID, req.Frame, req.Label, req.Color); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	m, err := store.GetMarker(markerID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(m)
}

func deleteMarker(w http.ResponseWriter, r *http.Request, store *Store, projectID, markerID string) {
	deleted, err := store.DeleteMarker(markerID)
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

// ── Captions ────────────────────────────────────────────────────────────

type captionCreateRequest struct {
	StartFrame     int    `json:"start_frame"`
	DurationFrames int    `json:"duration_frames"`
	Text           string `json:"text"`
	Style          string `json:"style"`
}

type captionUpdateRequest struct {
	StartFrame     *int    `json:"start_frame"`
	DurationFrames *int    `json:"duration_frames"`
	Text           *string `json:"text"`
	Style          *string `json:"style"`
}

func listCaptions(w http.ResponseWriter, r *http.Request, store *Store, projectID string) {
	captions, err := store.ListCaptions(projectID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(captions)
}

func createCaption(w http.ResponseWriter, r *http.Request, store *Store, projectID string) {
	var req captionCreateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	if req.DurationFrames <= 0 {
		req.DurationFrames = 48
	}
	if req.Style == "" {
		req.Style = "{}"
	}

	c := &CaptionCue{
		ID:             uuid.New().String(),
		ProjectID:      projectID,
		StartFrame:     req.StartFrame,
		DurationFrames: req.DurationFrames,
		Text:           req.Text,
		Style:          req.Style,
	}

	if err := store.CreateCaption(c); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(c)
}

func updateCaption(w http.ResponseWriter, r *http.Request, store *Store, projectID, captionID string) {
	var req captionUpdateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}

	if err := store.UpdateCaption(captionID, req.StartFrame, req.DurationFrames, req.Text, req.Style); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	c, err := store.GetCaption(captionID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(c)
}

func deleteCaption(w http.ResponseWriter, r *http.Request, store *Store, projectID, captionID string) {
	deleted, err := store.DeleteCaption(captionID)
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

type transitionCreateRequest struct {
	FromItemID     string `json:"from_item_id"`
	ToItemID       string `json:"to_item_id"`
	Type           string `json:"type"`
	DurationFrames int    `json:"duration_frames"`
}

// createTransition creates a transition between two timeline items
func createTransition(w http.ResponseWriter, r *http.Request, store *Store, projectID string) {
	var req transitionCreateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	if req.FromItemID == "" || req.ToItemID == "" {
		http.Error(w, "from_item_id and to_item_id required", http.StatusBadRequest)
		return
	}
	if req.Type == "" {
		req.Type = "dissolve"
	}
	if req.DurationFrames == 0 {
		req.DurationFrames = 24
	}

	trans := &Transition{
		ID:             uuid.New().String(),
		ProjectID:      projectID,
		FromItemID:     req.FromItemID,
		ToItemID:       req.ToItemID,
		Type:           req.Type,
		DurationFrames: req.DurationFrames,
	}

	if err := store.CreateTransition(trans); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(trans)
}

// updateTransition updates type and/or duration_frames of a transition
func updateTransition(w http.ResponseWriter, r *http.Request, store *Store, projectID, transitionID string) {
	existing, err := store.GetTransition(transitionID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if existing == nil || existing.ProjectID != projectID {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}

	var req struct {
		Type           string `json:"type"`
		DurationFrames int    `json:"duration_frames"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	if req.Type != "" {
		existing.Type = req.Type
	}
	if req.DurationFrames > 0 {
		existing.DurationFrames = req.DurationFrames
	}

	if err := store.UpdateTransition(existing); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(existing)
}

// deleteTransition removes a transition
func deleteTransition(w http.ResponseWriter, r *http.Request, store *Store, projectID, transitionID string) {
	existing, err := store.GetTransition(transitionID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if existing == nil || existing.ProjectID != projectID {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}

	if err := store.DeleteTransition(transitionID); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// ── P7: Scene Detection + Auto-Split + Transcription + Mobile ──────────

// resolveAssetPath converts an asset's src (e.g. "/uploads/xxx.mp4") to a filesystem path.
func resolveAssetPath(src string) string {
	homeDir, _ := os.UserHomeDir()
	uploadDir := filepath.Join(homeDir, ".honcut", "uploads")
	return filepath.Join(uploadDir, strings.TrimPrefix(src, "/uploads/"))
}

// getProjectFPS returns the fps from the project's first timeline, defaulting to 30.
func getProjectFPS(store *Store, projectID string) int {
	timelines, err := store.ListTimelines(projectID)
	if err == nil && len(timelines) > 0 && timelines[0].FPS > 0 {
		return timelines[0].FPS
	}
	return 30
}

type detectScenesRequest struct {
	AssetID        string  `json:"asset_id"`
	Method         string  `json:"method"`
	Threshold      float64 `json:"threshold"`
	MinSceneLength float64 `json:"min_scene_length"`
}

type sceneResult struct {
	Index        int     `json:"index"`
	StartSeconds float64 `json:"start_seconds"`
	EndSeconds   float64 `json:"end_seconds"`
	StartFrame   int     `json:"start_frame"`
	EndFrame     int     `json:"end_frame"`
}

func detectScenes(w http.ResponseWriter, r *http.Request, store *Store, projectID string) {
	var req detectScenesRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	if req.AssetID == "" {
		http.Error(w, "asset_id required", http.StatusBadRequest)
		return
	}
	if req.Threshold <= 0 {
		req.Threshold = 0.3
	}
	if req.MinSceneLength <= 0 {
		req.MinSceneLength = 1.0
	}

	asset, err := store.GetAsset(req.AssetID)
	if err != nil || asset == nil {
		http.Error(w, "asset not found", http.StatusNotFound)
		return
	}

	filePath := resolveAssetPath(asset.Src)
	if _, err := os.Stat(filePath); err != nil {
		http.Error(w, "media file not found: "+filePath, http.StatusNotFound)
		return
	}

	fps := getProjectFPS(store, projectID)

	// Run ffmpeg scene detection filter
	thresholdStr := strconv.FormatFloat(req.Threshold, 'f', -1, 64)
	filter := fmt.Sprintf("select='gt(scene,%s)',showinfo", thresholdStr)
	cmd := exec.Command("ffmpeg", "-i", filePath, "-vf", filter, "-f", "null", "-")
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	_ = cmd.Run() // ffmpeg exits non-zero with -f null, ignore

	// Parse pts_time from stderr
	re := regexp.MustCompile(`pts_time:(\d+\.?\d*)`)
	matches := re.FindAllStringSubmatch(stderr.String(), -1)

	var cutPoints []float64
	for _, m := range matches {
		t, err := strconv.ParseFloat(m[1], 64)
		if err != nil {
			continue
		}
		cutPoints = append(cutPoints, t)
	}

	// Filter by min_scene_length
	var filtered []float64
	last := -req.MinSceneLength
	for _, t := range cutPoints {
		if t-last >= req.MinSceneLength {
			filtered = append(filtered, t)
			last = t
		}
	}

	// Get video duration via ffprobe
	duration := 0.0
	probeCmd := exec.Command("ffprobe", "-v", "error", "-show_entries", "format=duration",
		"-of", "default=noprint_wrappers=1:nokey=1", filePath)
	var probeOut bytes.Buffer
	probeCmd.Stdout = &probeOut
	if err := probeCmd.Run(); err == nil {
		if d, err := strconv.ParseFloat(strings.TrimSpace(probeOut.String()), 64); err == nil {
			duration = d
		}
	}

	// Build scenes
	var scenes []sceneResult
	prev := 0.0
	idx := 0
	for _, cut := range filtered {
		if cut <= prev {
			continue
		}
		scenes = append(scenes, sceneResult{
			Index:        idx,
			StartSeconds: prev,
			EndSeconds:   cut,
			StartFrame:   int(prev * float64(fps)),
			EndFrame:     int(cut * float64(fps)),
		})
		prev = cut
		idx++
	}
	// Last scene: from last cut to end
	if duration > prev {
		scenes = append(scenes, sceneResult{
			Index:        idx,
			StartSeconds: prev,
			EndSeconds:   duration,
			StartFrame:   int(prev * float64(fps)),
			EndFrame:     int(duration * float64(fps)),
		})
	}

	// If no cuts detected, return the whole video as one scene
	if len(scenes) == 0 && duration > 0 {
		scenes = append(scenes, sceneResult{
			Index:        0,
			StartSeconds: 0,
			EndSeconds:   duration,
			StartFrame:   0,
			EndFrame:     int(duration * float64(fps)),
		})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"scenes": scenes,
		"fps":    fps,
	})
}

type autoSplitRequest struct {
	AssetID string        `json:"asset_id"`
	Scenes  []sceneResult `json:"scenes"`
}

func autoSplit(w http.ResponseWriter, r *http.Request, store *Store, projectID string) {
	var req autoSplitRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	if req.AssetID == "" {
		http.Error(w, "asset_id required", http.StatusBadRequest)
		return
	}

	asset, err := store.GetAsset(req.AssetID)
	if err != nil || asset == nil {
		http.Error(w, "asset not found", http.StatusNotFound)
		return
	}

	fps := getProjectFPS(store, projectID)
	scenes := req.Scenes

	// If no scenes provided, run detection first
	if len(scenes) == 0 {
		filePath := resolveAssetPath(asset.Src)
		if _, err := os.Stat(filePath); err != nil {
			http.Error(w, "media file not found", http.StatusNotFound)
			return
		}
		cmd := exec.Command("ffmpeg", "-i", filePath, "-vf", "select='gt(scene,0.3)',showinfo", "-f", "null", "-")
		var stderr bytes.Buffer
		cmd.Stderr = &stderr
		_ = cmd.Run()

		re := regexp.MustCompile(`pts_time:(\d+\.?\d*)`)
		matches := re.FindAllStringSubmatch(stderr.String(), -1)
		var cutPoints []float64
		for _, m := range matches {
			if t, err := strconv.ParseFloat(m[1], 64); err == nil {
				cutPoints = append(cutPoints, t)
			}
		}

		probeCmd := exec.Command("ffprobe", "-v", "error", "-show_entries", "format=duration",
			"-of", "default=noprint_wrappers=1:nokey=1", filePath)
		var probeOut bytes.Buffer
		probeCmd.Stdout = &probeOut
		duration := 0.0
		if err := probeCmd.Run(); err == nil {
			if d, err := strconv.ParseFloat(strings.TrimSpace(probeOut.String()), 64); err == nil {
				duration = d
			}
		}

		prev := 0.0
		idx := 0
		for _, cut := range cutPoints {
			if cut <= prev {
				continue
			}
			scenes = append(scenes, sceneResult{
				Index: idx, StartSeconds: prev, EndSeconds: cut,
				StartFrame: int(prev * float64(fps)), EndFrame: int(cut * float64(fps)),
			})
			prev = cut
			idx++
		}
		if duration > prev {
			scenes = append(scenes, sceneResult{
				Index: idx, StartSeconds: prev, EndSeconds: duration,
				StartFrame: int(prev * float64(fps)), EndFrame: int(duration * float64(fps)),
			})
		}
		if len(scenes) == 0 && duration > 0 {
			scenes = append(scenes, sceneResult{
				Index: 0, StartSeconds: 0, EndSeconds: duration,
				StartFrame: 0, EndFrame: int(duration * float64(fps)),
			})
		}
	}

	// Find end of V1 track to append clips
	existingClips, _ := store.ListTimelineItemsByTrack(projectID, "V1")
	endFrame := 0
	for _, c := range existingClips {
		if c.StartFrame+c.DurationFrames > endFrame {
			endFrame = c.StartFrame + c.DurationFrames
		}
	}

	// Create clips for each scene
	var created []*TimelineItem
	currentFrame := endFrame
	for i, scene := range scenes {
		durationFrames := scene.EndFrame - scene.StartFrame
		if durationFrames <= 0 {
			continue
		}
		clip := &TimelineItem{
			ID:             uuid.New().String(),
			ProjectID:      projectID,
			AssetID:        req.AssetID,
			Name:           fmt.Sprintf("%s (scene %d)", asset.Name, i+1),
			Kind:           asset.Kind,
			Src:            asset.Src,
			Track:          "V1",
			StartFrame:     currentFrame,
			DurationFrames: durationFrames,
			SrcInFrame:     scene.StartFrame,
			Props:          "{}",
		}
		if err := store.CreateTimelineItem(clip); err != nil {
			http.Error(w, "failed to create clip: "+err.Error(), http.StatusInternalServerError)
			return
		}
		created = append(created, clip)
		currentFrame += durationFrames
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"clips": created,
		"count": len(created),
	})
}

// ── P7: Transcription ──────────────────────────────────────────────────

type transcribeRequest struct {
	AssetID  string `json:"asset_id"`
	Language string `json:"language"`
}

type transcriptionSegment struct {
	Start      float64 `json:"start"`
	End        float64 `json:"end"`
	Text       string  `json:"text"`
	StartFrame int     `json:"start_frame"`
	EndFrame   int     `json:"end_frame"`
}

func transcribe(w http.ResponseWriter, r *http.Request, store *Store, projectID string) {
	var req transcribeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	if req.AssetID == "" {
		http.Error(w, "asset_id required", http.StatusBadRequest)
		return
	}
	if req.Language == "" {
		req.Language = "auto"
	}

	asset, err := store.GetAsset(req.AssetID)
	if err != nil || asset == nil {
		http.Error(w, "asset not found", http.StatusNotFound)
		return
	}

	fps := getProjectFPS(store, projectID)
	arkKey := os.Getenv("ARK_API_KEY")

	// Mock mode: return sample data when ARK_API_KEY is not set
	if arkKey == "" {
		segments := []transcriptionSegment{
			{Start: 0.0, End: 2.5, Text: "欢迎使用 Honcut 视频编辑器", StartFrame: 0, EndFrame: int(2.5 * float64(fps))},
			{Start: 2.5, End: 5.0, Text: "这是一段示例转录文本", StartFrame: int(2.5 * float64(fps)), EndFrame: int(5.0 * float64(fps))},
			{Start: 5.0, End: 8.0, Text: "支持自动语音识别功能", StartFrame: int(5.0 * float64(fps)), EndFrame: int(8.0 * float64(fps))},
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"segments": segments,
			"language": "zh",
			"mock":     true,
		})
		return
	}

	// Real ASR: extract audio with ffmpeg, then call Volcano Engine ASR API
	filePath := resolveAssetPath(asset.Src)
	if _, err := os.Stat(filePath); err != nil {
		http.Error(w, "media file not found", http.StatusNotFound)
		return
	}

	// Extract audio to temp WAV (16kHz mono PCM)
	tmpWav := filepath.Join(os.TempDir(), fmt.Sprintf("honcut_asr_%s.wav", uuid.New().String()[:8]))
	defer os.Remove(tmpWav)

	extractCmd := exec.Command("ffmpeg", "-y", "-i", filePath, "-vn", "-acodec", "pcm_s16le", "-ar", "16000", "-ac", "1", tmpWav)
	var extractErr bytes.Buffer
	extractCmd.Stderr = &extractErr
	if err := extractCmd.Run(); err != nil {
		http.Error(w, "audio extraction failed: "+extractErr.String(), http.StatusInternalServerError)
		return
	}

	audioData, err := os.ReadFile(tmpWav)
	if err != nil {
		http.Error(w, "failed to read extracted audio", http.StatusInternalServerError)
		return
	}

	// Call Volcano Engine ASR API (doubao-seed-asr-2.0)
	baseURL := os.Getenv("ARK_BASE_URL")
	if baseURL == "" {
		baseURL = "https://ark.cn-beijing.volces.com/api/plan/v3"
	}

	asrPayload := map[string]interface{}{
		"model": "doubao-seed-asr-2.0",
		"audio": base64.StdEncoding.EncodeToString(audioData),
		"format": "wav",
		"sample_rate": 16000,
	}
	if req.Language != "auto" {
		asrPayload["language"] = req.Language
	}

	payloadBytes, _ := json.Marshal(asrPayload)
	asrReq, err := http.NewRequest("POST", baseURL+"/audio/transcriptions", bytes.NewReader(payloadBytes))
	if err != nil {
		http.Error(w, "failed to create ASR request", http.StatusInternalServerError)
		return
	}
	asrReq.Header.Set("Content-Type", "application/json")
	asrReq.Header.Set("Authorization", "Bearer "+arkKey)

	client := &http.Client{}
	resp, err := client.Do(asrReq)
	if err != nil {
		http.Error(w, "ASR API call failed: "+err.Error(), http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		http.Error(w, fmt.Sprintf("ASR API error %d: %s", resp.StatusCode, string(respBody)), http.StatusBadGateway)
		return
	}

	// Parse ASR response — expect {"text": "...", "segments": [...]}
	var asrResult struct {
		Text     string `json:"text"`
		Language string `json:"language"`
		Segments []struct {
			Start float64 `json:"start"`
			End   float64 `json:"end"`
			Text  string  `json:"text"`
		} `json:"segments"`
	}
	if err := json.Unmarshal(respBody, &asrResult); err != nil {
		// Fallback: treat entire response as plain text
		var plainResult struct {
			Text string `json:"text"`
		}
		if err2 := json.Unmarshal(respBody, &plainResult); err2 == nil && plainResult.Text != "" {
			asrResult.Text = plainResult.Text
		} else {
			http.Error(w, "failed to parse ASR response", http.StatusBadGateway)
			return
		}
	}

	lang := asrResult.Language
	if lang == "" {
		lang = "zh"
	}

	var segments []transcriptionSegment
	if len(asrResult.Segments) > 0 {
		for _, s := range asrResult.Segments {
			segments = append(segments, transcriptionSegment{
				Start:      s.Start,
				End:        s.End,
				Text:       s.Text,
				StartFrame: int(s.Start * float64(fps)),
				EndFrame:   int(s.End * float64(fps)),
			})
		}
	} else if asrResult.Text != "" {
		// Single segment for the whole text
		segments = append(segments, transcriptionSegment{
			Start: 0, End: 0, Text: asrResult.Text,
			StartFrame: 0, EndFrame: 0,
		})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"segments": segments,
		"language": lang,
	})
}

// ── P7: Mobile Upload Page ─────────────────────────────────────────────

func mobileUploadPage(w http.ResponseWriter, r *http.Request) {
	projectID := r.URL.Query().Get("project")
	if projectID == "" {
		projectID = "default"
	}

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	fmt.Fprint(w, `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
<title>Honcut 手机上传</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#111;color:#eee;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;min-height:100vh;display:flex;flex-direction:column;align-items:center;padding:20px}
h1{font-size:22px;margin:16px 0 4px;color:#f59e0b}
.sub{font-size:13px;color:#888;margin-bottom:24px}
.drop-zone{width:100%;max-width:400px;min-height:200px;border:2px dashed #444;border-radius:16px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;cursor:pointer;transition:all .2s;background:#1a1a1a;margin-bottom:16px}
.drop-zone.dragover{border-color:#f59e0b;background:#221a00}
.drop-zone .icon{font-size:48px}
.drop-zone .text{font-size:14px;color:#aaa;text-align:center;padding:0 16px}
.btn{width:100%;max-width:400px;padding:16px;border:none;border-radius:12px;font-size:16px;font-weight:600;cursor:pointer;margin-bottom:10px;transition:all .15s}
.btn-primary{background:#f59e0b;color:#111}
.btn-primary:active{background:#d97706}
.btn-secondary{background:#2a2a2a;color:#eee;border:1px solid #444}
.btn-secondary:active{background:#333}
.progress-wrap{width:100%;max-width:400px;margin:16px 0;display:none}
.progress-bar{width:100%;height:8px;background:#333;border-radius:4px;overflow:hidden}
.progress-fill{height:100%;background:#f59e0b;border-radius:4px;transition:width .3s;width:0}
.progress-text{font-size:12px;color:#888;margin-top:6px;text-align:center}
.status{width:100%;max-width:400px;padding:12px;border-radius:8px;font-size:14px;text-align:center;margin-top:8px;display:none}
.status.ok{display:block;background:#0a2a0a;color:#4ade80;border:1px solid #166534}
.status.err{display:block;background:#2a0a0a;color:#f87171;border:1px solid #991b1b}
.file-list{width:100%;max-width:400px;margin-top:12px}
.file-item{display:flex;align-items:center;gap:8px;padding:8px 12px;background:#1e1e1e;border-radius:8px;margin-bottom:6px;font-size:13px}
.file-item .name{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.file-item .size{color:#888;font-size:11px;flex-shrink:0}
input[type=file]{display:none}
</style>
</head>
<body>
<h1>📱 Honcut 上传</h1>
<div class="sub">项目: `+projectID+`</div>

<div class="drop-zone" id="dropZone">
  <div class="icon">📁</div>
  <div class="text">拖拽文件到此处<br>或点击选择文件</div>
</div>

<button class="btn btn-primary" id="pickBtn">📷 选择文件 / 拍照录像</button>
<button class="btn btn-secondary" id="cameraBtn">🎥 直接拍照/录像</button>

<input type="file" id="fileInput" accept="video/*,image/*,audio/*" multiple>
<input type="file" id="cameraInput" accept="video/*,image/*" capture="environment">

<div class="progress-wrap" id="progressWrap">
  <div class="progress-bar"><div class="progress-fill" id="progressFill"></div></div>
  <div class="progress-text" id="progressText">上传中… 0%</div>
</div>

<div class="status" id="statusMsg"></div>
<div class="file-list" id="fileList"></div>

<script>
var projectId = `+"`"+projectID+"`"+`;
var dropZone = document.getElementById('dropZone');
var fileInput = document.getElementById('fileInput');
var cameraInput = document.getElementById('cameraInput');
var progressWrap = document.getElementById('progressWrap');
var progressFill = document.getElementById('progressFill');
var progressText = document.getElementById('progressText');
var statusMsg = document.getElementById('statusMsg');
var fileList = document.getElementById('fileList');

document.getElementById('pickBtn').onclick = function(){ fileInput.click(); };
document.getElementById('cameraBtn').onclick = function(){ cameraInput.click(); };
dropZone.onclick = function(){ fileInput.click(); };

dropZone.ondragover = function(e){ e.preventDefault(); dropZone.classList.add('dragover'); };
dropZone.ondragleave = function(){ dropZone.classList.remove('dragover'); };
dropZone.ondrop = function(e){ e.preventDefault(); dropZone.classList.remove('dragover'); if(e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files); };

fileInput.onchange = function(){ if(this.files.length) uploadFiles(this.files); this.value=''; };
cameraInput.onchange = function(){ if(this.files.length) uploadFiles(this.files); this.value=''; };

function fmtSize(b){ if(b>1048576) return (b/1048576).toFixed(1)+'MB'; if(b>1024) return (b/1024).toFixed(1)+'KB'; return b+'B'; }

function uploadFiles(files){
  statusMsg.className='status'; statusMsg.style.display='none';
  for(var i=0;i<files.length;i++){
    (function(file){
      var item = document.createElement('div');
      item.className='file-item';
      item.innerHTML='<span>📄</span><span class="name">'+file.name+'</span><span class="size">'+fmtSize(file.size)+'</span>';
      fileList.appendChild(item);
      uploadOne(file, item);
    })(files[i]);
  }
}

function uploadOne(file, itemEl){
  var kind = 'video';
  if(file.type.indexOf('image')===0) kind='image';
  else if(file.type.indexOf('audio')===0) kind='audio';

  var form = new FormData();
  form.append('file', file);
  form.append('name', file.name);
  form.append('kind', kind);

  var xhr = new XMLHttpRequest();
  progressWrap.style.display='block';
  progressFill.style.width='0%';
  progressText.textContent='上传中… 0%';

  xhr.upload.onprogress = function(e){
    if(e.lengthComputable){
      var pct = Math.round(e.loaded/e.total*100);
      progressFill.style.width=pct+'%';
      progressText.textContent='上传中… '+pct+'%';
    }
  };
  xhr.onload = function(){
    progressWrap.style.display='none';
    if(xhr.status>=200 && xhr.status<300){
      statusMsg.className='status ok';
      statusMsg.textContent='✅ '+file.name+' 上传成功';
      statusMsg.style.display='block';
      itemEl.innerHTML='<span>✅</span><span class="name">'+file.name+'</span><span class="size">'+fmtSize(file.size)+'</span>';
    } else {
      statusMsg.className='status err';
      statusMsg.textContent='❌ 上传失败: '+xhr.statusText;
      statusMsg.style.display='block';
      itemEl.innerHTML='<span>❌</span><span class="name">'+file.name+'</span><span class="size">'+fmtSize(file.size)+'</span>';
    }
  };
  xhr.onerror = function(){
    progressWrap.style.display='none';
    statusMsg.className='status err';
    statusMsg.textContent='❌ 网络错误，上传失败';
    statusMsg.style.display='block';
  };
  xhr.open('POST', '/api/upload?project_id='+encodeURIComponent(projectId));
  xhr.send(form);
}
</script>
</body>
</html>`)
}
