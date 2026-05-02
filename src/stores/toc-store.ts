/**
 * TOC + context-rail store — transient per-document state for the
 * right-rail surface (M4.6 + RX4).
 *
 * Why separate from `useReaderStore`: reader state is per-vault and
 * persisted; right-rail state is per-document and ephemeral. Keeping
 * them apart avoids tempting future code to persist heading lists,
 * tag counts, etc., which would invert the source-of-truth (the
 * document IS the headings + tags + links).
 *
 * DocumentPage publishes headings + context counts after each render;
 * `TableOfContents` subscribes to render the rail.
 *
 * RX4 added the `context` slot so the rail can show compact modules
 * (page tags, backlinks count, outgoing-link count) without a second
 * store. They live alongside `headings` because they're all "what is
 * this document about right now" data.
 */

import { create } from 'zustand'
import type { DocumentHeading } from '@/core/navigation/headings'
import type { VaultId, VaultPath } from '@/core/vault'

export interface DocumentContext {
  /** Vault id of the currently-rendered document, or null. */
  vaultId: VaultId | null
  /** Vault-relative path of the currently-rendered document, or null. */
  path: VaultPath | null
  /** Distinct tags referenced by the document (body + frontmatter). */
  tags: string[]
  /** Number of distinct wikilink targets in the document body. */
  outgoingLinks: number
}

const EMPTY_CONTEXT: DocumentContext = {
  vaultId: null,
  path: null,
  tags: [],
  outgoingLinks: 0,
}

interface TocStoreState {
  headings: DocumentHeading[]
  activeId: string | null
  context: DocumentContext
}

interface TocStoreActions {
  setHeadings: (headings: DocumentHeading[]) => void
  setActiveId: (id: string | null) => void
  setContext: (context: DocumentContext) => void
  clear: () => void
}

export type TocStore = TocStoreState & TocStoreActions

export const useTocStore = create<TocStore>((set) => ({
  headings: [],
  activeId: null,
  context: EMPTY_CONTEXT,

  setHeadings(headings) {
    set((state) => {
      // Cheap structural identity check — avoids redundant rerenders when
      // DocumentPage re-runs its heading effect with the same content.
      if (areHeadingsEqual(state.headings, headings)) return state
      return {
        headings,
        // Reset active id when headings change so the previous doc's
        // highlight doesn't briefly carry over.
        activeId: null,
      }
    })
  },

  setActiveId(id) {
    set((state) => (state.activeId === id ? state : { activeId: id }))
  },

  setContext(context) {
    set((state) =>
      areContextsEqual(state.context, context) ? state : { context },
    )
  },

  clear() {
    set({ headings: [], activeId: null, context: EMPTY_CONTEXT })
  },
}))

function areContextsEqual(a: DocumentContext, b: DocumentContext): boolean {
  if (a === b) return true
  if (a.vaultId !== b.vaultId) return false
  if (a.path !== b.path) return false
  if (a.outgoingLinks !== b.outgoingLinks) return false
  if (a.tags.length !== b.tags.length) return false
  for (let i = 0; i < a.tags.length; i += 1) {
    if (a.tags[i] !== b.tags[i]) return false
  }
  return true
}

function areHeadingsEqual(a: DocumentHeading[], b: DocumentHeading[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    const left = a[i]
    const right = b[i]
    if (!left || !right) return false
    if (
      left.id !== right.id ||
      left.level !== right.level ||
      left.text !== right.text
    ) {
      return false
    }
  }
  return true
}
