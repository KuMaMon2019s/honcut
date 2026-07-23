# honcut

AI 视频剪辑工作站 — 你的 AI 视频编辑副驾驶。

---

## 是什么

Honcut 是一个**可被 AI 智能体驱动的视频剪辑引擎**。它提供：

- **35 个 MCP 工具**：从时间线编辑、转场、音频、动效模板到渲染导出，AI 可以完整操作视频项目
- **REST API**：15+ 端点覆盖项目 CRUD、片段管理、时间线操作、媒体上传
- **SQLite 持久化**：项目、时间线、片段、转场、媒体资产全部本地存储，零依赖
- **ffmpeg 渲染管道**：支持单片段复制、多片段拼接、xfade 转场、进度跟踪
- **React 前端**：时间线可视化查看器，支持 V1/A1/A2 多轨道

## 快速开始

```bash
# 编译（一键生成 honcut-server + honcut-mcp 二进制）
make build

# 启动后端
make run-server
# → http://localhost:8080

# 健康检查
curl http://localhost:8080/health
# → {"status":"ok"}

# 创建项目
curl -X POST http://localhost:8080/api/projects \
  -H 'Content-Type: application/json' \
  -d '{"id":"my-video","name":"My First Video"}'

# 添加片段到时间线
curl -X POST http://localhost:8080/api/projects/my-video/clips \
  -H 'Content-Type: application/json' \
  -d '{"name":"Intro","track":"V1","start_frame":0,"duration_frames":90}'

# 列出时间线
curl http://localhost:8080/api/projects/my-video/clips
```

### Makefile 命令

| 命令 | 说明 |
|------|------|
| `make build` | 编译 honcut-server + honcut-mcp |
| `make test` | 运行全部 Go 测试 |
| `make run-server` | 编译并启动 HTTP 服务 |
| `make verify-mcp` | 编译 MCP 并列出所有注册工具 |
| `make health` | 检查服务器健康状态 |
| `make clean` | 清理编译产物 |

## MCP 使用指南

Honcut 的 MCP Server 采用 **stdio 传输**——AI 客户端通过标准输入/输出与 `honcut-mcp` 二进制通信，无需 HTTP 端口。

### 编译 MCP 二进制

```bash
make build-mcp
# → server/honcut-mcp
```

### 客户端配置

#### Claude Desktop / Claude Code

在 `claude_desktop_config.json`（或 `.claude/settings.json`）中添加：

```json
{
  "mcpServers": {
    "honcut": {
      "command": "/path/to/honcut/server/honcut-mcp",
      "env": {
        "HONCUT_DB_PATH": "~/.honcut/honcut.db"
      }
    }
  }
}
```

#### Hermes Agent

在 `config.yaml` 中添加：

```yaml
mcp_servers:
  honcut:
    command: /path/to/honcut/server/honcut-mcp
    env:
      HONCUT_DB_PATH: ~/.honcut/honcut.db
```

#### 通用 MCP 客户端（stdio）

任何支持 MCP stdio 传输的客户端，只需将 `honcut-mcp` 配置为子进程：

```json
{
  "command": "/path/to/honcut/server/honcut-mcp",
  "args": [],
  "env": {}
}
```

### 命令行测试

```bash
# 列出所有工具
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' \
  | ./server/honcut-mcp 2>/dev/null | python3 -m json.tool

# 调用工具：读取时间线
echo '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"read_timeline","arguments":{"project_id":"my-video"}}}' \
  | ./server/honcut-mcp 2>/dev/null | python3 -m json.tool

# 调用工具：搜索工具
echo '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"ToolSearch","arguments":{"query":"clip"}}}' \
  | ./server/honcut-mcp 2>/dev/null | python3 -m json.tool

# 快捷验证（make 目标）
make verify-mcp
```

### 工作原理

```
AI 客户端 (Claude/Hermes/etc.)
    │
    │  stdin: JSON-RPC 2.0 请求
    ▼
honcut-mcp (stdio 二进制)
    │
    │  SQLite 读写
    ▼
~/.honcut/honcut.db
    │
    │  REST API 共享同一数据库
    ▼
honcut-server (HTTP :8080)
```

- `honcut-mcp` 和 `honcut-server` 共享同一个 SQLite 数据库（WAL 模式支持并发读写）
- MCP 工具直接操作 Store 层，与 REST API 操作同一份数据
- 无需启动 HTTP 服务器即可使用 MCP 工具

## 技术栈

| 层 | 技术 |
|---|------|
| 后端 | Go 1.26 · net/http (Go 1.22 路由) · SQLite (WAL) |
| 前端 | React 19 · Vite · TypeScript |
| 渲染 | ffmpeg · Docker |
| 存储 | MinIO · Qdrant (向量搜索) |
| 协议 | MCP (Model Context Protocol) · REST |

## MCP 工具清单 (35)

### 项目管理
`list_projects` `create_project` `read_project`

### 时间线编辑
`add_clip` `trim_clip` `move_clip` `split_item` `duplicate_item` `remove_item` `move_item` `set_item_timing` `update_item_props` `clear_timeline`

### 转场与轨道
`add_transition` `manage_timelines` `edit_track` `set_aspect_ratio`

### 媒体管理
`upload_media` `manage_media_pool` `browse_library`

### 音频
`list_audio` `add_audio`

### 动效模板
`list_templates` `search_templates` `add_motion_graphic` `submit_motion_graphic`

### 脚本与设计
`read_script` `apply_script` `manage_design_style`

### 渲染与状态
`submit_render_job` `track_export` `openchatcut_status` `ToolSearch`

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `HONCUT_DB_PATH` | `~/.honcut/honcut.db` | SQLite 数据库路径 |
| `HONCUT_PORT` | `8080` | HTTP 服务端口 |

## 路线图

- [x] Phase 1: 后端骨架（MCP + REST）
- [x] Phase 2: ffmpeg 渲染管道
- [ ] Phase 3: 前后端集成 + WebSocket 实时通知
- [ ] AI 素材理解（场景检测、语音识别、自动字幕）
- [ ] AI 生成集成（文生视频、音乐生成、动效生成）
