// useHotkeys.ts — 全局快捷键
// 空格=播放/暂停, J=后退, K=暂停, L=前进, C=分割, Delete=删除, ⌘D=复制, Z/⌘Z=撤销, ⇧Z/⌘⇧Z=重做
// 在 input/textarea/contentEditable 聚焦时忽略（除 Escape 外）

import { useEffect, useRef } from "react";

export interface HotkeyHandlers {
  onPlayPause?: () => void;
  onPause?: () => void;
  onStepBack?: () => void;
  onStepForward?: () => void;
  onFrameBack?: () => void;
  onFrameForward?: () => void;
  onSplit?: () => void;
  onDelete?: () => void;
  onDuplicate?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onAddMarker?: () => void;
  onSnapToggle?: () => void;
}

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
}

export function useHotkeys(handlers: HotkeyHandlers): void {
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const h = ref.current;
      const typing = isTypingTarget(e.target);

      // ⌘Z / Ctrl+Z — 撤销（输入框内也允许，浏览器原生处理；这里仅在非输入时触发）
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        if (!typing) {
          e.preventDefault();
          if (e.shiftKey) h.onRedo?.();
          else h.onUndo?.();
        }
        return;
      }

      // ⌘D / Ctrl+D — 复制片段（拦截浏览器原生"加入书签"）
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "d") {
        if (!typing) {
          e.preventDefault();
          h.onDuplicate?.();
        }
        return;
      }

      if (typing) return;

      switch (e.key) {
        case " ":
          e.preventDefault();
          h.onPlayPause?.();
          break;
        case "j":
        case "J":
          e.preventDefault();
          h.onStepBack?.();
          break;
        case "k":
        case "K":
          e.preventDefault();
          h.onPause?.();
          break;
        case "l":
        case "L":
          e.preventDefault();
          h.onStepForward?.();
          break;
        case "c":
        case "C":
          if (!e.metaKey && !e.ctrlKey) { e.preventDefault(); h.onSplit?.(); }
          break;
        case "z":
        case "Z":
          // 单键 Z 撤销 / Shift+Z 重做（⌘Z / ⌘⇧Z 已在上方处理）
          if (!e.metaKey && !e.ctrlKey) {
            e.preventDefault();
            if (e.shiftKey) h.onRedo?.();
            else h.onUndo?.();
          }
          break;
        case "Delete":
        case "Backspace":
          e.preventDefault();
          h.onDelete?.();
          break;
        case "ArrowLeft":
          e.preventDefault();
          h.onFrameBack?.();
          break;
        case "ArrowRight":
          e.preventDefault();
          h.onFrameForward?.();
          break;
        case "m":
        case "M":
          e.preventDefault();
          h.onAddMarker?.();
          break;
        case "s":
        case "S":
          if (!e.metaKey && !e.ctrlKey) {
            e.preventDefault();
            h.onSnapToggle?.();
          }
          break;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
