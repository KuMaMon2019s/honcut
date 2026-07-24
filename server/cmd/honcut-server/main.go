package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"path/filepath"

	honcutserver "honcut-server"
	honcutconfig "honcut-server/internal/config"
	"honcut-server/internal/render"

	"github.com/joho/godotenv"
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

// getLANIP returns the first non-loopback IPv4 address.
func getLANIP() string {
	addrs, err := net.InterfaceAddrs()
	if err != nil {
		return ""
	}
	for _, addr := range addrs {
		if ipNet, ok := addr.(*net.IPNet); ok && !ipNet.IP.IsLoopback() {
			if ip4 := ipNet.IP.To4(); ip4 != nil {
				return ip4.String()
			}
		}
	}
	return ""
}

// healthHandler returns 200 OK with LAN URL for mobile access
func healthHandler(w http.ResponseWriter, r *http.Request, port string) {
	lanIP := getLANIP()
	lanURL := ""
	if lanIP != "" {
		lanURL = fmt.Sprintf("http://%s:%s", lanIP, port)
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{
		"status":  "ok",
		"lan_url": lanURL,
	})
}

func main() {
	// Load .env file (if exists)
	godotenv.Load()

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

	// Initialize model configuration (keystore)
	keystore := honcutconfig.NewKeyStore()
	log.Printf("Model config loaded: %d providers, %d env keys configured",
		len(honcutconfig.DefaultProviders()), countConfiguredKeys(keystore))

	// HTTP 路由 — 组合 health + REST API + upload + render + config
	mux := http.NewServeMux()
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		healthHandler(w, r, config.Port)
	})
	mux.HandleFunc("/api/config", func(w http.ResponseWriter, r *http.Request) {
		configHandler(w, r, keystore)
	})

	// Mount REST API handler (projects CRUD + upload + MCP)
	apiHandler := honcutserver.APIHandler(store, renderManager, outputDir)
	mux.Handle("/api/", apiHandler)

	// P7: Mobile upload page (standalone HTML, not under /api/)
	mux.HandleFunc("GET /mobile", func(w http.ResponseWriter, r *http.Request) {
		// Delegate to the API handler's mobile page by rewriting path
		r.URL.Path = "/mobile"
		apiHandler.ServeHTTP(w, r)
	})

	// Mount render API handler
	renderHandler := render.RenderHandler(renderManager, outputDir)
	mux.Handle("/api/render/", renderHandler)

	// Serve uploaded media files (videos, audio, images)
	uploadDir := filepath.Join(filepath.Dir(config.DBPath), "uploads")
	os.MkdirAll(uploadDir, 0755)
	mux.Handle("/uploads/", http.StripPrefix("/uploads/", http.FileServer(http.Dir(uploadDir))))

	// 启动服务器
	addr := fmt.Sprintf(":%s", config.Port)
	log.Printf("Starting honcut-server on %s", addr)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatal("Server failed:", err)
	}
}

// countConfiguredKeys returns whether the Ark API key is set
func countConfiguredKeys(ks *honcutconfig.KeyStore) int {
	if ks.IsConfigured(honcutconfig.EnvArkAPIKey) {
		return 1
	}
	return 0
}

// configHandler exposes non-secret model configuration (like OpenChatCut's keyStatus)
func configHandler(w http.ResponseWriter, r *http.Request, ks *honcutconfig.KeyStore) {
	providers := honcutconfig.DefaultProviders()
	providerStatus := make([]map[string]interface{}, 0, len(providers))
	for _, p := range providers {
		resolved := ks.ResolveProvider(p.ID)
		providerStatus = append(providerStatus, map[string]interface{}{
			"id":         p.ID,
			"label":      p.Label,
			"model":      resolved.Model,
			"configured": resolved.APIKey != "",
		})
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"providers": providerStatus,
	})
}
