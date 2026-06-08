import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  root: '.',
  base: '/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 2500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Stable vendor chunk — keep react, react-dom, react-router, recharts,
          // lucide and framer-motion together since they share createContext and
          // cannot safely be split across chunks (createContext race = blank prod).
          if (
            id.includes('node_modules/react/') ||
            id.includes('node_modules/react-dom/') ||
            id.includes('node_modules/react-router') ||
            id.includes('node_modules/scheduler/') ||
            id.includes('node_modules/recharts/') ||
            id.includes('node_modules/lucide-react/') ||
            id.includes('node_modules/framer-motion/') ||
            id.includes('node_modules/qrcode.react/')
          ) {
            return 'vendor-react';
          }
          // All other node_modules in a shared vendor chunk
          if (id.includes('node_modules')) {
            return 'vendor-other';
          }
        },
      },
    },
  },
  server: {
    port: 3000,
  },
});
