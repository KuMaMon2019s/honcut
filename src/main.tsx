import { StrictMode, Suspense, useState } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import ProjectList from "./ProjectList";
import TimelineViewer from "./TimelineViewer";

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
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode><App /></StrictMode>
);
