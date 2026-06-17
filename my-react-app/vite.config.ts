import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // forward /api/* and /test-status to the Express backend
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/test-status': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
