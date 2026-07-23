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
# 启动后端 (Go)
cd server && go run ./cmd/honcut-server
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
