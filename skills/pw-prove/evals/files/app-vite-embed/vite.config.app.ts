import { defineConfig } from 'vite'
export default defineConfig({
  build: { outDir: 'dist/app' },
  define: { __DEV__: JSON.stringify(process.env.NODE_ENV !== 'production') },
})
