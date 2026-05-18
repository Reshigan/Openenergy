import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  root: '.',
  base: '/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Single-bundle build. We previously tried a manualChunks split
    // (recharts / jspdf / lucide / react / misc) which dropped the main
    // chunk from 1.9 MB → 834 KB, but it hit a top-level
    // `React.createContext` race in vendor-misc that left prod blank
    // until the rollback. Re-introducing the split requires explicitly
    // bundling each React-dependent package (qrcode.react, recharts,
    // lucide-react, …) into the same chunk as react itself — not
    // letting any of them fall into a catch-all.
    //
    // Until that's done carefully, ship a single bundle. The 1.9 MB / gzip
    // 503 KB main is acceptable for now; the chunk split can come back
    // as a follow-up with a real e2e test that proves no createContext
    // race.
  },
  server: {
    port: 3000,
  },
});
