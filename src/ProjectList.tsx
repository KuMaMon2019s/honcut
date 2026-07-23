// ProjectList.tsx — 项目列表 + 新建项目
// 首页：展示所有项目卡片，支持创建新项目

import { useState, useEffect } from "react";

interface Project {
  id: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
}

export default function ProjectList({ onSelect }: { onSelect: (id: string) => void }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);

  const load = () => {
    setLoading(true);
    fetch("/api/projects")
      .then(r => r.json())
      .then(data => {
        setProjects(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(e => { setError("加载失败: " + e.message); setLoading(false); });
  };

  useEffect(load, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const id = "proj_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, name: newName.trim(), description: newDesc.trim() }),
      });
      if (!res.ok) throw new Error(await res.text());
      setShowCreate(false);
      setNewName("");
      setNewDesc("");
      load();
    } catch (err: any) {
      setError("创建失败: " + err.message);
    } finally {
      setCreating(false);
    }
  };

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", color: "#888" }}>
      加载中…
    </div>
  );

  return (
    <div style={{ fontFamily: "system-ui", background: "#111", color: "#eee", minHeight: "100vh", padding: "40px 24px" }}>
      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        {/* 标题栏 */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 32 }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>🎬 Honcut</h1>
            <p style={{ color: "#888", fontSize: 14, margin: "4px 0 0" }}>AI 视频剪辑工作站</p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            style={{
              background: "#3b82f6", border: "none", color: "#fff",
              borderRadius: 8, padding: "10px 20px", fontSize: 14, fontWeight: 600,
              cursor: "pointer",
            }}
          >
            + 新建项目
          </button>
        </div>

        {error && (
          <div style={{ background: "#1f1111", border: "1px solid #ef4444", borderRadius: 8, padding: "10px 16px", marginBottom: 16, color: "#f87171", fontSize: 13 }}>
            {error}
            <button onClick={() => setError("")} style={{ marginLeft: 12, background: "none", border: "none", color: "#888", cursor: "pointer" }}>✕</button>
          </div>
        )}

        {/* 新建表单 */}
        {showCreate && (
          <form onSubmit={handleCreate} style={{
            background: "#1a1a1a", border: "1px solid #333", borderRadius: 12,
            padding: 20, marginBottom: 24,
          }}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>新建项目</div>
            <input
              autoFocus
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="项目名称"
              style={{
                width: "100%", padding: "10px 14px", borderRadius: 8,
                border: "1px solid #444", background: "#222", color: "#eee",
                fontSize: 14, marginBottom: 10, boxSizing: "border-box", outline: "none",
              }}
            />
            <input
              value={newDesc}
              onChange={e => setNewDesc(e.target.value)}
              placeholder="描述（可选）"
              style={{
                width: "100%", padding: "10px 14px", borderRadius: 8,
                border: "1px solid #444", background: "#222", color: "#eee",
                fontSize: 14, marginBottom: 14, boxSizing: "border-box", outline: "none",
              }}
            />
            <div style={{ display: "flex", gap: 10 }}>
              <button type="submit" disabled={creating || !newName.trim()} style={{
                background: creating || !newName.trim() ? "#333" : "#3b82f6",
                border: "none", color: creating || !newName.trim() ? "#666" : "#fff",
                borderRadius: 8, padding: "8px 20px", fontSize: 13, fontWeight: 600,
                cursor: creating || !newName.trim() ? "default" : "pointer",
              }}>
                {creating ? "创建中…" : "创建"}
              </button>
              <button type="button" onClick={() => setShowCreate(false)} style={{
                background: "none", border: "1px solid #555", color: "#888",
                borderRadius: 8, padding: "8px 16px", fontSize: 13, cursor: "pointer",
              }}>
                取消
              </button>
            </div>
          </form>
        )}

        {/* 项目列表 */}
        {projects.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 0", color: "#666" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📂</div>
            <div style={{ fontSize: 15 }}>还没有项目</div>
            <div style={{ fontSize: 13, marginTop: 8 }}>点击"新建项目"开始创作</div>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 16 }}>
            {projects.map(p => (
              <div
                key={p.id}
                onClick={() => onSelect(p.id)}
                style={{
                  background: "#1a1a1a", border: "1px solid #333", borderRadius: 12,
                  padding: 20, cursor: "pointer", transition: "border-color 0.2s, transform 0.15s",
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "#3b82f6"; e.currentTarget.style.transform = "translateY(-2px)"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "#333"; e.currentTarget.style.transform = "none"; }}
              >
                <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>{p.name}</div>
                {p.description && (
                  <div style={{ fontSize: 13, color: "#888", marginBottom: 10, lineHeight: 1.4 }}>{p.description}</div>
                )}
                <div style={{ fontSize: 11, color: "#555" }}>
                  {p.id.slice(0, 12)}… · {new Date(p.updated_at || p.created_at).toLocaleDateString("zh-CN")}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
