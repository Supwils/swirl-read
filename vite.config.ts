import { fileURLToPath, URL } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// All browsers SwirlRead targets (File System Access API requirement) ship
// native color-mix() support: Chrome ≥ 111, Edge ≥ 111, Firefox ≥ 113,
// Safari ≥ 16.2. Lightning CSS still wraps color-mix() in
// @supports (color:color-mix(in lab,red,red)) guards during the compile step
// because @tailwindcss/vite processes each @imported CSS shard independently
// before the modern-target optimize pass runs. Stripping those wrappers in a
// post-bundle step is safe and shrinks the CSS bundle to its expected size.
function stripColorMixSupports(): Plugin {
  const GUARD = '@supports (color:color-mix(in lab,red,red)){'

  function unwrap(css: string): string {
    let result = ''
    let i = 0
    while (i < css.length) {
      const idx = css.indexOf(GUARD, i)
      if (idx === -1) {
        result += css.slice(i)
        break
      }
      result += css.slice(i, idx)
      let depth = 0
      let j = idx
      while (j < css.length) {
        if (css[j] === '{') depth++
        else if (css[j] === '}') {
          depth--
          if (depth === 0) {
            result += css.slice(idx + GUARD.length, j)
            i = j + 1
            break
          }
        }
        j++
      }
      if (depth !== 0) {
        result += css.slice(idx)
        break
      }
    }
    return result
  }

  return {
    name: 'strip-color-mix-supports',
    apply: 'build',
    generateBundle(_, bundle) {
      for (const file of Object.values(bundle)) {
        if (
          file.type === 'asset' &&
          typeof file.source === 'string' &&
          file.fileName.endsWith('.css')
        ) {
          file.source = unwrap(file.source)
        }
      }
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), stripColorMixSupports()],
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
