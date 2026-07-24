// TimelineToolbar.tsx — 时间线工具栏（缩放/吸附/刀片模式）
import { useState } from 'react';

interface Props {
  onZoomIn: () => void;
  onZoomOut: () => void;
  snapping: boolean;
  onToggleSnap: () => void;
}

export function TimelineToolbar({ onZoomIn, onZoomOut, snapping, onToggleSnap }: Props) {
  const [bladeMode, setBladeMode] = useState(false);
  return (
    <div style={bar}>
      <button onClick={onZoomOut} title="缩小" style={btn}>−</button>
      <button onClick={onZoomIn} title="放大" style={btn}>+</button>
      <span style={sep} />
      <button onClick={onToggleSnap}
        style={{...btn,color:snapping?'#4ade80':'#888'}} title="吸附">
        🧲
      </button>
      <button onClick={() => setBladeMode(!bladeMode)}
        style={{...btn,color:bladeMode?'#e94560':'#888'}} title="刀片模式 (B)">
        ✂
      </button>
    </div>
  );
}

export function TrackHead({ trackId, locked, hidden, onToggleLock, onToggleHide }: {
  trackId: string; locked: boolean; hidden: boolean;
  onToggleLock: () => void; onToggleHide: () => void;
}) {
  return (
    <div style={head}>
      <span style={{ fontWeight:600,fontSize:11,color:'#aaa' }}>{trackId}</span>
      <button onClick={onToggleLock} style={{...hb,color:locked?'#e94560':'#555'}} title="锁定">🔒</button>
      <button onClick={onToggleHide} style={{...hb,color:hidden?'#e94560':'#555'}} title="隐藏">👁</button>
    </div>
  );
}

export function ClipMediaLayers({ kind }: { kind: string }) {
  const badges: Record<string,string> = { fx:'✨', lut:'🎨', zoom:'🔍', transition:'🔄', denoise:'🔇' };
  return (
    <div style={layers}>
      {kind === 'video' && <span style={thumb}>🎬</span>}
      {kind === 'audio' && <span style={thumb}>🎵</span>}
      {Object.entries(badges).map(([k,v]) => <span key={k} style={badge} title={k}>{v}</span>)}
    </div>
  );
}

const bar: React.CSSProperties = { display:'flex',alignItems:'center',gap:2,padding:'2px 6px',borderBottom:'1px solid #2a2a3e' };
const btn: React.CSSProperties = { background:'none',border:'none',color:'#888',cursor:'pointer',fontSize:13,padding:'2px 6px',borderRadius:4 };
const sep: React.CSSProperties = { width:1,height:16,background:'#333',margin:'0 4px' };
const head: React.CSSProperties = { display:'flex',alignItems:'center',gap:4,width:80,flexShrink:0,padding:'0 8px' };
const hb: React.CSSProperties = { background:'none',border:'none',fontSize:10,cursor:'pointer',padding:0 };
const layers: React.CSSProperties = { display:'flex',gap:2,position:'absolute',top:2,right:2 };
const thumb: React.CSSProperties = { fontSize:14 };
const badge: React.CSSProperties = { fontSize:9,background:'#333',borderRadius:3,padding:'1px 3px' };
