import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("react-router-dom")) return "react-router";
          if (id.includes("sonner")) return "sonner";
          if (id.includes("cmdk")) return "cmdk";
          if (id.includes("chart.js") || id.includes("react-chartjs-2")) return "chart.js";
          if (id.includes("@xyflow")) return "xyflow";
          if (id.includes("lodash")) return "vendor";
        },
      },
    },
  },
  server: {
    port: 20130,
    proxy: {
      "/api": "http://localhost:20129",
      "/v1": "http://localhost:20129",
    },
  },
  preview: {
    port: 20128,
    host: "0.0.0.0",
    allowedHosts: ["ai.mylast.io.vn", "localhost"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
