import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// UI (React + Vite) servida estática pelo Fastify em produção.
// Em dev, o Vite faz proxy de /api para o backend Fastify.
export default defineConfig({
  root: "src/ui",
  plugins: [react()],
  build: {
    outDir: "../../dist/ui",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3000",
    },
  },
});
