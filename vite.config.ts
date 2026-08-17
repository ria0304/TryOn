import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

// Backend now lives in ./backend (FastAPI, run separately via `uvicorn
// main:app --port 8000`). Proxy /api and /static so the frontend can keep
// calling relative paths in dev without needing VITE_API_URL set.
const BACKEND_URL = process.env.VITE_API_URL || 'http://localhost:8000';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      port: 3002,
      proxy: {
        '/api': { target: BACKEND_URL, changeOrigin: true },
        '/static': { target: BACKEND_URL, changeOrigin: true },
      },
    },
  };
});
