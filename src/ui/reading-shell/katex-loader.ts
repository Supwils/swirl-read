/**
 * KaTeX runtime loader (M3.11) — module-level cache so multiple math
 * spans on the same page share a single dynamic import.
 *
 * Same shape as `mermaid-loader.ts`. Tests inject a stub via
 * `__setKatexLoaderForTests` so jsdom doesn't have to ship the real
 * KaTeX runtime.
 */

export interface RenderOptions {
  displayMode: boolean
  throwOnError: boolean
  output?: 'html' | 'mathml' | 'htmlAndMathml'
  strict?: boolean | 'ignore' | 'warn' | 'error'
  trust?: boolean
}

export interface KatexRuntime {
  renderToString: (source: string, options: RenderOptions) => string
}

let cachedRuntime: Promise<KatexRuntime> | null = null
let injectedLoader: (() => Promise<KatexRuntime>) | null = null

export function getKatex(): Promise<KatexRuntime> {
  if (injectedLoader) return injectedLoader()
  if (cachedRuntime) return cachedRuntime
  cachedRuntime = import('katex').then((mod) => {
    // KaTeX ships both default and named exports depending on bundler;
    // accept either shape and project the single function we use.
    const candidate = (mod.default ?? mod) as Partial<KatexRuntime>
    if (typeof candidate.renderToString !== 'function') {
      throw new Error('KaTeX module did not expose renderToString')
    }
    return { renderToString: candidate.renderToString }
  })
  return cachedRuntime
}

export function __setKatexLoaderForTests(
  loader: (() => Promise<KatexRuntime>) | null,
): void {
  injectedLoader = loader
  cachedRuntime = null
}
