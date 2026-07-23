// useUndo.ts — 通用 undo/redo 状态管理 hook
// 支持快照式撤销：每次 commit 保存完整状态，undo/redo 恢复快照

import { useState, useCallback, useRef } from "react";

export interface UndoState<T> {
  present: T;
  canUndo: boolean;
  canRedo: boolean;
  /** 提交新状态（清除 redo 栈） */
  commit: (next: T) => void;
  /** 撤销到上一个快照 */
  undo: () => void;
  /** 重做 */
  redo: () => void;
  /** 重置（清空历史） */
  reset: (initial: T) => void;
  /** 历史深度 */
  historyLength: number;
}

const MAX_HISTORY = 50;

export function useUndo<T>(initial: T): UndoState<T> {
  const [past, setPast] = useState<T[]>([]);
  const [present, setPresent] = useState<T>(initial);
  const [future, setFuture] = useState<T[]>([]);
  // 用于批量操作去抖：同一 batchKey 内的 commit 合并为一次
  const batchRef = useRef<{ key: string; snapshot: T } | null>(null);

  const commit = useCallback((next: T) => {
    setPresent(prev => {
      setPast(p => {
        const newPast = [...p, prev];
        return newPast.length > MAX_HISTORY ? newPast.slice(-MAX_HISTORY) : newPast;
      });
      return next;
    });
    setFuture([]);
  }, []);

  const undo = useCallback(() => {
    setPast(p => {
      if (p.length === 0) return p;
      const previous = p[p.length - 1];
      setPresent(current => {
        setFuture(f => [current, ...f]);
        return previous;
      });
      return p.slice(0, -1);
    });
  }, []);

  const redo = useCallback(() => {
    setFuture(f => {
      if (f.length === 0) return f;
      const next = f[0];
      setPresent(current => {
        setPast(p => [...p, current]);
        return next;
      });
      return f.slice(1);
    });
  }, []);

  const reset = useCallback((initial: T) => {
    setPast([]);
    setPresent(initial);
    setFuture([]);
    batchRef.current = null;
  }, []);

  return {
    present,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    commit,
    undo,
    redo,
    reset,
    historyLength: past.length,
  };
}
