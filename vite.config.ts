import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { codexBridgePlugin } from './vite.codex-bridge'

export default defineConfig({
  plugins: [react(), tailwindcss(), codexBridgePlugin()],
  // Clear env for Tauri host detection
  clearScreen: false,
  server: {
    strictPort: true,
    port: 5173,
    proxy: {
      '/api/codex-auth': {
        target: 'https://auth.openai.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/codex-auth/, '/api/accounts'),
      },
    },
  },
  preview: {
    proxy: {
      '/api/codex-auth': {
        target: 'https://auth.openai.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/codex-auth/, '/api/accounts'),
      },
    },
  },
})
