package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"log"
	"os"

	honcutserver "honcut-server"
)

func main() {
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

	// Create MCP server
	mcpServer := honcutserver.NewMCPServer(store)

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
	data, _ := json.Marshal(response)
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
	data, _ := json.Marshal(response)
	writer.Write(data)
	writer.WriteString("\n")
	writer.Flush()
}
