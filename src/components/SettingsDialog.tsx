// SettingsDialog.tsx — 设置面板（简版，从 OpenChatCut 化繁为简）
// 只有模型状态 + 设计风格 + 皮肤选择，不做 Key 管理（用 .env）

import { useState } from 'react';
import { DesignStylePanel } from './DesignStylePanel';
import { SkinPicker } from './SkinPicker';

interface Props { onClose: () => void }

export function SettingsDialog({ onClose }: Props) {
  const [tab, setTab] = useState<'models' | 'design' | 'skin'>('models');
  const [saved, setSaved] = useState<string | null>(null);

  const tabs = [
    { key: 'models', label: '模型' },
    { key: 'design', label: '设计风格' },
    { key: 'skin', label: '皮肤' },
  ] as const;

  return (
    <div style={overlay} onMouseDown={onClose}>
      <div style={panel} onMouseDown={e => e.stopPropagation()}>
        <header style={head}>
          <b style={{ fontSize: 14 }}>⚙ 设置</b>
          <button onClick={onClose} style={closeBtn}>✕</button>
        </header>
        <div style={tabBar}>
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              style={{ ...tabStyle, ...(tab === t.key ? tabActive : {}) }}>
              {t.label}
            </button>
          ))}
        </div>
        <div style={body}>
          {tab === 'models' && <ModelStatus />}
          {tab === 'design' && <DesignStylePanel projectId="" onSave={() => setSaved('风格已保存')} />}
          {tab === 'skin' && <SkinPicker />}
        </div>
        {saved && <div style={msg}>{saved}</div>}
      </div>
    </div>
  );
}

function ModelStatus() {
  interface Provider { id: string; label: string; model: string; configured: boolean }
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);

  // load on mount
  if (loading) {
    fetch('/api/config').then(r => r.json()).then(d => {
      setProviders(d.providers ?? []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }

  // prevent re-fetch loop
  useState(() => { if (loading) return; });

  return (
    <div style={{ padding: 12 }}>
      <h3 style={{ fontSize: 13, margin: '0 0 8px', color: '#aaa' }}>AI 模型状态</h3>
      {loading ? <div style={{ color: '#888' }}>加载中…</div> : (
        <table style={tbl}>
          <tbody>
            {providers.map(p => (
              <tr key={p.id}>
                <td style={td}>{p.label}</td>
                <td style={td}>{p.model}</td>
                <td style={{ ...td, color: p.configured ? '#4ade80' : '#ef4444' }}>
                  {p.configured ? '● 已配置' : '○ 未配置'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// styles
const overlay: React.CSSProperties = { position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',display:'grid',placeItems:'center',zIndex:200 };
const panel: React.CSSProperties = { width:520,height:420,background:'#1a1a2e',color:'#eee',borderRadius:8,display:'flex',flexDirection:'column',overflow:'hidden' };
const head: React.CSSProperties = { display:'flex',justifyContent:'space-between',padding:'12px 16px',borderBottom:'1px solid #2a2a3e' };
const closeBtn: React.CSSProperties = { background:'none',border:'none',color:'#888',cursor:'pointer',fontSize:16 };
const tabBar: React.CSSProperties = { display:'flex',borderBottom:'1px solid #2a2a3e',padding:'0 12px' };
const tabStyle: React.CSSProperties = { background:'none',border:'none',color:'#888',padding:'8px 14px',cursor:'pointer',fontSize:13 };
const tabActive: React.CSSProperties = { color:'#eee',borderBottom:'2px solid #e94560' };
const body: React.CSSProperties = { flex:1,overflow:'auto' };
const msg: React.CSSProperties = { padding:'8px 16px',fontSize:12,color:'#4ade80',borderTop:'1px solid #2a2a3e' };
const tbl: React.CSSProperties = { width:'100%',borderCollapse:'collapse',fontSize:12 };
const td: React.CSSProperties = { padding:'6px 8px',borderBottom:'1px solid #2a2a3e' };
