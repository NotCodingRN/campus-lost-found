import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  // `npm run dev` only: forward /api to a backend on localhost:3000 (in Docker, Nginx does this).
  server: { port: 5173, proxy: { '/api': 'http://localhost:3000' } },
});
