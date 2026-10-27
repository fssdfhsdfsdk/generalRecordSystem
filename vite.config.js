import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The production bundle is served by the Python backend on port 8765.
// During frontend development, /api is proxied to the same backend.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    watch: {
      // Browser profiles and the SQLite database change constantly; watching
      // them can crash the dev server with EBUSY on Windows.
      ignored: ['**/.tmp/**', '**/data/**', '**/dist/**'],
    },
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8765',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
  },
})
