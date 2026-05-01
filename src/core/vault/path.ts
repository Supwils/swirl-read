/**
 * Pure path utilities for vault paths.
 *
 * Vault paths are POSIX-style relative paths. These helpers handle
 * normalization, joining, and segmenting without any filesystem access.
 */

import type { VaultPath } from './types'

/**
 * Normalize a path: trim leading/trailing slashes, collapse repeated slashes.
 *
 * @example
 *   normalizePath("/foo//bar/")  // → "foo/bar"
 *   normalizePath("foo/bar")     // → "foo/bar"
 *   normalizePath("/")           // → ""
 */
export function normalizePath(path: string): VaultPath {
  return path
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '')
    .replace(/\/+/g, '/')
}

/**
 * Join path segments POSIX-style. Filters empty segments and normalizes.
 *
 * @example
 *   joinPath("career", "me", "me.md")  // → "career/me/me.md"
 *   joinPath("", "/foo/", "bar")       // → "foo/bar"
 */
export function joinPath(...segments: string[]): VaultPath {
  return normalizePath(segments.filter(Boolean).join('/'))
}

/**
 * Parent directory of a path. Returns `""` if the path is at the vault root.
 *
 * @example
 *   dirname("career/me/me.md")  // → "career/me"
 *   dirname("readme.md")        // → ""
 *   dirname("")                 // → ""
 */
export function dirname(path: VaultPath): VaultPath {
  const idx = path.lastIndexOf('/')
  return idx === -1 ? '' : path.slice(0, idx)
}

/**
 * Final path segment (file or directory name).
 *
 * @example
 *   basename("career/me/me.md")  // → "me.md"
 *   basename("readme.md")        // → "readme.md"
 *   basename("")                 // → ""
 */
export function basename(path: VaultPath): string {
  const idx = path.lastIndexOf('/')
  return idx === -1 ? path : path.slice(idx + 1)
}

/**
 * File extension including the leading dot, lowercased.
 * Returns `""` for files with no extension or dotfiles.
 *
 * @example
 *   extname("me.md")          // → ".md"
 *   extname("Image.PNG")      // → ".png"
 *   extname("Makefile")       // → ""
 *   extname(".gitignore")     // → ""
 */
export function extname(path: VaultPath): string {
  const base = basename(path)
  const dot = base.lastIndexOf('.')
  if (dot <= 0) return ''
  return base.slice(dot).toLowerCase()
}

/**
 * Split a path into its segments.
 *
 * @example
 *   splitPath("career/me/me.md")  // → ["career", "me", "me.md"]
 *   splitPath("")                 // → []
 */
export function splitPath(path: VaultPath): string[] {
  const normalized = normalizePath(path)
  return normalized === '' ? [] : normalized.split('/')
}

/** Whether the path is a Markdown file (`.md` or `.mdx`). */
export function isMarkdown(path: VaultPath): boolean {
  const ext = extname(path)
  return ext === '.md' || ext === '.mdx'
}

/** Whether the path is an image file we know how to render. */
export function isImage(path: VaultPath): boolean {
  return ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.svg'].includes(
    extname(path),
  )
}

/**
 * Check whether `child` is contained within `parent` (or equals it).
 *
 * @example
 *   isWithin("career/me/me.md", "career")     // → true
 *   isWithin("career", "career")              // → true
 *   isWithin("knowledge", "career")           // → false
 */
export function isWithin(child: VaultPath, parent: VaultPath): boolean {
  if (parent === '') return true
  if (child === parent) return true
  return child.startsWith(`${parent}/`)
}
