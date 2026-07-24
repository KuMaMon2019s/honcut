package render

import (
	"encoding/json"
	"net/http"
	"os"
	"strings"
)

// RenderHandler returns an http.Handler for render endpoints
func RenderHandler(pm *ProgressManager, outputDir string) http.Handler {
	mux := http.NewServeMux()

	// Handle /api/render/:id and sub-routes
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/api/render/")
		parts := strings.Split(path, "/")

		if len(parts) == 0 || parts[0] == "" {
			http.Error(w, "missing job id", http.StatusBadRequest)
			return
		}

		jobID := parts[0]

		// Handle sub-routes
		if len(parts) > 1 {
			switch parts[1] {
			case "status":
				if r.Method != http.MethodGet {
					http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
					return
				}
				getStatus(w, r, pm, jobID)
				return
			case "cancel":
				if r.Method != http.MethodPost {
					http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
					return
				}
				cancelRender(w, r, pm, jobID)
				return
			case "download":
				if r.Method != http.MethodGet {
					http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
					return
				}
				downloadRender(w, r, pm, jobID)
				return
			}
		}

		// Default: start render
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		startRender(w, r, pm, jobID, outputDir)
	})

	return mux
}

// startRender starts a new render job
func startRender(w http.ResponseWriter, r *http.Request, pm *ProgressManager, jobID, outputDir string) {
	// Parse request body for project_id and optional render settings
	var req struct {
		ProjectID string         `json:"project_id"`
		Settings  RenderSettings `json:"settings"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}

	if req.ProjectID == "" {
		http.Error(w, "project_id required", http.StatusBadRequest)
		return
	}

	// Create job with settings (Normalize fills defaults for zero values)
	job := pm.CreateJob(jobID, req.ProjectID, req.Settings)

	// Start render
	if err := pm.StartRender(jobID, outputDir); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"id":         job.ID,
		"project_id": job.ProjectID,
		"status":     job.Status,
		"message":    "Render started",
	})
}

// getStatus returns the current status of a render job
func getStatus(w http.ResponseWriter, r *http.Request, pm *ProgressManager, jobID string) {
	job, ok := pm.GetJob(jobID)
	if !ok {
		http.Error(w, "job not found", http.StatusNotFound)
		return
	}

	job.mu.RLock()
	defer job.mu.RUnlock()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"id":           job.ID,
		"project_id":   job.ProjectID,
		"status":       job.Status,
		"progress":     job.Progress,
		"output_path":  job.OutputPath,
		"error":        job.Error,
		"created_at":   job.CreatedAt,
		"started_at":   job.StartedAt,
		"completed_at": job.CompletedAt,
	})
}

// cancelRender cancels a running render job
func cancelRender(w http.ResponseWriter, r *http.Request, pm *ProgressManager, jobID string) {
	if err := pm.CancelJob(jobID); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"id":      jobID,
		"status":  "cancelled",
		"message": "Render cancelled",
	})
}

// downloadRender serves the rendered output file
func downloadRender(w http.ResponseWriter, r *http.Request, pm *ProgressManager, jobID string) {
	job, ok := pm.GetJob(jobID)
	if !ok {
		http.Error(w, "job not found", http.StatusNotFound)
		return
	}

	job.mu.RLock()
	defer job.mu.RUnlock()

	if job.Status != StatusCompleted {
		http.Error(w, "render not completed yet", http.StatusBadRequest)
		return
	}

	if job.OutputPath == "" {
		http.Error(w, "output path not available", http.StatusInternalServerError)
		return
	}

	// Check if file exists
	if _, err := os.Stat(job.OutputPath); os.IsNotExist(err) {
		http.Error(w, "output file not found", http.StatusNotFound)
		return
	}

	// Serve the file
	w.Header().Set("Content-Type", "video/mp4")
	w.Header().Set("Content-Disposition", "attachment; filename="+jobID+".mp4")
	http.ServeFile(w, r, job.OutputPath)
}
