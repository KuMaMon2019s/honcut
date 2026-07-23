// client.ts — 类型化 API 客户端，覆盖后端全部端点
// 纯 fetch，零额外依赖。字段名与后端 snake_case 保持一致。

// ── 类型定义 ────────────────────────────────────────────────────────────

export interface Project {
  id: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
}

export interface Clip {
  id: string;
  project_id: string;
  asset_id: string;
  name: string;
  kind: string;
  src: string;
  track: string;
  start_frame: number;
  duration_frames: number;
  src_in_frame: number;
  props: string;
  created_at: string;
}

export interface Transition {
  id: string;
  project_id: string;
  from_item_id: string;
  to_item_id: string;
  type: string;
  duration_frames: number;
  created_at: string;
}

export interface Timeline {
  id: string;
  project_id: string;
  name: string;
  fps: number;
  width: number;
  height: number;
  ratio: string;
  hidden: boolean;
  created_at: string;
}

export interface Track {
  id: string;
  project_id: string;
  name: string;
  kind: string;
  order_index: number;
  hidden: boolean;
  created_at: string;
}

export interface DesignStyle {
  id: string;
  project_id: string;
  name: string;
  colors: string;
  fonts: string;
  created_at: string;
}

export interface Asset {
  id: string;
  project_id: string;
  name: string;
  kind: string;
  src: string;
  duration_frames: number;
  width?: number;
  height?: number;
  created_at: string;
}

export interface Template {
  id: string;
  name: string;
  description: string;
  category: string;
}

export interface RenderStatus {
  id: string;
  project_id: string;
  status: string;
  progress: number;
  output_path: string;
  error: string;
  created_at: string;
  started_at: string;
  completed_at: string;
}

export interface ProviderStatus {
  id: string;
  label: string;
  model: string;
  configured: boolean;
}

export interface UploadResult {
  asset_id: string;
  name: string;
  kind: string;
  src: string;
  size: number;
  project_id: string;
}

export interface StatusResponse {
  status: string;
  project_count: number;
  message: string;
}

export interface TemplateListResponse {
  categories?: string[];
  total?: number;
  category?: string;
  templates?: Template[];
  count?: number;
}

export interface TemplateSearchResponse {
  query: string;
  templates: Template[];
  count: number;
}

export interface SplitResult {
  success: boolean;
  original_id: string;
  split_id: string;
}

export interface DuplicateResult {
  success: boolean;
  original_id: string;
  duplicate_id: string;
  start_frame: number;
}

export interface ClearTimelineResult {
  success: boolean;
  deleted_count: number;
}

export interface MCPResponse {
  jsonrpc: string;
  id: unknown;
  result?: unknown;
  error?: { code: number; message: string };
}

// ── 请求体类型 ──────────────────────────────────────────────────────────

export interface CreateProjectBody {
  id: string;
  name: string;
  description?: string;
}

export interface UpdateProjectBody {
  name?: string;
  description?: string;
}

export interface CreateClipBody {
  id?: string;
  asset_id?: string;
  name: string;
  kind?: string;
  src?: string;
  track?: string;
  start_frame?: number;
  duration_frames?: number;
  src_in_frame?: number;
  props?: string;
}

export interface UpdateClipBody {
  name?: string;
  track?: string;
  start_frame?: number;
  duration_frames?: number;
  src_in_frame?: number;
}

export interface SplitClipBody {
  at_frame: number;
}

export interface TimingBody {
  start_frame?: number;
  duration_frames?: number;
  src_in_frame?: number;
  fade_in_seconds?: number;
  fade_out_seconds?: number;
}

export interface CreateTimelineBody {
  name: string;
  width?: number;
  height?: number;
  fps?: number;
}

export interface UpdateTimelineBody {
  name?: string;
  width?: number;
  height?: number;
}

export interface CreateTrackBody {
  name: string;
  kind?: string;
}

export interface UpdateTrackBody {
  name?: string;
  kind?: string;
}

export interface CreateDesignStyleBody {
  name: string;
  colors?: Record<string, unknown>;
  fonts?: Record<string, unknown>;
}

export interface UpdateDesignStyleBody {
  name?: string;
  colors?: Record<string, unknown>;
  fonts?: Record<string, unknown>;
}

// ── 工具函数 ────────────────────────────────────────────────────────────

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`API ${res.status}: ${text}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

function jsonBody(body: unknown): RequestInit {
  return {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

const enc = encodeURIComponent;

// ── API 客户端 ──────────────────────────────────────────────────────────

class HoncutClient {
  // ── Projects CRUD ──

  listProjects(): Promise<Project[]> {
    return request<Project[]>("/api/projects");
  }

  getProject(id: string): Promise<Project> {
    return request<Project>(`/api/projects/${enc(id)}`);
  }

  createProject(body: CreateProjectBody): Promise<Project> {
    return request<Project>("/api/projects", { method: "POST", ...jsonBody(body) });
  }

  updateProject(id: string, body: UpdateProjectBody): Promise<Project> {
    return request<Project>(`/api/projects/${enc(id)}`, { method: "PUT", ...jsonBody(body) });
  }

  deleteProject(id: string): Promise<void> {
    return request<void>(`/api/projects/${enc(id)}`, { method: "DELETE" });
  }

  // ── Clips CRUD ──

  listClips(projectId: string): Promise<Clip[]> {
    return request<Clip[]>(`/api/projects/${enc(projectId)}/clips`);
  }

  getClip(projectId: string, clipId: string): Promise<Clip> {
    return request<Clip>(`/api/projects/${enc(projectId)}/clips/${enc(clipId)}`);
  }

  createClip(projectId: string, body: CreateClipBody): Promise<Clip> {
    return request<Clip>(`/api/projects/${enc(projectId)}/clips`, { method: "POST", ...jsonBody(body) });
  }

  updateClip(projectId: string, clipId: string, body: UpdateClipBody): Promise<Clip> {
    return request<Clip>(`/api/projects/${enc(projectId)}/clips/${enc(clipId)}`, { method: "PUT", ...jsonBody(body) });
  }

  deleteClip(projectId: string, clipId: string): Promise<void> {
    return request<void>(`/api/projects/${enc(projectId)}/clips/${enc(clipId)}`, { method: "DELETE" });
  }

  // ── Clip 操作 ──

  splitClip(projectId: string, clipId: string, body: SplitClipBody): Promise<SplitResult> {
    return request<SplitResult>(`/api/projects/${enc(projectId)}/clips/${enc(clipId)}/split`, { method: "POST", ...jsonBody(body) });
  }

  duplicateClip(projectId: string, clipId: string): Promise<DuplicateResult> {
    return request<DuplicateResult>(`/api/projects/${enc(projectId)}/clips/${enc(clipId)}/duplicate`, { method: "POST" });
  }

  updateClipProps(projectId: string, clipId: string, props: Record<string, unknown>): Promise<Clip> {
    return request<Clip>(`/api/projects/${enc(projectId)}/clips/${enc(clipId)}/props`, { method: "PATCH", ...jsonBody(props) });
  }

  updateClipTiming(projectId: string, clipId: string, body: TimingBody): Promise<Clip> {
    return request<Clip>(`/api/projects/${enc(projectId)}/clips/${enc(clipId)}/timing`, { method: "PATCH", ...jsonBody(body) });
  }

  // ── Transitions ──

  listTransitions(projectId: string): Promise<Transition[]> {
    return request<Transition[]>(`/api/projects/${enc(projectId)}/transitions`);
  }

  // ── Timeline ──

  clearTimeline(projectId: string): Promise<ClearTimelineResult> {
    return request<ClearTimelineResult>(`/api/projects/${enc(projectId)}/timeline`, { method: "DELETE" });
  }

  listTimelines(projectId: string): Promise<Timeline[]> {
    return request<Timeline[]>(`/api/projects/${enc(projectId)}/timelines`);
  }

  createTimeline(projectId: string, body: CreateTimelineBody): Promise<Timeline> {
    return request<Timeline>(`/api/projects/${enc(projectId)}/timelines`, { method: "POST", ...jsonBody(body) });
  }

  updateTimeline(projectId: string, timelineId: string, body: UpdateTimelineBody): Promise<Timeline> {
    return request<Timeline>(`/api/projects/${enc(projectId)}/timelines/${enc(timelineId)}`, { method: "PUT", ...jsonBody(body) });
  }

  deleteTimeline(projectId: string, timelineId: string): Promise<void> {
    return request<void>(`/api/projects/${enc(projectId)}/timelines/${enc(timelineId)}`, { method: "DELETE" });
  }

  // ── Tracks ──

  listTracks(projectId: string): Promise<Track[]> {
    return request<Track[]>(`/api/projects/${enc(projectId)}/tracks`);
  }

  createTrack(projectId: string, body: CreateTrackBody): Promise<Track> {
    return request<Track>(`/api/projects/${enc(projectId)}/tracks`, { method: "POST", ...jsonBody(body) });
  }

  updateTrack(projectId: string, trackId: string, body: UpdateTrackBody): Promise<Track> {
    return request<Track>(`/api/projects/${enc(projectId)}/tracks/${enc(trackId)}`, { method: "PUT", ...jsonBody(body) });
  }

  deleteTrack(projectId: string, trackId: string): Promise<void> {
    return request<void>(`/api/projects/${enc(projectId)}/tracks/${enc(trackId)}`, { method: "DELETE" });
  }

  // ── Design Styles ──

  listDesignStyles(projectId: string): Promise<DesignStyle[]> {
    return request<DesignStyle[]>(`/api/projects/${enc(projectId)}/design-styles`);
  }

  createDesignStyle(projectId: string, body: CreateDesignStyleBody): Promise<DesignStyle> {
    return request<DesignStyle>(`/api/projects/${enc(projectId)}/design-styles`, { method: "POST", ...jsonBody(body) });
  }

  updateDesignStyle(projectId: string, styleId: string, body: UpdateDesignStyleBody): Promise<DesignStyle> {
    return request<DesignStyle>(`/api/projects/${enc(projectId)}/design-styles/${enc(styleId)}`, { method: "PUT", ...jsonBody(body) });
  }

  deleteDesignStyle(projectId: string, styleId: string): Promise<void> {
    return request<void>(`/api/projects/${enc(projectId)}/design-styles/${enc(styleId)}`, { method: "DELETE" });
  }

  // ── Assets ──

  listAssets(projectId: string): Promise<Asset[]> {
    return request<Asset[]>(`/api/projects/${enc(projectId)}/assets`);
  }

  deleteAsset(projectId: string, assetId: string): Promise<void> {
    return request<void>(`/api/projects/${enc(projectId)}/assets/${enc(assetId)}`, { method: "DELETE" });
  }

  renameAsset(projectId: string, assetId: string, body: { name: string }): Promise<Asset> {
    return request<Asset>(`/api/projects/${enc(projectId)}/assets/${enc(assetId)}`, { method: "PATCH", ...jsonBody(body) });
  }

  // ── Templates ──

  listTemplates(category?: string): Promise<TemplateListResponse> {
    const q = category ? `?category=${enc(category)}` : "";
    return request<TemplateListResponse>(`/api/templates${q}`);
  }

  searchTemplates(query: string): Promise<TemplateSearchResponse> {
    return request<TemplateSearchResponse>(`/api/templates/search?q=${enc(query)}`);
  }

  // ── Upload ──

  uploadMedia(projectId: string, file: File, name?: string, kind?: string): Promise<UploadResult> {
    const form = new FormData();
    form.append("file", file);
    if (name) form.append("name", name);
    if (kind) form.append("kind", kind);
    return request<UploadResult>(`/api/upload?project_id=${enc(projectId)}`, { method: "POST", body: form });
  }

  // ── Status & Config ──

  getStatus(): Promise<StatusResponse> {
    return request<StatusResponse>("/api/status");
  }

  getConfig(): Promise<{ providers: ProviderStatus[] }> {
    return request<{ providers: ProviderStatus[] }>("/api/config");
  }

  // ── Render ──

  startRender(jobId: string, projectId: string): Promise<RenderStatus> {
    return request<RenderStatus>(`/api/render/${enc(jobId)}`, {
      method: "POST",
      ...jsonBody({ project_id: projectId }),
    });
  }

  getRenderStatus(jobId: string): Promise<RenderStatus> {
    return request<RenderStatus>(`/api/render/${enc(jobId)}/status`);
  }

  cancelRender(jobId: string): Promise<void> {
    return request<void>(`/api/render/${enc(jobId)}/cancel`, { method: "POST" });
  }

  getRenderDownloadUrl(jobId: string): string {
    return `/api/render/${enc(jobId)}/download`;
  }

  // ── MCP ──

  mcpCall(toolName: string, args: Record<string, unknown>): Promise<MCPResponse> {
    return request<MCPResponse>("/api/mcp", {
      method: "POST",
      ...jsonBody({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: toolName, arguments: args },
      }),
    });
  }

  mcpListTools(): Promise<MCPResponse> {
    return request<MCPResponse>("/api/mcp", {
      method: "POST",
      ...jsonBody({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
  }
}

export const api = new HoncutClient();
