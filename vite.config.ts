import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viewApiPlugin } from "./server/plugins/view-api";

export default defineConfig({
  plugins: [react(), viewApiPlugin()],
  server: { port: 5199 },
});
