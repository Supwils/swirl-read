/**
 * Tag store (M3.14) — transient state for the active tag selection.
 *
 * Stays out of `useUIStore` (presentation) and `useReaderStore`
 * (per-vault recents/scroll). Tag selection is per-document context:
 * the user clicks a `<tag>`, an overlay opens listing every file with
 * that tag, navigation closes the overlay. None of this should persist.
 *
 * The tag *index* is fetched on-demand by `TagsPanel` via
 * `tag-index-cache.ts` (per-vault promise cache, similar shape to the
 * walked-files cache). Keeping the index out of this store avoids
 * duplicating large data structures across React renders.
 */

import { create } from 'zustand'

interface TagStoreState {
  /** Currently selected tag (normalized, no leading `#`), or null. */
  selectedTag: string | null
}

interface TagStoreActions {
  selectTag: (tag: string | null) => void
  clear: () => void
}

export type TagStore = TagStoreState & TagStoreActions

export const useTagStore = create<TagStore>((set) => ({
  selectedTag: null,
  selectTag(tag) {
    set({ selectedTag: tag })
  },
  clear() {
    set({ selectedTag: null })
  },
}))
