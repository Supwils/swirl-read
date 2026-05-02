/**
 * Lazy loader + test override for the Mermaid runtime.
 *
 * Lives in its own module (separate from the React component) so the
 * component file can satisfy `react-refresh/only-export-components`. Tests
 * call {@link __setMermaidLoaderForTests} to inject a stub Mermaid that
 * doesn't require jsdom to grow an SVG implementation.
 */

// Minimal surface of the Mermaid runtime we depend on. Keeping this tight
// means a future major version with breaking changes only fails this file.
export interface MermaidLikeAPI {
  initialize(config: { startOnLoad: boolean; theme: string }): void
  render(
    id: string,
    source: string,
  ): Promise<{ svg: string; bindFunctions?: (el: Element) => void }>
}

export type MermaidLoader = () => Promise<MermaidLikeAPI>

const defaultLoader: MermaidLoader = async () => {
  const mod = (await import('mermaid')) as { default: MermaidLikeAPI }
  return mod.default
}

let loader: MermaidLoader = defaultLoader
let cachedRuntime: Promise<MermaidLikeAPI> | null = null

/**
 * Override the loader (used by tests to inject a stub Mermaid). Calling with
 * `null` resets to the default dynamic-import loader.
 */
export function __setMermaidLoaderForTests(next: MermaidLoader | null): void {
  loader = next ?? defaultLoader
  cachedRuntime = null
}

export function getMermaid(): Promise<MermaidLikeAPI> {
  cachedRuntime ??= loader()
  return cachedRuntime
}
