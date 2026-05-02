import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    // Project-dedicated port: 7945 = "SWIL" on a phone keypad
    // (S=7, W=9, I=4, L=5). Sits well above well-known services and is
    // not registered to any common dev tool, so collisions are rare.
    // `strictPort: true` makes a busy port fail loudly instead of
    // silently sliding to the next available one — better for spotting
    // a stray process than chasing a moving URL.
    port: 7945,
    strictPort: true,
  },
  preview: {
    // Match dev so `pnpm preview` (production build) reuses the same
    // bookmarkable URL.
    port: 7945,
    strictPort: true,
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
})
