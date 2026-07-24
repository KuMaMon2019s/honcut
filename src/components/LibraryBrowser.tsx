// LibraryBrowser.tsx — 资源库（Template + Resource + Sound + Plugin 四合一）
// 从 OpenChatCut src/library/ 简化合并

import { useState, useEffect } from 'react';

export function LibraryBrowser() {
  const [tab, setTab] = useState<'templates' | 'resources' | 'sounds' | 'plugins'>('templates');
  return (
    <div style={wrap}>
      <div style={tabBar}>
        {(['templates','resources','sounds','plugins'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{...tb,...(tab===t?tbActive:{})}}>
            {{templates:'🎬 模板',resources:'📦 资源',sounds:'🔊 音效',plugins:'🔌 插件'}[t]}
          </button>
        ))}
      </div>
      <div style={body}>
        {tab === 'templates' && <TemplateList />}
        {tab === 'resources' && <ResourceList />}
        {tab === 'sounds' && <SoundList />}
        {tab === 'plugins' && <PluginList />}
      </div>
    </div>
  );
}

function TemplateList() {
  const [cats, setCats] = useState<Record<string,number>>({});
  useEffect(() => {
    fetch('/api/templates').then(r=>r.json()).then(d => {
      setCats(d.categories ?? {});
    }).catch(()=>{});
  }, []);
  return (
    <div style={grid}>
      {Object.entries(cats).map(([k,v]) => (
        <div key={k} style={card}>
          <span style={cardName}>{k.replace(/-/g,' ')}</span>
          <span style={cardCount}>{v}</span>
        </div>
      ))}
    </div>
  );
}

function ResourceList() {
  const items = [
    { name:'叠加层', count:20 }, { name:'背景', count:15 },
    { name:'边框', count:12 }, { name:'LUT', count:8 },
    { name:'粒子', count:10 },
  ];
  return <div style={grid}>{items.map(i=><div key={i.name} style={card}><span style={cardName}>{i.name}</span><span style={cardCount}>{i.count}</span></div>)}</div>;
}

function SoundList() {
  const items = ['点击音','提示音','转场音','氛围音','警报音','成功音','错误音','通知音'];
  return <div style={grid}>{items.map(s=><div key={s} style={card}><span style={cardName}>🔊 {s}</span></div>)}</div>;
}

function PluginList() {
  return <div style={{padding:16,color:'#888',fontSize:13}}>插件市场即将上线 🚧</div>;
}

const wrap: React.CSSProperties = { display:'flex',flexDirection:'column',height:'100%' };
const tabBar: React.CSSProperties = { display:'flex',borderBottom:'1px solid #2a2a3e' };
const tb: React.CSSProperties = { background:'none',border:'none',color:'#888',padding:'6px 12px',cursor:'pointer',fontSize:12 };
const tbActive: React.CSSProperties = { color:'#eee',borderBottom:'2px solid #e94560' };
const body: React.CSSProperties = { flex:1,overflow:'auto' };
const grid: React.CSSProperties = { display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(120px,1fr))',gap:6,padding:8 };
const card: React.CSSProperties = { background:'#1a1a1a',borderRadius:6,padding:10,display:'flex',flexDirection:'column',alignItems:'center',gap:4 };
const cardName: React.CSSProperties = { fontSize:12,color:'#ddd',textTransform:'capitalize' };
const cardCount: React.CSSProperties = { fontSize:11,color:'#888' };
