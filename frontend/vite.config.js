﻿import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // 127.0.0.1 rather than localhost: the API binds IPv4 only.
      "/api": "http://127.0.0.1:4000",
    },
  },
  // Vitest transforms .jsx through esbuild rather than the React plugin, so it
  // needs the automatic runtime spelled out. Scoped to test mode so `vite build`
  // keeps using oxc without a conflicting-options warning.
  ...(mode === "test" ? { esbuild: { jsx: "automatic" } } : {}),
  test: {
    environment: "jsdom",
    globals: true,
  },
}));
