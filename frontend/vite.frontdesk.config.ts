import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  root: path.resolve(__dirname, "../frontdesk"),
  base: `${process.env.VITE_SITE_BASE || "/"}frontdesk/`,
  plugins: [react()],
  resolve: {
    alias: {
      "lucide-react": path.resolve(__dirname, "node_modules/lucide-react"),
      "react-dom": path.resolve(__dirname, "node_modules/react-dom"),
      react: path.resolve(__dirname, "node_modules/react"),
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5176,
    proxy: { "/api": "http://127.0.0.1:4100" },
  },
  build: { outDir: "dist", emptyOutDir: true },
});
