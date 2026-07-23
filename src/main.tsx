import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import TimelineViewer from "./TimelineViewer";

function App() {
  // Parse project id from hash: #/view/<id> or query: ?id=<id>
  const params = new URLSearchParams(window.location.search);
  const hashId = window.location.hash.replace("#/view/", "");
  const [projectId, setProjectId] = useState(params.get("id") ?? hashId ?? "");

  if (!projectId) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🎬</div>
          <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); setProjectId(fd.get("id") as string); }}>
            <input name="id" placeholder="输入 Project ID" style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #444", background: "#222", color: "#eee", fontSize: 14, width: 280 }} />
            <button type="submit" style={{ marginLeft: 8, padding: "8px 16px", borderRadius: 6, border: "none", background: "#3b82f6", color: "#fff", cursor: "pointer", fontSize: 14 }}>查看</button>
          </form>
        </div>
      </div>
    );
  }

  return <TimelineViewer projectId={projectId} />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode><App /></StrictMode>
);
