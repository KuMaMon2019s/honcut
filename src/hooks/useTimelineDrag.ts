// useTimelineDrag.ts — 时间线片段拖动状态机（Pointer Events + setPointerCapture）
// 搬自 OpenChatCut useTimelinePointer.ts：只保留 'move' 模式（无 trim/pen/marquee）。
// down 时把指针捕获到片段元素，move 更新 deltaF（含吸附），up 经回调提交。
// move/up 因指针捕获自动派发到捕获元素，无需在 document 上挂监听。

import { useCallback, useRef, useState } from "react";
import { snapClipStart } from "../utils/snapping";

export interface TimelineDragState {
  /** 按下时的 clientX（deltaF 的基准） */
  startX: number;
  /** 按下时的 startFrame */
  baseStart: number;
  /** 吸附后的帧位移 → transform: translateX(deltaF * pxPerFrame) */
  deltaF: number;
  mouseX: number;
  mouseY: number;
}

export interface UseTimelineDragOptions {
  pxPerFrame: number;
  startFrame: number;
  durationInFrames: number;
  selected: boolean;
  onSelect: () => void;
  /** P6: 吸附 */
  snapEnabled?: boolean;
  snapPoints?: number[];
  onSnapLine?: (frame: number | null) => void;
  /** 拖动中实时回调（跨轨目标检测 + 落点预览） */
  onDragMove?: (clientX: number, clientY: number, projectedFrame: number) => void;
  /** 松手提交（是否有实际移动、是否调 API 由调用方判断） */
  onDragEnd?: (newStartFrame: number) => void;
}

export function useTimelineDrag(opts: UseTimelineDragOptions) {
  const [drag, setDrag] = useState<TimelineDragState | null>(null);

  // 最新 options / drag 的镜像 ref：pointer handler 用稳定身份，避免 stale closure，
  // 也避免在 setState updater 里触发副作用（StrictMode 下 updater 会跑两遍）。
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const dragRef = useRef<TimelineDragState | null>(null);
  dragRef.current = drag;

  const startDrag = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return; // 仅左键拖动；右键保留上下文菜单
    e.preventDefault();
    e.stopPropagation();
    const o = optsRef.current;
    // 幂等选中：已选中的片段按下时不反选（否则拖拽中途会掉选中态）
    if (!o.selected) o.onSelect();
    // 捕获到片段元素：后续 move/up 全部派发到此处
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ startX: e.clientX, baseStart: o.startFrame, deltaF: 0, mouseX: e.clientX, mouseY: e.clientY });
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const cur = dragRef.current;
    if (!cur) return;
    const o = optsRef.current;
    const rawDelta = Math.round((e.clientX - cur.startX) / o.pxPerFrame);
    let deltaF = rawDelta;
    if (o.snapEnabled && o.snapPoints && o.snapPoints.length > 0) {
      const rawFrame = cur.baseStart + rawDelta;
      const result = snapClipStart(Math.max(0, rawFrame), o.durationInFrames, o.snapPoints, 8 / o.pxPerFrame);
      if (result.snapped) {
        deltaF = result.frame - cur.baseStart;
        o.onSnapLine?.(result.snapTarget);
      } else {
        o.onSnapLine?.(null);
      }
    }
    o.onDragMove?.(e.clientX, e.clientY, Math.max(0, cur.baseStart + deltaF));
    setDrag({ ...cur, deltaF, mouseX: e.clientX, mouseY: e.clientY });
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    const cur = dragRef.current;
    if (!cur) return;
    const o = optsRef.current;
    o.onSnapLine?.(null);
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    const newFrame = Math.max(0, cur.baseStart + cur.deltaF);
    setDrag(null);
    o.onDragEnd?.(newFrame);
  }, []);

  return { drag, startDrag, onPointerMove, onPointerUp };
}
