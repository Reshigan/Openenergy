import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  root: '.',
  base: '/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Vendor split — pulls the three largest dependency families into their
    // own chunks so the main bundle doesn't ship them up front. Without this
    // the SPA was 1.9 MB single chunk (gzip 503 KB); after split the main
    // chunk drops to ~1 MB and each vendor chunk is only loaded when the
    // first page that uses it is opened. Material impact on first-paint
    // over 4G (most South African mobile users) and on the worker.dev
    // fallback URL where assets aren't on the global CDN.
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('node_modules/recharts/')) return 'vendor-recharts';
          if (id.includes('node_modules/jspdf/') ||
              id.includes('node_modules/html2canvas/')) return 'vendor-pdf';
          if (id.includes('node_modules/lucide-react/')) return 'vendor-lucide';
          if (id.includes('node_modules/react/') ||
              id.includes('node_modules/react-dom/') ||
              id.includes('node_modules/react-router-dom/') ||
              id.includes('node_modules/scheduler/')) return 'vendor-react';
          return 'vendor-misc';
        },
      },
    },
  },
  server: {
    port: 3000,
  },
});
