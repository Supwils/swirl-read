import type { VaultFileSystem, VaultId, VaultPath } from '@/core/vault'
import { isMarkdown } from '@/core/vault'
import {
  buildWikilinkIndex,
  resolveWikilink,
} from '@/core/navigation/wikilink-resolver'
import { extractWikilinkReferences } from '@/core/navigation/backlinks'

export interface GraphNode {
  id: VaultPath
  label: string
  degree: number
}

export interface GraphEdge {
  source: VaultPath
  target: VaultPath
}

export interface VaultGraph {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

const MAX_NODES = 250
const graphCache = new Map<VaultId, Promise<VaultGraph>>()

export function getVaultGraph(vault: VaultFileSystem): Promise<VaultGraph> {
  const cached = graphCache.get(vault.id)
  if (cached) return cached
  const promise = buildVaultGraph(vault).catch((err: unknown) => {
    graphCache.delete(vault.id)
    throw err
  })
  graphCache.set(vault.id, promise)
  return promise
}

export function invalidateVaultGraph(vaultId: VaultId): void {
  graphCache.delete(vaultId)
}

async function buildVaultGraph(vault: VaultFileSystem): Promise<VaultGraph> {
  // Single walk to build the wikilink index; reuse its values for the node list.
  const wikilinkIndex = await buildWikilinkIndex(vault)

  const mdPaths = new Set<VaultPath>()
  for (const paths of wikilinkIndex.values()) {
    for (const path of paths) {
      if (isMarkdown(path)) mdPaths.add(path)
    }
  }

  // Extract outgoing links from each markdown file in parallel.
  const outgoing = new Map<VaultPath, Set<VaultPath>>()
  await Promise.all(
    Array.from(mdPaths).map(async (path) => {
      try {
        const raw = await vault.readText(path)
        const refs = extractWikilinkReferences(raw)
        const targets = new Set<VaultPath>()
        for (const ref of refs) {
          const resolved = resolveWikilink(ref.rawTarget, wikilinkIndex, path)
          if (resolved && resolved !== path) targets.add(resolved)
        }
        if (targets.size > 0) outgoing.set(path, targets)
      } catch {
        // unreadable file — skip without failing the whole graph
      }
    }),
  )

  // Degree = in-links + out-links (used for node sizing and culling).
  const degree = new Map<VaultPath, number>()
  // Only track nodes that participate in at least one edge.
  const connected = new Set<VaultPath>()
  for (const [src, targets] of outgoing) {
    for (const tgt of targets) {
      connected.add(src)
      connected.add(tgt)
      degree.set(src, (degree.get(src) ?? 0) + 1)
      degree.set(tgt, (degree.get(tgt) ?? 0) + 1)
    }
  }

  // Cull to the most-connected MAX_NODES (isolated nodes excluded entirely).
  const sorted = Array.from(connected).sort(
    (a, b) => (degree.get(b) ?? 0) - (degree.get(a) ?? 0),
  )
  const included = new Set(sorted.slice(0, MAX_NODES))

  const nodes: GraphNode[] = Array.from(included).map((id) => ({
    id,
    label: stripExt(id.split('/').at(-1) ?? id),
    degree: degree.get(id) ?? 0,
  }))

  const edgeSet = new Set<string>()
  const edges: GraphEdge[] = []
  for (const [src, targets] of outgoing) {
    if (!included.has(src)) continue
    for (const tgt of targets) {
      if (!included.has(tgt)) continue
      const key = `${src}\0${tgt}`
      if (!edgeSet.has(key)) {
        edgeSet.add(key)
        edges.push({ source: src, target: tgt })
      }
    }
  }

  return { nodes, edges }
}

function stripExt(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot === -1 ? name : name.slice(0, dot)
}
