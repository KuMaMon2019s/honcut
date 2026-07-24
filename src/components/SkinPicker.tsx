// SkinPicker.tsx — 皮肤选择器（实际生效）
import { useState, useEffect } from 'react';

const skins = [
  { id: 'dark', name: '暗夜', accent: '#e94560', bg: '#0f0f1a' },
  { id: 'ocean', name: '深海', accent: '#3b82f6', bg: '#0a1929' },
  { id: 'forest', name: '森林', accent: '#22c55e', bg: '#0d1f0d' },
  { id: 'sunset', name: '日落', accent: '#f59e0b', bg: '#1a1005' },
  { id: 'purple', name: '紫夜', accent: '#a855f7', bg: '#150a20' },
];

export function SkinPicker() {
  const saved = localStorage.getItem('honcut-skin') || 'dark';
  const [active, setActive] = useState(saved);

  const applySkin = (id: string) => {
    const s = skins.find(sk => sk.id === id) || skins[0];
    const root = document.documentElement;
    root.style.setProperty('--accent', s.accent);
    root.style.setProperty('--bg', s.bg);
    localStorage.setItem('honcut-skin', id);
    setActive(id);
  };

  useEffect(() => { applySkin(saved); }, []);

  return (
    <div style={wrap}>
      <h3 style={h}>🎨 皮肤</h3>
      <div style={grid}>
        {skins.map(s => (
          <button key={s.id} onClick={() => applySkin(s.id)}
            style={{
              ...card,
              border: active === s.id ? `2px solid ${s.accent}` : '2px solid #333',
            }}>
            <div style={{ width:'100%',height:40,background:s.bg,borderRadius:4,marginBottom:6 }} />
            <div style={{ width:'60%',height:4,background:s.accent,borderRadius:2,marginBottom:4 }} />
            <span style={{ fontSize:11,color:active===s.id?'#eee':'#888' }}>{s.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

const wrap: React.CSSProperties = { padding:12 };
const h: React.CSSProperties = { fontSize:13,margin:'0 0 8px',color:'#aaa' };
const grid: React.CSSProperties = { display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8 };
const card: React.CSSProperties = { background:'#1a1a1a',borderRadius:8,padding:8,cursor:'pointer',display:'flex',flexDirection:'column',alignItems:'flex-start' };
