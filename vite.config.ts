import { fileURLToPath, URL } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

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
  plugins: [
    react(),
    tailwindcss(),
    stripColorMixSupports(),
    // PWA: installable + offline-capable. Local-first already keeps vault
    // CONTENT off the network (File System Access API), so the service worker
    // only needs to make the APP SHELL available offline. We precache the
    // shell (entry JS/CSS + html) and runtime-cache fonts and the many lazy
    // chunks (Shiki grammars, KaTeX, Mermaid, editor) on first use rather than
    // precaching megabytes of grammars/CJK fonts up front.
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'SwirlRead',
        short_name: 'SwirlRead',
        description:
          'Read your knowledge. Beautifully. A local-first Markdown reader.',
        theme_color: '#8b6f47',
        background_color: '#f4ecd8',
        display: 'standalone',
        // Installed launches go straight into the app (auto-restores the last
        // vault), not the marketing landing page at '/'. `scope` stays '/' so
        // the landing page is still in-scope.
        start_url: '/app',
        scope: '/',
        icons: [
          {
            src: 'favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            // 'any' only — favicon.svg has no maskable safe-zone padding, so
            // claiming 'maskable' would crop on Android adaptive icons.
            purpose: 'any',
          },
        ],
      },
      workbox: {
        // Precache the SHELL ONLY (entry JS/CSS + html). Every font — the small
        // Latin woff2 subsets AND the ~1.5 MB CJK font AND the KaTeX fonts —
        // and every lazy chunk (Shiki grammars, KaTeX, Mermaid, editor) is
        // cached on first use via the runtime routes below, so a Latin-only
        // reader never downloads megabytes of CJK/math fonts up front.
        globPatterns: ['**/index-*.{js,css}', '**/*.html'],
        navigateFallback: 'index.html',
        // Only keep backend-style paths out of the SPA navigation fallback.
        // Do NOT denylist dotted paths: document URLs are
        // `/app/<vault>/<path>.md`, so a `/\.[^/]+$/` rule would wrongly
        // exclude them and break OFFLINE reload / deep-link of any note. Static
        // assets aren't navigation requests, so they never reach this fallback
        // and need no denylist entry.
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: ({ request }) =>
              request.destination === 'script' ||
              request.destination === 'style',
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'swirlread-chunks' },
          },
          {
            urlPattern: ({ request }) => request.destination === 'font',
            handler: 'CacheFirst',
            options: {
              cacheName: 'swirlread-fonts',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 90 },
            },
          },
        ],
      },
      // Keep the SW out of dev so HMR / the vault picker aren't shadowed.
      devOptions: { enabled: false },
    }),
  ],
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
    // Deliberately NOT the dev port (7945). `pnpm preview` serves the
    // production build, which registers the service worker; sharing the dev
    // port would leave that SW registered for localhost:7945 and let it shadow
    // a later `pnpm dev` (serving the cached prod shell instead of HMR). A
    // separate port keeps the PWA's SW scoped to preview only.
    port: 7946,
    strictPort: true,
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
})
