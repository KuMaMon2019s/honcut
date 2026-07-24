// CaptionsControls.tsx — 字幕管理面板
// 列表展示所有字幕、添加/删除、选中编辑、点击跳转

import { useMemo } from "react";
import type { CaptionCue } from "./types";
import { frameToTimecode } from "./captionUtils";

interface CaptionsControlsProps {
  cues: CaptionCue[];
  fps: number;
  playhead: number;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
  onSeek: (frame: number) => void;
}

export default function CaptionsControls({
  cues, fps, playhead, selectedId,
  onSelect, onAdd, onDelete, onSeek,
}: CaptionsControlsProps) {
  const sorted = useMemo(
    () => [...cues].sort((a, b) => a.start_frame - b.start_frame),
    [cues],
  );

  return (
    <div className="flex flex-col h-full">
      {/* 头部 */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-xs font-semibold text-text">
          字幕 <span className="text-text-muted font-normal">({cues.length})</span>
        </span>
        <button
          className="text-[10px] px-2 py-1 rounded bg-accent/15 text-accent hover:bg-accent/25 transition-colors"
          onClick={onAdd}
        >
          + 添加字幕
        </button>
      </div>

      {/* 列表 */}
      <div className="flex-1 overflow-y-auto">
        {sorted.length === 0 ? (
          <div className="text-center text-text-muted text-xs py-8">
            暂无字幕，点击"添加字幕"开始
          </div>
        ) : (
          sorted.map((cue, i) => {
            const isActive = playhead >= cue.start_frame && playhead < cue.start_frame + cue.duration_frames;
            const isSelected = cue.id === selectedId;
            return (
              <div
                key={cue.id}
                className={`flex items-center gap-2 px-3 py-2 cursor-pointer border-b border-border/50 transition-colors ${
                  isSelected
                    ? "bg-accent/10 border-l-2 border-l-accent"
                    : isActive
                      ? "bg-hover/50"
                      : "hover:bg-hover/30"
                }`}
                onClick={() => {
                  onSelect(cue.id);
                  onSeek(cue.start_frame);
                }}
              >
                <span className="text-[10px] text-text-muted w-5 text-right shrink-0">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-text truncate">{cue.text || "(空)"}</div>
                  <div className="text-[9px] text-text-muted">
                    {frameToTimecode(cue.start_frame, fps)} → {frameToTimecode(cue.start_frame + cue.duration_frames, fps)}
                  </div>
                </div>
                {isActive && (
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" title="当前播放位置" />
                )}
                <button
                  className="text-text-muted hover:text-red-400 text-xs px-1 shrink-0"
                  onClick={e => { e.stopPropagation(); onDelete(cue.id); }}
                  title="删除字幕"
                >
                  ✕
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
