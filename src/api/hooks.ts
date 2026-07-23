// hooks.ts — React hooks，为每个 API 方法提供对应的 hook
// 纯 useState/useEffect/useCallback/useRef，零额外依赖

import { useState, useEffect, useCallback, useRef } from "react";
import {
  api,
  type Project,
  type Clip,
  type Transition,
  type Timeline,
  type Track,
  type DesignStyle,
  type Asset,
  type Template,
  type RenderStatus,
  type ProviderStatus,
  type UploadResult,
  type StatusResponse,
  type TemplateListResponse,
  type TemplateSearchResponse,
  type SplitResult,
  type DuplicateResult,
  type ClearTimelineResult,
  type CreateProjectBody,
  type UpdateProjectBody,
  type CreateClipBody,
  type UpdateClipBody,
  type SplitClipBody,
  type TimingBody,
  type CreateTimelineBody,
  type UpdateTimelineBody,
  type CreateTrackBody,
  type UpdateTrackBody,
  type CreateDesignStyleBody,
  type UpdateDesignStyleBody,
} from "./client";

// ── 通用 fetch hook ─────────────────────────────────────────────────────

interface FetchState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

function useFetch<T>(fetcher: () => Promise<T>, deps: unknown[]): FetchState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const reload = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetcher()
      .then(d => { if (!cancelled) { setData(d); setLoading(false); } })
      .catch(e => { if (!cancelled) { setError(e instanceof Error ? e.message : String(e)); setLoading(false); } });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  return { data, loading, error, reload };
}

// ── 查询 hooks ──────────────────────────────────────────────────────────

export function useProjects(): FetchState<Project[]> {
  return useFetch(() => api.listProjects(), []);
}

export function useProject(id: string): FetchState<Project> {
  return useFetch(() => api.getProject(id), [id]);
}

export function useClips(projectId: string): FetchState<Clip[]> {
  return useFetch(() => api.listClips(projectId), [projectId]);
}

export function useClip(projectId: string, clipId: string): FetchState<Clip> {
  return useFetch(() => api.getClip(projectId, clipId), [projectId, clipId]);
}

export function useTransitions(projectId: string): FetchState<Transition[]> {
  return useFetch(() => api.listTransitions(projectId), [projectId]);
}

export function useTimelines(projectId: string): FetchState<Timeline[]> {
  return useFetch(() => api.listTimelines(projectId), [projectId]);
}

export function useTracks(projectId: string): FetchState<Track[]> {
  return useFetch(() => api.listTracks(projectId), [projectId]);
}

export function useDesignStyles(projectId: string): FetchState<DesignStyle[]> {
  return useFetch(() => api.listDesignStyles(projectId), [projectId]);
}

export function useAssets(projectId: string): FetchState<Asset[]> {
  return useFetch(() => api.listAssets(projectId), [projectId]);
}

export function useTemplates(category?: string): FetchState<TemplateListResponse> {
  return useFetch(() => api.listTemplates(category), [category]);
}

export function useTemplateSearch(query: string): FetchState<TemplateSearchResponse> {
  return useFetch(
    () => (query.trim() ? api.searchTemplates(query) : Promise.resolve({ query, templates: [], count: 0 })),
    [query],
  );
}

export function useConfig(): FetchState<{ providers: ProviderStatus[] }> {
  return useFetch(() => api.getConfig(), []);
}

export function useStatus(): FetchState<StatusResponse> {
  return useFetch(() => api.getStatus(), []);
}

// ── 渲染状态轮询 hook ───────────────────────────────────────────────────

export function useRenderStatus(jobId: string, active: boolean): FetchState<RenderStatus> & { polling: boolean } {
  const [data, setData] = useState<RenderStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const reload = useCallback(() => {
    if (!jobId) return;
    setLoading(true);
    api.getRenderStatus(jobId)
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e instanceof Error ? e.message : String(e)); setLoading(false); });
  }, [jobId]);

  useEffect(() => {
    if (!active || !jobId) {
      setPolling(false);
      return;
    }
    setPolling(true);
    reload();
    intervalRef.current = setInterval(reload, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setPolling(false);
    };
  }, [active, jobId, reload]);

  // 完成/错误/取消时停止轮询
  useEffect(() => {
    if (data && (data.status === "completed" || data.status === "failed" || data.status === "cancelled")) {
      setPolling(false);
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
  }, [data]);

  return { data, loading, error, reload, polling };
}

// ── 操作 hooks（mutation）────────────────────────────────────────────────

export function useProjectActions() {
  const create = useCallback((body: CreateProjectBody) => api.createProject(body), []);
  const update = useCallback((id: string, body: UpdateProjectBody) => api.updateProject(id, body), []);
  const remove = useCallback((id: string) => api.deleteProject(id), []);
  return { create, update, remove };
}

export function useClipActions(projectId: string) {
  const create = useCallback((body: CreateClipBody) => api.createClip(projectId, body), [projectId]);
  const update = useCallback((clipId: string, body: UpdateClipBody) => api.updateClip(projectId, clipId, body), [projectId]);
  const remove = useCallback((clipId: string) => api.deleteClip(projectId, clipId), [projectId]);
  const split = useCallback((clipId: string, body: SplitClipBody) => api.splitClip(projectId, clipId, body), [projectId]);
  const duplicate = useCallback((clipId: string) => api.duplicateClip(projectId, clipId), [projectId]);
  const updateProps = useCallback((clipId: string, props: Record<string, unknown>) => api.updateClipProps(projectId, clipId, props), [projectId]);
  const updateTiming = useCallback((clipId: string, body: TimingBody) => api.updateClipTiming(projectId, clipId, body), [projectId]);
  return { create, update, remove, split, duplicate, updateProps, updateTiming };
}

export function useTransitionActions(projectId: string) {
  const create = useCallback((body: { from_item_id: string; to_item_id: string; type?: string; duration_frames?: number }) => api.createTransition(projectId, body), [projectId]);
  const update = useCallback((transitionId: string, body: { type?: string; duration_frames?: number }) => api.updateTransition(projectId, transitionId, body), [projectId]);
  const remove = useCallback((transitionId: string) => api.deleteTransition(projectId, transitionId), [projectId]);
  return { create, update, remove };
}

export function useTimelineActions(projectId: string) {
  const create = useCallback((body: CreateTimelineBody) => api.createTimeline(projectId, body), [projectId]);
  const update = useCallback((timelineId: string, body: UpdateTimelineBody) => api.updateTimeline(projectId, timelineId, body), [projectId]);
  const remove = useCallback((timelineId: string) => api.deleteTimeline(projectId, timelineId), [projectId]);
  const clear = useCallback(() => api.clearTimeline(projectId), [projectId]);
  return { create, update, remove, clear };
}

export function useTrackActions(projectId: string) {
  const create = useCallback((body: CreateTrackBody) => api.createTrack(projectId, body), [projectId]);
  const update = useCallback((trackId: string, body: UpdateTrackBody) => api.updateTrack(projectId, trackId, body), [projectId]);
  const remove = useCallback((trackId: string) => api.deleteTrack(projectId, trackId), [projectId]);
  return { create, update, remove };
}

export function useDesignStyleActions(projectId: string) {
  const create = useCallback((body: CreateDesignStyleBody) => api.createDesignStyle(projectId, body), [projectId]);
  const update = useCallback((styleId: string, body: UpdateDesignStyleBody) => api.updateDesignStyle(projectId, styleId, body), [projectId]);
  const remove = useCallback((styleId: string) => api.deleteDesignStyle(projectId, styleId), [projectId]);
  return { create, update, remove };
}

export function useAssetActions(projectId: string) {
  const remove = useCallback((assetId: string) => api.deleteAsset(projectId, assetId), [projectId]);
  const rename = useCallback((assetId: string, name: string) => api.renameAsset(projectId, assetId, { name }), [projectId]);
  return { remove, rename };
}

export function useUpload(projectId: string) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const upload = useCallback(async (file: File, name?: string, kind?: string): Promise<UploadResult> => {
    setUploading(true);
    setProgress(0);
    try {
      const result = await api.uploadMedia(projectId, file, name, kind);
      setProgress(100);
      return result;
    } finally {
      setUploading(false);
    }
  }, [projectId]);

  return { upload, uploading, progress };
}

export function useRender(projectId: string) {
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<RenderStatus | null>(null);
  const [downloading, setDownloading] = useState(false);

  const start = useCallback(async (): Promise<string> => {
    const id = `render-${projectId}-${Date.now()}`;
    setJobId(id);
    const result = await api.startRender(id, projectId);
    setStatus(result);
    return id;
  }, [projectId]);

  const cancel = useCallback(async () => {
    if (!jobId) return;
    await api.cancelRender(jobId);
  }, [jobId]);

  const downloadUrl = jobId ? api.getRenderDownloadUrl(jobId) : null;

  return { start, cancel, jobId, status, setStatus, downloading, setDownloading, downloadUrl };
}
