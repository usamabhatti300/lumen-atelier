/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

const apiPort = Number(process.env.API_PORT ?? 8787);
// Same isolation headers as server/app.ts, so multi-threaded WASM works in development too.
const isolation = { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' };

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
    },
  },
  worker: { format: 'es' },
  // Pre-bundle the ML runtime at startup; discovered later (it is only imported by the ML worker),
  // its large optimisation finished mid-session and forced a full page reload.
  optimizeDeps: { include: ['onnxruntime-web/webgpu', '@huggingface/transformers'] },
  server: {
    port: 5173,
    headers: isolation,
    proxy: { '/api': { target: `http://127.0.0.1:${apiPort}`, changeOrigin: false } },
  },
  preview: {
    port: 4173,
    headers: isolation,
    proxy: { '/api': { target: `http://127.0.0.1:${apiPort}`, changeOrigin: false } },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    chunkSizeWarningLimit: 900,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}', 'shared/**/*.test.ts', 'server/**/*.test.ts'],
    exclude: ['e2e/**', 'node_modules/**'],
  },
});
