package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"

	honcutserver "honcut-server"
	"honcut-server/internal/render"

	"github.com/joho/godotenv"
)

func main() {
	// Load .env file (if exists) — must run before any os.Getenv calls
	godotenv.Load()

	// Load config
	homeDir, err := os.UserHomeDir()
	if err != nil {
		log.Fatal("Failed to get home directory:", err)
	}

	dbPath := os.Getenv("HONCUT_DB_PATH")
	if dbPath == "" {
		dbPath = homeDir + "/.honcut/honcut.db"
	}

	// Initialize store
	store, err := honcutserver.NewStore(dbPath)
	if err != nil {
		log.Fatal("Failed to initialize store:", err)
	}
	defer store.Close()

	// Initialize render pipeline (needed for render-related MCP tools)
	outputDir := filepath.Join(filepath.Dir(dbPath), "renders")
	storeReader := &honcutserver.StoreTimelineReader{Store: store}
	pipeline := &render.Pipeline{
		Store:     storeReader,
		OutputDir: outputDir,
		FPS:       render.FPS,
	}
	renderManager := render.NewProgressManager(pipeline)

	// Create MCP server
	mcpServer := honcutserver.NewMCPServer(store, renderManager, outputDir)

	// Stdio transport
	scanner := bufio.NewScanner(os.Stdin)
	writer := bufio.NewWriter(os.Stdout)

	log.Println("honcut-mcp-server started (stdio transport)")

	for scanner.Scan() {
		line := scanner.Text()
		if line == "" {
			continue
		}

		// Parse JSON-RPC request
		var request map[string]interface{}
		if err := json.Unmarshal([]byte(line), &request); err != nil {
			sendError(writer, nil, -32700, "Parse error")
			continue
		}

		method, _ := request["method"].(string)
		params, _ := request["params"].(map[string]interface{})
		id := request["id"]

		// Handle MCP methods
		switch method {
		case "initialize":
			// Register this editor session
			editorInfo := map[string]interface{}{
				"name":      "unknown",
				"connected": true,
			}
			if params != nil {
				if ci, ok := params["clientInfo"].(map[string]interface{}); ok {
					if n, ok := ci["name"].(string); ok {
						editorInfo["name"] = n
					}
					if v, ok := ci["version"].(string); ok {
						editorInfo["version"] = v
					}
				}
			}
			mcpServer.RegisterEditor(editorInfo)

			sendResponse(writer, id, map[string]interface{}{
				"protocolVersion": "2024-11-05",
				"capabilities": map[string]interface{}{
					"tools": map[string]interface{}{},
				},
				"serverInfo": map[string]interface{}{
					"name":    "honcut-mcp",
					"version": "1.0.0",
				},
			})

		case "tools/list":
			tools := mcpServer.ListTools()
			sendResponse(writer, id, map[string]interface{}{
				"tools": tools,
			})

		case "tools/call":
			result, err := mcpServer.HandleMCPRequest("tools/call", params)
			if err != nil {
				sendError(writer, id, -32603, err.Error())
			} else {
				sendResponse(writer, id, result)
			}

		case "notifications/initialized":
			// No response needed for notifications

		default:
			sendError(writer, id, -32601, fmt.Sprintf("Method not found: %s", method))
		}
	}

	if err := scanner.Err(); err != nil {
		log.Fatal("Scanner error:", err)
	}
}

func sendResponse(writer *bufio.Writer, id interface{}, result interface{}) {
	response := map[string]interface{}{
		"jsonrpc": "2.0",
		"id":      id,
		"result":  result,
	}
	data, err := json.Marshal(response)
	if err != nil {
		log.Printf("sendResponse: marshal error: %v", err)
		return
	}
	writer.Write(data)
	writer.WriteString("\n")
	writer.Flush()
}

func sendError(writer *bufio.Writer, id interface{}, code int, message string) {
	response := map[string]interface{}{
		"jsonrpc": "2.0",
		"id":      id,
		"error": map[string]interface{}{
			"code":    code,
			"message": message,
		},
	}
	data, err := json.Marshal(response)
	if err != nil {
		log.Printf("sendError: marshal error: %v", err)
		return
	}
	writer.Write(data)
	writer.WriteString("\n")
	writer.Flush()
}
