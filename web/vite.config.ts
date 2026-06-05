import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// In dev the API runs separately on :3000; proxy /api so the app can use
// same-origin relative URLs that also work in the single-container build.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
  build: {
    outDir: 'dist',
  },
});
