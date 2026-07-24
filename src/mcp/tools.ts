// src/mcp/tools.ts — 全量 MCP 工具注册表
// 38 个工具，12 个分类，与后端 server/mcp.go ListTools() 保持同步
// 本地只提供分类/图标/中文标签等展示元数据，schema 从后端实时获取

import { api } from "../api/client";

// ── 类型 ──

export interface ToolCategory {
  id: string;
  label: string;
  icon: string;
}

export interface ToolMeta {
  category: string;
  icon: string;
  label: string;          // 中文显示名
  needsProject?: boolean; // 需要 project_id 上下文
  needsClip?: boolean;    // 需要 item_id 上下文
  dangerous?: boolean;    // 危险操作（删除、清空等）
}

export interface ToolInfo {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  meta: ToolMeta;
}

// ── 分类定义（12 个）──

export const TOOL_CATEGORIES: ToolCategory[] = [
  { id: "project",    label: "项目",    icon: "📁" },
  { id: "clip",       label: "片段",    icon: "🎬" },
  { id: "transition", label: "转场",    icon: "🔗" },
  { id: "audio",      label: "音频",    icon: "🎵" },
  { id: "timeline",   label: "时间线",  icon: "📐" },
  { id: "media",      label: "素材",    icon: "📦" },
  { id: "design",     label: "设计",    icon: "🎨" },
  { id: "template",   label: "模板",    icon: "📝" },
  { id: "script",     label: "脚本",    icon: "📜" },
  { id: "render",     label: "渲染",    icon: "🎥" },
  { id: "generation", label: "AI 生成", icon: "🤖" },
  { id: "system",     label: "系统",    icon: "⚙️" },
];

// ── 工具元数据（38 个，与 mcp.go ListTools 一一对应）──

export const TOOL_META: Record<string, ToolMeta> = {
  // 📁 项目 (5)
  list_projects:     { category: "project", icon: "📋", label: "列出项目" },
  create_project:    { category: "project", icon: "➕", label: "创建项目" },
  read_project:      { category: "project", icon: "📖", label: "读取项目", needsProject: true },
  edit_project:      { category: "project", icon: "✏️", label: "编辑项目", needsProject: true },
  clear_timeline:    { category: "project", icon: "🧹", label: "清空时间线", needsProject: true, dangerous: true },

  // 🎬 片段 (9)
  add_clip:          { category: "clip", icon: "➕", label: "添加片段", needsProject: true },
  trim_clip:         { category: "clip", icon: "✂️", label: "裁剪片段", needsClip: true },
  move_clip:         { category: "clip", icon: "↔️", label: "移动片段", needsClip: true },
  split_item:        { category: "clip", icon: "✂️", label: "分割片段", needsClip: true },
  duplicate_item:    { category: "clip", icon: "📋", label: "复制片段", needsClip: true },
  remove_item:       { category: "clip", icon: "🗑️", label: "删除片段", needsClip: true, dangerous: true },
  move_item:         { category: "clip", icon: "🔀", label: "移动片段(新)", needsClip: true },
  update_item_props: { category: "clip", icon: "🔧", label: "更新属性", needsClip: true },
  set_item_timing:   { category: "clip", icon: "⏱️", label: "调整时间", needsClip: true },

  // 🔗 转场 (1)
  add_transition:    { category: "transition", icon: "🔗", label: "添加转场", needsProject: true },

  // 🎵 音频 (2)
  list_audio:        { category: "audio", icon: "📋", label: "列出音频" },
  add_audio:         { category: "audio", icon: "🎵", label: "添加音频", needsProject: true },

  // 📐 时间线 (4)
  read_timeline:     { category: "timeline", icon: "📖", label: "读取时间线", needsProject: true },
  manage_timelines:  { category: "timeline", icon: "📐", label: "管理时间线", needsProject: true },
  edit_track:        { category: "timeline", icon: "🎚️", label: "编辑轨道", needsProject: true },
  set_aspect_ratio:  { category: "timeline", icon: "📐", label: "设置画幅", needsProject: true },

  // 📦 素材 (3)
  upload_media:      { category: "media", icon: "⬆️", label: "上传素材", needsProject: true },
  manage_media_pool: { category: "media", icon: "📦", label: "管理素材库", needsProject: true },
  browse_library:    { category: "media", icon: "📚", label: "浏览特效库" },

  // 🎨 设计 (1)
  manage_design_style: { category: "design", icon: "🎨", label: "管理设计风格", needsProject: true },

  // 📝 模板 (4)
  list_templates:       { category: "template", icon: "📋", label: "列出模板" },
  search_templates:     { category: "template", icon: "🔍", label: "搜索模板" },
  add_motion_graphic:   { category: "template", icon: "🎬", label: "添加动态图形", needsProject: true },
  submit_motion_graphic:{ category: "template", icon: "🤖", label: "AI 动态图形", needsProject: true },

  // 📜 脚本 (2)
  read_script:       { category: "script", icon: "📖", label: "读取脚本", needsProject: true },
  apply_script:      { category: "script", icon: "📝", label: "应用脚本", needsProject: true },

  // 🎥 渲染 (2)
  submit_render_job: { category: "render", icon: "🎥", label: "提交渲染", needsProject: true },
  track_export:      { category: "render", icon: "📊", label: "跟踪导出" },

  // 🤖 AI 生成 (3)
  generate_video:    { category: "generation", icon: "🎬", label: "AI 生成视频" },
  generate_image:    { category: "generation", icon: "🖼️", label: "AI 生成图片" },
  kb_search:         { category: "generation", icon: "🔍", label: "知识库搜索" },

  // ⚙️ 系统 (2)
  openchatcut_status: { category: "system", icon: "💚", label: "服务状态" },
  ToolSearch:         { category: "system", icon: "🔍", label: "搜索工具" },
};

// ── 工具加载（后端为 schema 唯一源）──

let cachedTools: ToolInfo[] | null = null;

/** 从后端获取全量工具列表，合并本地展示元数据 */
export async function fetchTools(forceRefresh = false): Promise<ToolInfo[]> {
  if (cachedTools && !forceRefresh) return cachedTools;

  const res = await api.mcpListTools();
  const backendTools = (res.result ?? []) as Array<{
    name: string;
    description: string;
    inputSchema?: Record<string, unknown>;
  }>;

  const tools: ToolInfo[] = backendTools.map(t => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema ?? { type: "object", properties: {} },
    meta: TOOL_META[t.name] ?? {
      category: "system",
      icon: "🔧",
      label: t.name,
    },
  }));

  cachedTools = tools;
  return tools;
}

/** 按分类分组（保持 TOOL_CATEGORIES 顺序） */
export function groupByCategory(tools: ToolInfo[]): Array<[string, ToolInfo[]]> {
  const map = new Map<string, ToolInfo[]>();
  for (const tool of tools) {
    const cat = tool.meta.category;
    const list = map.get(cat) ?? [];
    list.push(tool);
    map.set(cat, list);
  }
  // 按 TOOL_CATEGORIES 顺序输出，未定义的分类排最后
  const order = TOOL_CATEGORIES.map(c => c.id);
  return [...map.entries()].sort((a, b) => {
    const ia = order.indexOf(a[0]);
    const ib = order.indexOf(b[0]);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });
}

/** 模糊搜索工具（名称 / 中文标签 / 描述） */
export function searchTools(query: string, tools: ToolInfo[]): ToolInfo[] {
  if (!query.trim()) return tools;
  const q = query.toLowerCase();
  return tools.filter(t =>
    t.name.toLowerCase().includes(q) ||
    t.meta.label.toLowerCase().includes(q) ||
    t.description.toLowerCase().includes(q)
  );
}

/** 获取分类信息 */
export function getCategoryInfo(categoryId: string): ToolCategory {
  return TOOL_CATEGORIES.find(c => c.id === categoryId)
    ?? { id: categoryId, label: categoryId, icon: "🔧" };
}

/** 需要片段上下文的工具（右键菜单用） */
export function clipToolNames(): string[] {
  return Object.entries(TOOL_META)
    .filter(([, m]) => m.needsClip)
    .map(([name]) => name);
}
