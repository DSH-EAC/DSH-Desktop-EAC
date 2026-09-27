import { defineConfig } from 'vite'

export default defineConfig({
  root: 'site',
  base: process.env.BASE_PATH || '/',
  publicDir: 'public',
  build: {
    outDir: '../dist',
    emptyOutDir: true
  }
})
