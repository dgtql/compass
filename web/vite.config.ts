import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// Output goes into ../compass/static/ so FastAPI's existing StaticFiles
// mount keeps serving it from /static. `base: '/static/'` rewrites asset
// URLs in the production bundle to match that mount; in dev we want the
// app at `/` so `http://localhost:5173/` Just Works.
export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === 'build' ? '/static/' : '/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: path.resolve(__dirname, '../compass/static'),
    emptyOutDir: true,
    sourcemap: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:8000',
    },
  },
}));
