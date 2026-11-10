import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// KaTeX ships each math font as woff2 + woff + ttf. Every current browser
// supports woff2, so strip the two legacy sources before Vite resolves font
// URLs. This keeps dist/assets at ~250 KB instead of ~1 MB.
function katexWoff2Only() {
  return {
    name: 'katex-woff2-only',
    enforce: 'pre',
    transform(code, id) {
      const file = id.split('?')[0]
      if (!file.includes('katex') || !file.endsWith('.css')) return null
      return code
        .replace(/,\s*url\([^)]*\.woff\)\s*format\("woff"\)/g, '')
        .replace(/,\s*url\([^)]*\.ttf\)\s*format\("truetype"\)/g, '')
    },
  }
}

// The production bundle is served by the Python backend on port 8765.
// During frontend development, /api is proxied to the same backend.
export default defineConfig({
  plugins: [katexWoff2Only(), react()],
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
