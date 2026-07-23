package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"

	honcutserver "honcut-server"
	"honcut-server/internal/render"

	_ "modernc.org/sqlite"
)

// Config holds application configuration
type Config struct {
	DBPath string
	Port   string
}

// loadConfig loads configuration from environment variables
func loadConfig() Config {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		log.Fatal("Failed to get user home directory:", err)
	}

	// SQLite 隔离存储到 ~/.honcut/honcut.db
	dbPath := os.Getenv("HONCUT_DB_PATH")
	if dbPath == "" {
		dbPath = filepath.Join(homeDir, ".honcut", "honcut.db")
	}

	port := os.Getenv("HONCUT_PORT")
	if port == "" {
		port = "8080"
	}

	return Config{
		DBPath: dbPath,
		Port:   port,
	}
}

// healthHandler returns 200 OK
func healthHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{
		"status": "ok",
	})
}

func main() {
	config := loadConfig()

	log.Printf("Initializing database at: %s", config.DBPath)
	store, err := honcutserver.NewStore(config.DBPath)
	if err != nil {
		log.Fatal("Failed to initialize database:", err)
	}
	defer store.Close()

	log.Printf("Database initialized successfully (WAL mode + foreign keys)")

	// Initialize render pipeline
	outputDir := filepath.Join(filepath.Dir(config.DBPath), "renders")
	storeReader := &honcutserver.StoreTimelineReader{Store: store}
	pipeline := &render.Pipeline{
		Store:     storeReader,
		OutputDir: outputDir,
		FPS:       render.FPS,
	}

	// Initialize render progress manager
	renderManager := render.NewProgressManager(pipeline)

	// HTTP 路由 — 组合 health + REST API + upload + render
	mux := http.NewServeMux()
	mux.HandleFunc("/health", healthHandler)

	// Mount REST API handler (projects CRUD + upload)
	apiHandler := honcutserver.APIHandler(store)
	mux.Handle("/api/", apiHandler)

	// Mount render API handler
	renderHandler := render.RenderHandler(renderManager, outputDir)
	mux.Handle("/api/render/", renderHandler)

	// 启动服务器
	addr := fmt.Sprintf(":%s", config.Port)
	log.Printf("Starting honcut-server on %s", addr)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatal("Server failed:", err)
	}
}
