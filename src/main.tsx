import { Component, StrictMode, Suspense, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import ProjectList from "./ProjectList";
import TimelineViewer from "./TimelineViewer";

// use() reject 时会 throw — 需要 ErrorBoundary 兜底
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          height: "100vh", background: "#0f0f1a", color: "#e94560", gap: 12,
        }}>
          <span style={{ fontSize: 36 }}>😵</span>
          <span style={{ fontSize: 15, fontWeight: 600 }}>加载失败</span>
          <span style={{ fontSize: 13, color: "#8b95a5" }}>{this.state.error.message}</span>
          <button
            onClick={() => { this.setState({ error: null }); window.location.reload(); }}
            style={{
              marginTop: 8, padding: "8px 24px", borderRadius: 8,
              background: "#e94560", color: "#fff", border: "none", cursor: "pointer", fontSize: 13,
            }}
          >
            重试
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function App() {
  // Parse project id from hash: #/view/<id> or query: ?id=<id>
  const params = new URLSearchParams(window.location.search);
  const hashId = window.location.hash.replace("#/view/", "");
  const [projectId, setProjectId] = useState(params.get("id") ?? hashId ?? "");

  if (!projectId) {
    return <ProjectList onSelect={(id) => {
      window.location.hash = `#/view/${id}`;
      setProjectId(id);
    }} />;
  }

  return (
    <ErrorBoundary>
    <Suspense fallback={
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        height: "100vh", background: "#0f0f1a", color: "#8b95a5", fontSize: 14,
      }}>
        加载中…
      </div>
    }>
      <TimelineViewer projectId={projectId} onBack={() => {
        window.location.hash = "";
        setProjectId("");
      }} />
    </Suspense>
    </ErrorBoundary>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode><App /></StrictMode>
);
