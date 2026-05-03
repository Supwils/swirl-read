/**
 * Derive the active document's vault-relative path from the URL.
 *
 * Both `AppShell` (header tab strip) and `VaultLayout` (sidebar +
 * outlet) need this same translation: take the React-Router splat after
 * `/app/:vaultId/`, decode each segment, drop empties, rejoin. Pulling
 * it into one place avoids drifting decoders if the route shape ever
 * gains a query parameter or extra segment.
 *
 * The `slice(3)` step skips the leading empty (from the leading `/`),
 * `app`, and `:vaultId` segments — yielding the file path that
 * `DocumentPage` consumes via `useParams()['*']`.
 */
export function deriveCurrentPathFromPathname(pathname: string): string {
  return pathname
    .split('/')
    .slice(3)
    .map((segment) => safeDecode(segment))
    .filter(Boolean)
    .join('/')
}

/**
 * Decode a single path segment, returning the raw segment unchanged
 * when `decodeURIComponent` rejects malformed `%` sequences. Routes in
 * the wild can carry stray percents from copy-paste; we'd rather
 * preserve those than crash the layout.
 */
function safeDecode(segment: string): string {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}
