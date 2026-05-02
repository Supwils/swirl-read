import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// jsdom doesn't implement `URL.createObjectURL` for the duck-typed File
// objects we hand back from the mock filesystem (see
// `core/vault/__test-helpers__/mock-fs.ts`). Stub a deterministic blob
// URL so embed components can rely on a `blob:` src in tests without
// pulling in a real Blob roundtrip.
let mockBlobCounter = 0
if (typeof URL.createObjectURL !== 'function') {
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: (): string => `blob:mock://${++mockBlobCounter}`,
  })
}
if (typeof URL.revokeObjectURL !== 'function') {
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: (_url: string): void => {
      void _url
    },
  })
}

// jsdom does not implement IntersectionObserver. The TOC's scroll-spy uses
// it, and any test that mounts the vault layout (file tree, document page)
// will explode without this stub. We give it the minimum surface area the
// component touches; tests that care about observer behavior re-stub
// globally and reset in afterEach.
class JsdomIntersectionObserverStub {
  root: Element | Document | null = null
  rootMargin = ''
  thresholds: readonly number[] = []
  observe(): void {
    /* noop — tests that care about observer behavior provide their own stub */
  }
  unobserve(): void {
    /* noop */
  }
  disconnect(): void {
    /* noop */
  }
  takeRecords(): IntersectionObserverEntry[] {
    return []
  }
}
if (typeof globalThis.IntersectionObserver === 'undefined') {
  Object.defineProperty(globalThis, 'IntersectionObserver', {
    configurable: true,
    writable: true,
    value: JsdomIntersectionObserverStub,
  })
}

// jsdom does not implement ResizeObserver. cmdk (M5.1 command palette)
// uses it internally for its scrollable list; without a stub, mounting
// the palette in tests crashes.
class JsdomResizeObserverStub {
  observe(): void {
    /* noop */
  }
  unobserve(): void {
    /* noop */
  }
  disconnect(): void {
    /* noop */
  }
}
if (typeof globalThis.ResizeObserver === 'undefined') {
  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    writable: true,
    value: JsdomResizeObserverStub,
  })
}

// jsdom does not implement Element.scrollIntoView. cmdk calls it when
// the selected item changes so the active row scrolls into view.
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function (): void {
    /* noop — no real scrolling to perform under jsdom */
  }
}

afterEach(() => {
  cleanup()
})
