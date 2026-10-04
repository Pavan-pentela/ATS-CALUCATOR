import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 9092,
    proxy: {
      // Forward /api/gemini/* → Google Gemini API (bypasses CORS)
      '/api/gemini': {
        target: 'https://generativelanguage.googleapis.com',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api\/gemini/, ''),
      },
      // Forward /webhook/* to n8n (optional fallback)
      '/webhook': {
        target: 'http://localhost:9091',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
