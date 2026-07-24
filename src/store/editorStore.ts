// editorStore.ts — 命令模式编辑器状态存储
// useReducer 管理 clips + undoStack/redoStack。
// 每次编辑走 execute(command)：先应用 API 操作，再拉取最新 clips 并 dispatch。
// undo/redo 分别执行命令的逆向/正向操作（服务端为唯一数据源，保证状态一致）。

import { useReducer, useCallback, useRef } from "react";
import { api, type Clip } from "../api/client";

// ── Command 类型 ────────────────────────────────────────────────────────

interface ClipTiming {
  startFrame: number;
  durationFrames: number;
  srcInFrame: number;
}

export type Command =
  | { type: "split"; clipId: string; atFrame: number; splitId: string; originalDuration: number }
  | { type: "duplicate"; clipId: string; duplicateId: string }
  | { type: "delete"; clip: Clip }
  | { type: "move"; clipId: string; from: { startFrame: number; track: string }; to: { startFrame: number; track: string } }
  | { type: "addClip"; clip: Clip }
  | { type: "addTransition"; transitionId: string; fromItemId: string; toItemId: string; transitionType: string; durationFrames: number }
  | { type: "trim"; clipId: string; before: ClipTiming; after: ClipTiming };

// ── State & Reducer ─────────────────────────────────────────────────────

export interface EditorState {
  clips: Clip[];
  undoStack: Command[];
  redoStack: Command[];
}

type EditorAction =
  | { type: "sync"; clips: Clip[] }
  | { type: "execute"; command: Command; clips: Clip[] }
  | { type: "undo"; command: Command; clips: Clip[] }
  | { type: "redo"; command: Command; clips: Clip[] };

const MAX_HISTORY = 50;

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case "sync":
      return { ...state, clips: action.clips };
    case "execute":
      return {
        clips: action.clips,
        undoStack: [...state.undoStack, action.command].slice(-MAX_HISTORY),
        redoStack: [],
      };
    case "undo":
      return {
        clips: action.clips,
        undoStack: state.undoStack.slice(0, -1),
        redoStack: [action.command, ...state.redoStack].slice(0, MAX_HISTORY),
      };
    case "redo":
      return {
        clips: action.clips,
        undoStack: [...state.undoStack, action.command].slice(-MAX_HISTORY),
        redoStack: state.redoStack.slice(1),
      };
  }
}

// ── Hook ────────────────────────────────────────────────────────────────

export interface EditorStore {
  state: EditorState;
  canUndo: boolean;
  canRedo: boolean;
  /** 外部数据变化同步（初始加载 / Inspector 编辑 / 导入），不影响 undo 栈 */
  sync: (clips: Clip[]) => void;
  /** 执行命令 → push undoStack、清空 redoStack。返回最终命令（含服务端生成的 ID），失败抛错 */
  execute: (draft: Command) => Promise<Command | null>;
  /** 撤销栈顶命令 → push redoStack。返回被撤销的命令，栈空或忙时返回 null */
  undo: () => Promise<Command | null>;
  /** 重做 redoStack 顶部命令。返回最终命令（可能带新 ID），栈空或忙时返回 null */
  redo: () => Promise<Command | null>;
}

function clipToCreateBody(clip: Clip) {
  return {
    id: clip.id,
    asset_id: clip.asset_id || undefined,
    name: clip.name,
    kind: clip.kind,
    src: clip.src,
    track: clip.track,
    start_frame: clip.start_frame,
    duration_frames: clip.duration_frames,
    src_in_frame: clip.src_in_frame,
    props: clip.props || undefined,
  };
}

export function useEditorStore(projectId: string): EditorStore {
  const [state, dispatch] = useReducer(editorReducer, { clips: [], undoStack: [], redoStack: [] });
  const stateRef = useRef(state);
  stateRef.current = state;
  // 串行锁：undo/redo/execute 期间忽略新操作，避免异步竞态读同一栈
  const busyRef = useRef(false);

  const sync = useCallback((clips: Clip[]) => {
    dispatch({ type: "sync", clips });
  }, []);

  const refetch = useCallback(async (): Promise<Clip[]> => {
    const clips = await api.listClips(projectId);
    return Array.isArray(clips) ? clips : [];
  }, [projectId]);

  // 正向应用命令（execute / redo 共用）；返回带服务端生成 ID 的最终命令
  const applyForward = useCallback(async (cmd: Command): Promise<Command> => {
    switch (cmd.type) {
      case "split": {
        const result = await api.splitClip(projectId, cmd.clipId, { at_frame: cmd.atFrame });
        return { ...cmd, splitId: result.split_id };
      }
      case "duplicate": {
        const result = await api.duplicateClip(projectId, cmd.clipId);
        return { ...cmd, duplicateId: result.duplicate_id };
      }
      case "delete": {
        await api.deleteClip(projectId, cmd.clip.id);
        return cmd;
      }
      case "move": {
        if (cmd.to.track !== cmd.from.track) {
          await api.updateClip(projectId, cmd.clipId, { start_frame: cmd.to.startFrame, track: cmd.to.track });
        } else {
          await api.updateClipTiming(projectId, cmd.clipId, { start_frame: cmd.to.startFrame });
        }
        return cmd;
      }
      case "addClip": {
        const created = await api.createClip(projectId, clipToCreateBody(cmd.clip));
        return { ...cmd, clip: created };
      }
      case "addTransition": {
        const t = await api.createTransition(projectId, {
          from_item_id: cmd.fromItemId,
          to_item_id: cmd.toItemId,
          type: cmd.transitionType,
          duration_frames: cmd.durationFrames,
        });
        return { ...cmd, transitionId: t.id };
      }
      case "trim": {
        await api.updateClipTiming(projectId, cmd.clipId, {
          start_frame: cmd.after.startFrame,
          duration_frames: cmd.after.durationFrames,
          src_in_frame: cmd.after.srcInFrame,
        });
        return cmd;
      }
    }
  }, [projectId]);

  // 逆向应用命令（undo）；delete 的逆用原 ID 重建（服务端支持客户端指定 ID）
  const applyInverse = useCallback(async (cmd: Command): Promise<Command> => {
    switch (cmd.type) {
      case "split": {
        await api.deleteClip(projectId, cmd.splitId);
        await api.updateClip(projectId, cmd.clipId, { duration_frames: cmd.originalDuration });
        return cmd;
      }
      case "duplicate": {
        await api.deleteClip(projectId, cmd.duplicateId);
        return cmd;
      }
      case "delete": {
        const created = await api.createClip(projectId, clipToCreateBody(cmd.clip));
        return { ...cmd, clip: created };
      }
      case "move": {
        if (cmd.from.track !== cmd.to.track) {
          await api.updateClip(projectId, cmd.clipId, { start_frame: cmd.from.startFrame, track: cmd.from.track });
        } else {
          await api.updateClipTiming(projectId, cmd.clipId, { start_frame: cmd.from.startFrame });
        }
        return cmd;
      }
      case "addClip": {
        await api.deleteClip(projectId, cmd.clip.id);
        return cmd;
      }
      case "addTransition": {
        await api.deleteTransition(projectId, cmd.transitionId);
        return cmd;
      }
      case "trim": {
        await api.updateClipTiming(projectId, cmd.clipId, {
          start_frame: cmd.before.startFrame,
          duration_frames: cmd.before.durationFrames,
          src_in_frame: cmd.before.srcInFrame,
        });
        return cmd;
      }
    }
  }, [projectId]);

  const execute = useCallback(async (draft: Command): Promise<Command | null> => {
    if (busyRef.current) return null;
    busyRef.current = true;
    try {
      const command = await applyForward(draft);
      const clips = await refetch();
      dispatch({ type: "execute", command, clips });
      return command;
    } finally {
      busyRef.current = false;
    }
  }, [applyForward, refetch]);

  const undo = useCallback(async (): Promise<Command | null> => {
    if (busyRef.current) return null;
    const stack = stateRef.current.undoStack;
    if (stack.length === 0) return null;
    const command = stack[stack.length - 1];
    busyRef.current = true;
    try {
      const updated = await applyInverse(command);
      const clips = await refetch();
      dispatch({ type: "undo", command: updated, clips });
      return updated;
    } finally {
      busyRef.current = false;
    }
  }, [applyInverse, refetch]);

  const redo = useCallback(async (): Promise<Command | null> => {
    if (busyRef.current) return null;
    const stack = stateRef.current.redoStack;
    if (stack.length === 0) return null;
    const command = stack[0];
    busyRef.current = true;
    try {
      const updated = await applyForward(command);
      const clips = await refetch();
      dispatch({ type: "redo", command: updated, clips });
      return updated;
    } finally {
      busyRef.current = false;
    }
  }, [applyForward, refetch]);

  return {
    state,
    canUndo: state.undoStack.length > 0,
    canRedo: state.redoStack.length > 0,
    sync,
    execute,
    undo,
    redo,
  };
}
