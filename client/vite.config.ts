import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const API_TARGET = process.env.VITE_API_TARGET ?? "http://localhost:3001";
const STANDALONE = process.env.VITE_STANDALONE === "true";

export default defineConfig({
  // Capacitor loads from file:// — relative asset paths are required.
  base: STANDALONE ? "./" : "/",
  plugins: [react()],
  server: {
    port: 5173,
    host: "0.0.0.0",
    proxy: STANDALONE
      ? undefined
      : {
          "/api": {
            target: API_TARGET,
            changeOrigin: true,
          },
        },
  },
});
