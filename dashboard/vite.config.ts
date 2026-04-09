import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 20130,
    proxy: {
      "/api": "http://localhost:20129",
      "/v1":  "http://localhost:20129",
    },
  },
  preview: {
    port: 20128,
    allowedHosts: ["ai.mylast.io.vn", "localhost"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});