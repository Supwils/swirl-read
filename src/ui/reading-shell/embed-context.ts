import { createContext } from 'react'
import type { Components } from 'hast-util-to-jsx-runtime'
import type { VaultPath } from '@/core/vault'

export interface EmbedContextValue {
  /**
   * Stack of paths currently being rendered as embeds, oldest → newest.
   * Includes the current document path. Used by `EmbedNode` to detect
   * cycles (e.g. A embeds B which embeds A) and to enforce a depth limit.
   */
  stack: VaultPath[]
  /**
   * Custom components map passed to `renderMarkdown` when expanding nested
   * markdown embeds. Includes the wikilink/callout/embed mappings so that
   * embedded files render with the same surface as the parent document.
   */
  components: Partial<Components>
}

/** Hard cap on nested embed depth — protects against pathological vaults. */
export const MAX_EMBED_DEPTH = 3

export const EmbedContext = createContext<EmbedContextValue>({
  stack: [],
  components: {},
})
