/**
 * TableOfContents — right-rail context surface for the active document.
 *
 * Two stacked modules per the RX4 craft plan:
 *
 *   1. **Context** (compact, optional) — page tags, backlinks count,
 *      outgoing-link count. Each chip hides itself when it has nothing
 *      to show, so a fresh untagged note doesn't get a noisy module.
 *   2. **TOC** (primary content) — H1–H4 list with scroll-spy active
 *      highlight (M4.6).
 *
 * The whole rail collapses (renders nothing) when there are no headings
 * AND no context modules — RX4's "documents without headings do not
 * show a distracting 'No headings' rail" requirement.
 *
 * Active heading detection uses an observer with a top margin equal to the
 * sticky header height plus a small buffer; the heading whose top edge sits
 * just below the header is considered "active." Very short documents may
 * never trigger an intersection event for the lowest heading, so we fall
 * back to "last heading" once the user is within one viewport of the end.
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Hash, Link as LinkIcon, MessageSquare } from 'lucide-react'
import { useTocStore } from '@/stores/toc-store'
import { useTagStore } from '@/stores/tag-store'
import { getBacklinksForFile } from '@/core/navigation/backlinks'
import type { DocumentHeading } from '@/core/navigation/headings'
import type { VaultId, VaultPath } from '@/core/vault'

const HEADING_OBSERVER_OPTIONS: IntersectionObserverInit = {
  // Header is 48 px; subtract that and a small buffer so the active mark
  // flips just before the heading slides under the chrome.
  rootMargin: '-72px 0px -55% 0px',
  threshold: [0, 1],
}

export function TableOfContents(): ReactNode {
  const headings = useTocStore((state) => state.headings)
  const activeId = useTocStore((state) => state.activeId)
  const setActiveId = useTocStore((state) => state.setActiveId)
  const context = useTocStore((state) => state.context)
  const backlinkCount = useBacklinkCount(context.vaultId, context.path)
  const hasContext =
    context.tags.length > 0 || context.outgoingLinks > 0 || backlinkCount > 0

  // Watch heading positions whenever the heading list changes. We re-observe
  // each list afresh because element identity changes when the document
  // re-renders.
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (headings.length === 0) {
      setActiveId(null)
      return
    }

    const elements = headings
      .map((h) => document.getElementById(h.id))
      .filter((el): el is HTMLElement => el !== null)
    if (elements.length === 0) return

    const visibleSet = new Set<string>()
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const id = entry.target.id
        if (!id) continue
        if (entry.isIntersecting) visibleSet.add(id)
        else visibleSet.delete(id)
      }
      // Pick the topmost heading currently in the visible band, falling
      // back to the last heading whose top is above the viewport center
      // (so the active state never goes blank between sections).
      let nextActive: string | null = null
      for (const heading of headings) {
        if (visibleSet.has(heading.id)) {
          nextActive = heading.id
          break
        }
      }
      if (nextActive === null) {
        const scrollMid =
          window.scrollY + window.innerHeight / 2 - 80 /* header band */
        let candidate: string | null = null
        for (const heading of headings) {
          const el = document.getElementById(heading.id)
          if (!el) continue
          if (el.getBoundingClientRect().top + window.scrollY <= scrollMid) {
            candidate = heading.id
          } else {
            break
          }
        }
        nextActive = candidate ?? headings[0]?.id ?? null
      }
      setActiveId(nextActive)
    }, HEADING_OBSERVER_OPTIONS)

    elements.forEach((el) => observer.observe(el))
    return () => {
      observer.disconnect()
    }
  }, [headings, setActiveId])

  // Pre-compute indent classes once. Levels begin at the smallest level
  // present so a doc whose deepest heading is H3 doesn't waste indent on a
  // missing H1/H2 column.
  const minLevel = useMemo(
    () => headings.reduce((min, h) => Math.min(min, h.level), 6),
    [headings],
  )

  // RX4: rail collapses entirely when there's nothing meaningful to
  // show — no headings AND no context chips. Better to have a quiet
  // empty space than to have "No headings" competing with the prose.
  if (headings.length === 0 && !hasContext) return null

  return (
    <nav className="swilread-toc" aria-label="Document context">
      {hasContext && (
        <ContextRail
          tags={context.tags}
          backlinkCount={backlinkCount}
          outgoingLinks={context.outgoingLinks}
        />
      )}
      {headings.length > 0 && (
        <div className="swilread-toc__group">
          <p className="swilread-toc__title">On this page</p>
          <ul className="swilread-toc__list">
            {headings.map((heading) => (
              <TocItem
                key={heading.id}
                heading={heading}
                active={heading.id === activeId}
                indent={Math.max(0, heading.level - minLevel)}
              />
            ))}
          </ul>
        </div>
      )}
    </nav>
  )
}

/* ─── Context modules (RX4) ──────────────────────────────────────── */

function ContextRail({
  tags,
  backlinkCount,
  outgoingLinks,
}: {
  tags: string[]
  backlinkCount: number
  outgoingLinks: number
}): ReactNode {
  const selectTag = useTagStore((state) => state.selectTag)
  return (
    <section className="swilread-toc__context" aria-label="Page context">
      {tags.length > 0 && (
        <div
          className="swilread-toc__context-group"
          aria-label="Tags on this page"
        >
          <Hash
            className="swilread-toc__context-icon"
            size={11}
            aria-hidden="true"
          />
          <ul className="swilread-toc__tag-list">
            {tags.slice(0, 6).map((tag) => (
              <li key={tag}>
                <button
                  type="button"
                  className="swilread-toc__tag"
                  onClick={() => selectTag(tag)}
                  aria-label={`Show files tagged #${tag}`}
                >
                  {tag}
                </button>
              </li>
            ))}
            {tags.length > 6 && (
              <li className="swilread-toc__tag-more" aria-hidden="true">
                +{String(tags.length - 6)}
              </li>
            )}
          </ul>
        </div>
      )}
      {(backlinkCount > 0 || outgoingLinks > 0) && (
        <div
          className="swilread-toc__context-counts"
          aria-label="Links to and from this page"
        >
          {backlinkCount > 0 && (
            <span
              className="swilread-toc__count"
              title={`${String(backlinkCount)} other note${
                backlinkCount === 1 ? '' : 's'
              } link here`}
            >
              <MessageSquare
                className="swilread-toc__context-icon"
                size={11}
                aria-hidden="true"
              />
              {backlinkCount} backlink{backlinkCount === 1 ? '' : 's'}
            </span>
          )}
          {outgoingLinks > 0 && (
            <span
              className="swilread-toc__count"
              title={`${String(outgoingLinks)} note${
                outgoingLinks === 1 ? '' : 's'
              } referenced from this page`}
            >
              <LinkIcon
                className="swilread-toc__context-icon"
                size={11}
                aria-hidden="true"
              />
              {outgoingLinks} link{outgoingLinks === 1 ? '' : 's'} out
            </span>
          )}
        </div>
      )}
    </section>
  )
}

/**
 * Fetches the live backlinks count for the current document. Re-runs
 * whenever the doc changes. Cached in `caches` Map inside the backlinks
 * module — Dexie hit only on first read of a vault.
 */
function useBacklinkCount(
  vaultId: VaultId | null,
  path: VaultPath | null,
): number {
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!vaultId || !path) {
      setCount(0)
      return
    }
    let cancelled = false
    void getBacklinksForFile(vaultId, path)
      .then((rows) => {
        if (!cancelled) setCount(rows.length)
      })
      .catch(() => {
        if (!cancelled) setCount(0)
      })
    return () => {
      cancelled = true
    }
  }, [vaultId, path])

  return count
}

interface TocItemProps {
  heading: DocumentHeading
  active: boolean
  indent: number
}

function TocItem({ heading, active, indent }: TocItemProps): ReactNode {
  const onClick = (event: React.MouseEvent<HTMLAnchorElement>): void => {
    event.preventDefault()
    const target = document.getElementById(heading.id)
    if (!target) return
    // Account for the sticky header so the heading is not hidden under it.
    const headerOffset = 64
    const top =
      target.getBoundingClientRect().top + window.scrollY - headerOffset
    window.scrollTo({ top, left: 0, behavior: 'smooth' })
    // Update the URL hash so the section is shareable / back-button-able.
    if (history.replaceState) {
      history.replaceState(null, '', `#${heading.id}`)
    }
  }

  return (
    <li
      className="swilread-toc__item"
      data-level={heading.level}
      style={{ paddingLeft: `${indent * 12}px` }}
    >
      <a
        href={`#${heading.id}`}
        className={
          active ? 'swilread-toc__link is-active' : 'swilread-toc__link'
        }
        aria-current={active ? 'location' : undefined}
        onClick={onClick}
      >
        {heading.text || '(untitled)'}
      </a>
    </li>
  )
}
