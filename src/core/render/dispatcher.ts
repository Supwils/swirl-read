/**
 * Renderer dispatcher (M7.1 + M7.6).
 *
 * Decides — purely from the file path — which surface a non-directory file
 * should open into. The function is intentionally extension-driven and
 * synchronous; deeper sniffing (mime detection, magic-byte peek) belongs
 * later, behind this seam, if it ever proves necessary.
 *
 * Kinds returned today:
 *
 *   - `markdown` — the existing Markdown pipeline (`.md`, `.mdx`)
 *   - `text`     — plain-text monospace render (`.txt`, `.log`, …)
 *   - `code`     — Shiki-highlighted source code (`.ts`, `.py`, `.go`, …)
 *   - `media`    — native viewer over `vault.getBlobURL()`
 *                 (image / video / audio; M7.6)
 *   - `binary`   — anything we'd corrupt by `readText`-ing it AND can't
 *                 render natively in the browser (PDFs, archives, fonts,
 *                 unknown binaries)
 *
 * The result is a discriminated union so each kind can safely carry its
 * own auxiliary data (Shiki language id, media subtype) without optional
 * fields drifting into wrong shapes.
 */

import { extname, isMarkdown } from '@/core/vault'
import type { VaultPath } from '@/core/vault'

export type MediaKind = 'image' | 'video' | 'audio'

export type RendererDecision =
  | { kind: 'markdown' }
  | { kind: 'text' }
  | { kind: 'code'; language: string }
  | { kind: 'table'; delimiter: ',' | '\t' }
  | { kind: 'html' }
  | { kind: 'json' }
  | { kind: 'media'; media: MediaKind }
  | { kind: 'binary' }

const TEXT_EXTENSIONS = new Set(['.txt', '.log', '.text'])

/**
 * Delimited tabular files routed to the M7.3 table renderer. Anything else
 * tabular (.xlsx, .ods) is binary territory.
 */
const TABLE_DELIMITERS: Record<string, ',' | '\t'> = {
  '.csv': ',',
  '.tsv': '\t',
  '.tab': '\t',
}

/**
 * Source-code file extension → Shiki language id. The right side must be a
 * language already bundled by the pipeline (see `SHIKI_LANGS` in
 * `pipeline.ts`) or a string Shiki can lazy-load. Anything not in this map
 * falls through to the `text` kind, which still renders fine without
 * highlighting.
 */
const CODE_LANGUAGES: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'tsx',
  '.js': 'javascript',
  '.jsx': 'jsx',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.py': 'python',
  '.rs': 'rust',
  '.go': 'go',
  '.java': 'java',
  '.kt': 'kotlin',
  '.kts': 'kotlin',
  '.swift': 'swift',
  '.c': 'c',
  '.h': 'c',
  '.cpp': 'cpp',
  '.cc': 'cpp',
  '.cxx': 'cpp',
  '.hpp': 'cpp',
  '.cs': 'csharp',
  '.rb': 'ruby',
  '.php': 'php',
  '.sql': 'sql',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.toml': 'toml',
  '.css': 'css',
  '.scss': 'scss',
  '.less': 'less',
  '.xml': 'xml',
  '.sh': 'bash',
  '.bash': 'bash',
  '.zsh': 'bash',
  '.fish': 'fish',
  '.diff': 'diff',
  '.patch': 'diff',
  '.dockerfile': 'dockerfile',
}

/**
 * Media files that render via `vault.getBlobURL()` straight into a native
 * `<img>` / `<video>` / `<audio>`. The browser handles the bytes; we never
 * touch them as text.
 */
const MEDIA_EXTENSIONS: Record<string, MediaKind> = {
  // images (raster + svg — svg is technically text but visually is media)
  '.png': 'image',
  '.jpg': 'image',
  '.jpeg': 'image',
  '.gif': 'image',
  '.webp': 'image',
  '.avif': 'image',
  '.bmp': 'image',
  '.ico': 'image',
  '.svg': 'image',
  // video
  '.mp4': 'video',
  '.webm': 'video',
  '.mov': 'video',
  '.mkv': 'video',
  '.avi': 'video',
  '.m4v': 'video',
  // audio
  '.mp3': 'audio',
  '.wav': 'audio',
  '.ogg': 'audio',
  '.m4a': 'audio',
  '.flac': 'audio',
  '.aac': 'audio',
  '.opus': 'audio',
}

const BINARY_EXTENSIONS = new Set([
  // documents we can't render natively yet (M7.5 will tackle .html → iframe)
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.odt',
  '.ods',
  '.odp',
  '.epub',
  '.mobi',
  '.tiff',
  '.tif',
  // archives + binaries
  '.zip',
  '.tar',
  '.gz',
  '.tgz',
  '.bz2',
  '.7z',
  '.rar',
  '.dmg',
  '.iso',
  '.exe',
  '.dll',
  '.so',
  '.dylib',
  // fonts
  '.ttf',
  '.otf',
  '.woff',
  '.woff2',
  '.eot',
])

/**
 * Map a vault file path to the renderer kind that should handle it.
 *
 * Files with no extension (`Makefile`, `LICENSE`, `.gitignore`-as-the-whole-name,
 * etc.) default to `text` — most of those are human-readable and rendering a
 * "couldn't open this" card for them would feel obtuse.
 */
export function getRendererKind(path: VaultPath): RendererDecision {
  if (isMarkdown(path)) return { kind: 'markdown' }

  const ext = extname(path)
  // Media is checked before code so `.svg` resolves to image (visual asset),
  // not xml-source. Users opening logo.svg expect to see the picture.
  const mediaKind = MEDIA_EXTENSIONS[ext]
  if (mediaKind !== undefined) return { kind: 'media', media: mediaKind }

  const delimiter = TABLE_DELIMITERS[ext]
  if (delimiter !== undefined) return { kind: 'table', delimiter }

  // HTML files get a sandboxed iframe view by default; the dispatcher
  // surfaces them as their own kind so the renderer can offer a
  // source-toggle without owning the dispatcher decision.
  if (ext === '.html' || ext === '.htm') return { kind: 'html' }

  // JSON files get the M7.4 tree view by default. Source view (Shiki) is
  // available via a toggle inside the renderer.
  if (ext === '.json' || ext === '.jsonc') return { kind: 'json' }

  const language = CODE_LANGUAGES[ext]
  if (language !== undefined) return { kind: 'code', language }
  if (TEXT_EXTENSIONS.has(ext)) return { kind: 'text' }
  if (BINARY_EXTENSIONS.has(ext)) return { kind: 'binary' }

  // No extension → most likely a text-shaped config / readme; let the user
  // see it. Unknown extensions are treated as binary so we never feed
  // garbage bytes through readText.
  return ext === '' ? { kind: 'text' } : { kind: 'binary' }
}
