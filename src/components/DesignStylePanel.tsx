// DesignStylePanel.tsx — 设计风格面板
// 管理 colors + fonts JSON，存到 clip.props 或独立 API

import { useState, useEffect } from 'react';

interface Props {
  projectId: string;
  onSave?: () => void;
}

export function DesignStylePanel({ projectId, onSave }: Props) {
  const [colors, setColors] = useState('{"primary":"#e94560","bg":"#0f0f1a","text":"#eee"}');
  const [fonts, setFonts] = useState('{"title":"sans-serif","body":"sans-serif"}');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const colorsObj = JSON.parse(colors);
      const fontsObj = JSON.parse(fonts);
      const resp = await fetch('/api/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0', id: 1, method: 'tools/call',
          params: { name: 'manage_design_style', arguments: {
            project_id: projectId, action: 'apply',
            name: 'current', colors: colorsObj, fonts: fontsObj,
          }},
        }),
      });
      if (resp.ok) onSave?.();
    } catch (e) { alert('保存失败: ' + (e as Error).message); }
    setSaving(false);
  };

  return (
    <div style={wrap}>
      <h3 style={h}>🎨 设计风格</h3>
      <label style={lbl}>Colors (JSON)</label>
      <textarea rows={4} value={colors} onChange={e => setColors(e.target.value)} style={ta} />
      <label style={lbl}>Fonts (JSON)</label>
      <textarea rows={4} value={fonts} onChange={e => setFonts(e.target.value)} style={ta} />
      <button onClick={handleSave} disabled={saving} style={btn}>
        {saving ? '保存中…' : '保存风格'}
      </button>
    </div>
  );
}

const wrap: React.CSSProperties = { padding: 12 };
const h: React.CSSProperties = { fontSize:13,margin:'0 0 8px',color:'#aaa' };
const lbl: React.CSSProperties = { display:'block',fontSize:11,color:'#888',marginBottom:4,marginTop:8 };
const ta: React.CSSProperties = { width:'100%',background:'#111',color:'#eee',border:'1px solid #333',borderRadius:4,padding:8,fontSize:12,fontFamily:'monospace',resize:'vertical' };
const btn: React.CSSProperties = { marginTop:10,background:'#e94560',color:'#fff',border:'none',borderRadius:4,padding:'6px 14px',cursor:'pointer',fontSize:12 };
