// promises.ts — React 19 use() 的 Promise 缓存层
// use() 要求稳定的 Promise 引用：每次渲染创建新 Promise 会导致无限 re-suspend。
// 此模块按 key 缓存 Promise，mutation 后通过 invalidate() 刷新。

import { api } from "./client";

const cache = new Map<string, Promise<unknown>>();

function cached<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  if (!cache.has(key)) {
    // 失败时清除缓存，让下次 use() 重试
    const p = fetcher().catch(e => {
      cache.delete(key);
      throw e;
    });
    cache.set(key, p);
  }
  return cache.get(key) as Promise<T>;
}

/** 使指定前缀的缓存失效（mutation 后调用，触发 use() 重新 fetch） */
export function invalidate(keyPrefix: string): void {
  for (const k of cache.keys()) {
    if (k.startsWith(keyPrefix)) cache.delete(k);
  }
}

/** 清除全部缓存 */
export function invalidateAll(): void {
  cache.clear();
}

// ── 查询 Promise（供 use() 消费）──────────────────────────────────────

export const projectPromise = (id: string) =>
  cached(`project:${id}`, () => api.getProject(id));

export const clipsPromise = (projectId: string, version = 0) =>
  cached(`clips:${projectId}:v${version}`, () => api.listClips(projectId));

export const transitionsPromise = (projectId: string) =>
  cached(`transitions:${projectId}`, () => api.listTransitions(projectId));

export const assetsPromise = (projectId: string) =>
  cached(`assets:${projectId}`, () => api.listAssets(projectId));

export const timelinesPromise = (projectId: string) =>
  cached(`timelines:${projectId}`, () => api.listTimelines(projectId));

export const tracksPromise = (projectId: string) =>
  cached(`tracks:${projectId}`, () => api.listTracks(projectId));

export const projectsPromise = () =>
  cached("projects:all", () => api.listProjects());
