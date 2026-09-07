import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src/tracker', import.meta.url)),
    },
  },
  optimizeDeps: {
    include: ['recharts', 'aos', 'framer-motion'],
  },
  build: {
    outDir: 'out',
    emptyOutDir: true,
  },
  server: {
    host: true,
    port: 5174,
    strictPort: true,
    proxy: {
      '/api': { target: 'http://localhost:3060', changeOrigin: true },
      '/storage': { target: 'http://localhost:3060', changeOrigin: true },
    },
  },
})
