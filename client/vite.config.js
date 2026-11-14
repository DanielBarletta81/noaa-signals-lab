/* global process -- this file runs in Node when Vite loads it, not in the browser */
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Local development forwards /api to the Express server, so the browser uses
// same-origin relative URLs and no CORS setup is needed. Set API_PROXY_TARGET in
// the shell to point the proxy somewhere else. It is read here at build or dev
// time, not in the browser.
const apiProxy = {
  '/api': {
    target: process.env.API_PROXY_TARGET || 'http://localhost:4200',
    changeOrigin: true,
  },
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: apiProxy,
  },
  preview: {
    proxy: apiProxy,
  },
})
