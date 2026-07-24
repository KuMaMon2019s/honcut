// TranscriptPanel.tsx — 转录面板
import { useState } from 'react';

export function TranscriptPanel() {
  const [text, setText] = useState('');
  return (
    <div style={wrap}>
      <h3 style={h}>📝 转录</h3>
      <textarea value={text} onChange={e=>setText(e.target.value)}
        placeholder="粘贴或输入字幕文本…每行一条"
        style={ta} rows={10} />
      <button style={btn}>导入字幕</button>
    </div>
  );
}

// GL 特效
export function ClipFx() {
  const fx = ['模糊','锐化','暗角','色散','发光','噪点'];
  return <div style={wrap}><h3 style={h}>✨ 片段特效</h3><div style={grid}>{fx.map(f=><div key={f} style={card}>{f}</div>)}</div></div>;
}

export function GlTransition() {
  const tx = ['淡入淡出','滑动','缩放','旋转','翻页','溶解'];
  return <div style={wrap}><h3 style={h}>🔄 GL 转场</h3><div style={grid}>{tx.map(t=><div key={t} style={card}>{t}</div>)}</div></div>;
}

// 移动端上传
export function MobileUploadDialog({ onClose }: { onClose: () => void }) {
  return (
    <div style={overlay} onMouseDown={onClose}>
      <div style={panel} onMouseDown={e=>e.stopPropagation()}>
        <p style={{fontSize:14}}>📱 扫码上传</p>
        <div style={{width:180,height:180,background:'#333',borderRadius:8,margin:'12px 0',display:'flex',alignItems:'center',justifyContent:'center',fontSize:40}}>📷</div>
        <button onClick={onClose} style={btn}>关闭</button>
      </div>
    </div>
  );
}

const wrap: React.CSSProperties = { padding:12 };
const h: React.CSSProperties = { fontSize:13,margin:'0 0 8px',color:'#aaa' };
const ta: React.CSSProperties = { width:'100%',background:'#111',color:'#eee',border:'1px solid #333',borderRadius:4,padding:8,fontSize:12,resize:'vertical' };
const btn: React.CSSProperties = { marginTop:8,background:'#e94560',color:'#fff',border:'none',borderRadius:4,padding:'6px 14px',cursor:'pointer',fontSize:12 };
const grid: React.CSSProperties = { display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:6 };
const card: React.CSSProperties = { background:'#1a1a1a',borderRadius:6,padding:8,fontSize:12,color:'#ddd',textAlign:'center' };
const overlay: React.CSSProperties = { position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',display:'grid',placeItems:'center',zIndex:200 };
const panel: React.CSSProperties = { background:'#1a1a2e',borderRadius:8,padding:24,display:'flex',flexDirection:'column',alignItems:'center' };
