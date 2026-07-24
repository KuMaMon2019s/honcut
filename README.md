# ⚠️ ARCHIVED — 2026-07-24

Honcut 已归档。其所有功能已被 OpenChatCut (99 MCP tools) + Hermes Agent 替代。

迁移路径：Hermes 直连 OpenChatCut 的 MCP 端点
- 端点: http://localhost:5173/api/external-mcp/mcp
- 传输: SSE
- 工具: 99 个

架构对比：
| | Honcut | 替代 |
|---|:---:|---|
| REST API (1500行) | ❌ | OpenChatCut Vite 插件 |
| MCP 工具 (2300行) | ❌ | OpenChatCut 99 工具 |
| SQLite (1000行) | ❌ | OpenChatCut JSON 存储 |
| React UI (4000行) | ❌ | OpenChatCut 完整编辑器 |
| KB 嵌入 (300行) | ❌ | kb-mcp 独立运行 |

