import path from "path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { inspectAttr } from "kimi-plugin-inspect-react";

// https://vite.dev/config/
export default defineConfig({
  base: "./",
  plugins: [inspectAttr(), react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 3000,
    // Optional: add strictPort: true if you want Vite to fail if 3000 is busy
    strictPort: true,
  },
  assetsInclude: ["**/*.wasm"],
  optimizeDeps: {
    exclude: [
      "@openmeteo/weather-map-layer",
      "@openmeteo/file-reader",
      "@openmeteo/file-format-wasm",
    ],
  },
});
