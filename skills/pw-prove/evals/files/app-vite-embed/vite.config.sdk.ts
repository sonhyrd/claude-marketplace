import { defineConfig } from 'vite'
export default defineConfig({
  build: { outDir: 'dist/sdk', lib: { entry: 'src/sdk.ts', formats: ['iife'], name: 'Widget' } },
})
