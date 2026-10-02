/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages serves the app from /<repo>/; local dev and tests stay at the root.
  base: process.env.PAGES_BASE_PATH ?? '/',
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./src/test/setup.ts'],
    clearMocks: true,
    // Full click-path UI tests run slower on CI runners than locally.
    testTimeout: 20000,
  },
})
