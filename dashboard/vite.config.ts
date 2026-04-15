import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Split chart.js + react-chartjs-2 into its own chunk (~200KB)
          "chart.js": ["chart.js", "react-chartjs-2"],
          // Split @xyflow/react (~200KB) into its own chunk
          "xyflow": ["@xyflow/react"],
          // Split lodash into its own chunk
          vendor: ["lodash"],
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
    allowedHosts: ["ai.mylast.io.vn", "localhost"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
