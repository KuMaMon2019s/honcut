# Honcut — AI 视频剪辑工作站
# Makefile: 编译、测试、运行一键搞定

.PHONY: all build build-mcp build-server test clean run-server verify-mcp

GO      := go
SERVER_DIR := server
BIN_DIR := $(SERVER_DIR)

all: build

## 编译 ─────────────────────────────────────────────

build: build-server build-mcp
	@echo "✅ 编译完成: $(BIN_DIR)/honcut-server, $(BIN_DIR)/honcut-mcp"

build-server:
	cd $(SERVER_DIR) && $(GO) build -o honcut-server ./cmd/honcut-server

build-mcp:
	cd $(SERVER_DIR) && $(GO) build -o honcut-mcp ./cmd/honcut-mcp

## 测试 ─────────────────────────────────────────────

test:
	cd $(SERVER_DIR) && $(GO) test ./... -count=1

test-verbose:
	cd $(SERVER_DIR) && $(GO) test ./... -count=1 -v

## 运行 ─────────────────────────────────────────────

run-server: build-server
	cd $(SERVER_DIR) && ./honcut-server

## 验证 ─────────────────────────────────────────────

# 快速验证 MCP 二进制：列出所有工具
verify-mcp: build-mcp
	@echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' \
		| ./$(BIN_DIR)/honcut-mcp 2>/dev/null \
		| python3 -c "import sys,json; tools=json.load(sys.stdin)['result']['tools']; print(f'✅ {len(tools)} MCP tools registered'); [print(f'  - {t[\"name\"]}') for t in tools]"

# 健康检查（需要服务器运行中）
health:
	@curl -s http://localhost:8080/health | python3 -m json.tool

## 清理 ─────────────────────────────────────────────

clean:
	rm -f $(BIN_DIR)/honcut-server $(BIN_DIR)/honcut-mcp
	@echo "🧹 已清理二进制文件"
