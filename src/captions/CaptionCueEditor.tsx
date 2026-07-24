// CaptionCueEditor.tsx — 单条字幕编辑器
// 编辑文本、时间、样式；嵌入 InspectorPanel 右侧面板

import { useState, useEffect, useCallback } from "react";
import type { CaptionCue, CaptionStyle } from "./types";
import { parseCaptionStyle, serializeCaptionStyle } from "./types";
import { frameToTimecode } from "./captionUtils";

interface CaptionCueEditorProps {
  cue: CaptionCue;
  fps: number;
  onUpdate: (id: string, body: { text?: string; start_frame?: number; duration_frames?: number; style?: string }) => void;
  onDelete: (id: string) => void;
}

const inputCls = "bg-inset border border-border rounded px-2 py-1 text-xs text-text focus:border-accent outline-none w-full";
const labelCls = "text-[10px] text-text-muted uppercase tracking-wide mb-0.5 block";

const POSITION_OPTIONS = [
  { value: "top", label: "顶部" },
  { value: "center", label: "居中" },
  { value: "bottom", label: "底部" },
] as const;

export default function CaptionCueEditor({ cue, fps, onUpdate, onDelete }: CaptionCueEditorProps) {
  const [text, setText] = useState(cue.text);
  const [startFrame, setStartFrame] = useState(cue.start_frame);
  const [duration, setDuration] = useState(cue.duration_frames);
  const [style, setStyle] = useState<CaptionStyle>(() => parseCaptionStyle(cue.style));

  // 同步外部 cue 变化
  useEffect(() => {
    setText(cue.text);
    setStartFrame(cue.start_frame);
    setDuration(cue.duration_frames);
    setStyle(parseCaptionStyle(cue.style));
  }, [cue.id, cue.text, cue.start_frame, cue.duration_frames, cue.style]);

  const commitText = useCallback(() => {
    if (text !== cue.text) onUpdate(cue.id, { text });
  }, [text, cue.id, cue.text, onUpdate]);

  const commitTiming = useCallback(() => {
    const body: Record<string, number> = {};
    if (startFrame !== cue.start_frame) body.start_frame = Math.max(0, startFrame);
    if (duration !== cue.duration_frames) body.duration_frames = Math.max(1, duration);
    if (Object.keys(body).length > 0) onUpdate(cue.id, body);
  }, [startFrame, duration, cue.start_frame, cue.duration_frames, cue.id, onUpdate]);

  const updateStyle = useCallback((patch: Partial<CaptionStyle>) => {
    setStyle(prev => {
      const next = { ...prev, ...patch };
      onUpdate(cue.id, { style: serializeCaptionStyle(next) });
      return next;
    });
  }, [cue.id, onUpdate]);

  return (
    <div className="flex flex-col gap-3 p-3">
      {/* 标题 */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-text">📝 字幕编辑</span>
        <button
          className="text-[10px] text-red-400 hover:text-red-300 px-1.5 py-0.5 rounded hover:bg-red-400/10"
          onClick={() => onDelete(cue.id)}
        >
          删除
        </button>
      </div>

      {/* 文本 */}
      <div>
        <label className={labelCls}>文本内容</label>
        <textarea
          className={`${inputCls} resize-none h-16`}
          value={text}
          onChange={e => setText(e.target.value)}
          onBlur={commitText}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); commitText(); } }}
        />
      </div>

      {/* 时间 */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelCls}>起始帧</label>
          <input
            type="number"
            className={inputCls}
            value={startFrame}
            min={0}
            onChange={e => setStartFrame(Number(e.target.value))}
            onBlur={commitTiming}
          />
          <span className="text-[9px] text-text-muted">{frameToTimecode(startFrame, fps)}</span>
        </div>
        <div>
          <label className={labelCls}>持续帧</label>
          <input
            type="number"
            className={inputCls}
            value={duration}
            min={1}
            onChange={e => setDuration(Number(e.target.value))}
            onBlur={commitTiming}
          />
          <span className="text-[9px] text-text-muted">{frameToTimecode(duration, fps)}</span>
        </div>
      </div>

      {/* 样式 */}
      <div className="border-t border-border pt-2">
        <label className={labelCls}>样式</label>
        <div className="grid grid-cols-2 gap-2 mt-1">
          <div>
            <label className="text-[9px] text-text-muted">字号</label>
            <input
              type="number"
              className={inputCls}
              value={style.fontSize}
              min={12}
              max={200}
              onChange={e => updateStyle({ fontSize: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className="text-[9px] text-text-muted">位置</label>
            <select
              className={inputCls}
              value={style.position}
              onChange={e => updateStyle({ position: e.target.value as CaptionStyle["position"] })}
            >
              {POSITION_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[9px] text-text-muted">文字颜色</label>
            <input
              type="color"
              className="w-full h-6 rounded border border-border cursor-pointer"
              value={style.color}
              onChange={e => updateStyle({ color: e.target.value })}
            />
          </div>
          <div>
            <label className="text-[9px] text-text-muted">背景颜色</label>
            <input
              type="color"
              className="w-full h-6 rounded border border-border cursor-pointer"
              value={style.backgroundColor.startsWith("rgba") ? "#000000" : style.backgroundColor}
              onChange={e => updateStyle({ backgroundColor: e.target.value })}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
