import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

function normalizeUpstream(u) {
  const s = String(u ?? "").trim().replace(/\/+$/, "");
  if (!s) return "";
  return s.endsWith("/v1") ? s.slice(0, -3) : s;
}

const LLM_UPSTREAM = normalizeUpstream(process.env.MCCC_LLM_UPSTREAM);
const VITE_LLM_API_URL = String(process.env.VITE_LLM_API_URL ?? "").trim();
const ENABLE_DEV_PROXY = VITE_LLM_API_URL.startsWith("/llm") && !!LLM_UPSTREAM;

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5174,
    strictPort: true,
    proxy: ENABLE_DEV_PROXY
      ? {
          // Browser -> Vite (same-origin) -> RunPod (server-side), avoids CORS.
          "/llm": {
            target: LLM_UPSTREAM,
            changeOrigin: true,
            secure: true,
            rewrite: (path) => path.replace(/^\/llm/, ""),
          },
        }
      : undefined,
  },
});
