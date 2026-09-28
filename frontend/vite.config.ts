/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    // The Playwright specs live in e2e/ and are run by Playwright, not vitest.
    // Without this vitest picks them up and fails on the missing runner.
    exclude: ['node_modules/**', 'dist/**', 'e2e/**'],
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        // Locally this is nginx on :80. CI has no nginx, so it points straight
        // at Django. changeOrigin rewrites the Host header to the target,
        // which is what TenantMiddleware resolves the gym from — so whatever
        // host is used here needs a TenantDomain row.
        target: process.env.VITE_API_PROXY_TARGET ?? 'http://localhost',
        changeOrigin: true,
      },
    },
  },
  // Expose VITE_* env variables to the browser bundle
  envPrefix: 'VITE_',
})
