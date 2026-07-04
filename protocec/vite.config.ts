import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';

// Local dev proxies /api → the live CEC backend so the Concierge runs against
// real Goldrush data without CORS. In production the Cloudflare Worker
// (worker/index.ts) does the same proxy, so the app only ever calls same-origin /api.
export default defineConfig({
  plugins: [react(), tailwind()],
  server: {
    proxy: {
      '/api': { target: 'https://cec.vantax.co.za', changeOrigin: true, secure: true },
    },
  },
});
