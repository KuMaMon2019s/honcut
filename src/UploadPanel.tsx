// UploadPanel.tsx — 媒体上传面板
// 支持拖拽上传 + 文件选择，上传到 /api/upload?project_id=X

import { useState, useRef, useCallback } from "react";

interface UploadPanelProps {
  projectId: string;
  onUploaded: () => void; // 上传完成后刷新素材列表
}

interface UploadItem {
  name: string;
  status: "uploading" | "done" | "error";
  progress: number;
}

export default function UploadPanel({ projectId, onUploaded }: UploadPanelProps) {
  const [dragOver, setDragOver] = useState(false);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const doUpload = useCallback(async (files: FileList | File[]) => {
    const fileArr = Array.from(files);
    if (fileArr.length === 0) return;

    const newItems: UploadItem[] = fileArr.map(f => ({ name: f.name, status: "uploading", progress: 0 }));
    setUploads(prev => [...prev, ...newItems]);

    for (let i = 0; i < fileArr.length; i++) {
      const file = fileArr[i];
      const formData = new FormData();
      formData.append("file", file);
      formData.append("name", file.name);

      // Infer kind from mime
      const kind = file.type.startsWith("audio/") ? "audio" : file.type.startsWith("image/") ? "image" : "video";
      formData.append("kind", kind);

      try {
        const res = await fetch(`/api/upload?project_id=${encodeURIComponent(projectId)}`, {
          method: "POST",
          body: formData,
        });
        if (!res.ok) throw new Error(await res.text());
        setUploads(prev => prev.map((u, idx) => idx === prev.length - fileArr.length + i ? { ...u, status: "done", progress: 100 } : u));
      } catch {
        setUploads(prev => prev.map((u, idx) => idx === prev.length - fileArr.length + i ? { ...u, status: "error" } : u));
      }
    }

    onUploaded();
    // Clear completed after 3s
    setTimeout(() => setUploads([]), 3000);
  }, [projectId, onUploaded]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) doUpload(e.dataTransfer.files);
  }, [doUpload]);

  return (
    <div>
      {/* 拖拽区域 */}
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        style={{
          border: `2px dashed ${dragOver ? "#3b82f6" : "#444"}`,
          borderRadius: 8,
          padding: "16px 12px",
          textAlign: "center",
          cursor: "pointer",
          background: dragOver ? "#3b82f620" : "#1a1a1a",
          transition: "all 0.2s",
          marginBottom: 8,
        }}
      >
        <div style={{ fontSize: 20, marginBottom: 4 }}>📤</div>
        <div style={{ fontSize: 12, color: dragOver ? "#3b82f6" : "#888" }}>
          {dragOver ? "松开上传" : "拖拽文件到此处，或点击选择"}
        </div>
        <div style={{ fontSize: 10, color: "#555", marginTop: 4 }}>支持视频、音频、图片</div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="video/*,audio/*,image/*"
        style={{ display: "none" }}
        onChange={e => { if (e.target.files) doUpload(e.target.files); e.target.value = ""; }}
      />

      {/* 上传进度 */}
      {uploads.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {uploads.map((u, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 8,
              fontSize: 11, color: u.status === "error" ? "#ef4444" : u.status === "done" ? "#22c55e" : "#888",
              padding: "4px 8px", background: "#1a1a1a", borderRadius: 4,
            }}>
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {u.status === "uploading" ? "⏳" : u.status === "done" ? "✅" : "❌"} {u.name}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
