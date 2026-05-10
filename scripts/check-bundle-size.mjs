#!/usr/bin/env node
/**
 * Bundle-size guard.
 *
 * Reads the `bundle-size.json` ceilings at the repo root and asserts
 * that each pattern's matching file in `dist/assets/` stays under the
 * configured gzipped limit. Designed to run after `pnpm build`, both
 * locally (`pnpm bundle:check`) and in CI.
 *
 * Why home-grown instead of `size-limit`:
 *   - zero new dev dependency
 *   - matches Vite's hashed-filename pattern out of the box
 *     (`CommandPalette-Brt8C9X4.js` → glob `^CommandPalette-.*\.js$`)
 *   - prints both current size and headroom, so a failing PR knows
 *     exactly how much to trim
 *
 * Config file shape (bundle-size.json at repo root):
 *
 *   {
 *     "limits": [
 *       { "name": "main bundle", "pattern": "^index-.*\\.js$",
 *         "limitGzKb": 280 },
 *       ...
 *     ]
 *   }
 *
 * Patterns are POSIX regexes against the basename inside dist/assets/.
 * The script picks the LARGEST file matching each pattern (some Vite
 * shards emit multiple files with the same prefix, e.g. main bundle
 * + an empty 0.14 KB index stub — we want the real artifact).
 */

import { gzipSync } from 'node:zlib'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(__dirname, '..')
const distAssets = join(repoRoot, 'dist', 'assets')
const configPath = join(repoRoot, 'bundle-size.json')

let config
try {
  const raw = readFileSync(configPath, 'utf8')
  config = JSON.parse(raw)
} catch (err) {
  console.error(`✖ Cannot read ${configPath}:`, err.message)
  process.exit(2)
}

if (!Array.isArray(config?.limits)) {
  console.error('✖ bundle-size.json must contain a top-level "limits" array')
  process.exit(2)
}

let assetFiles
try {
  assetFiles = readdirSync(distAssets)
} catch (err) {
  console.error(
    `✖ ${distAssets} not found — run \`pnpm build\` first.\n  ${err.message}`,
  )
  process.exit(2)
}

const KB = 1024
const failures = []
const summary = []

for (const limit of config.limits) {
  const { name, pattern, limitGzKb } = limit
  if (!name || !pattern || typeof limitGzKb !== 'number') {
    console.error(
      `✖ malformed limit entry; needs name, pattern, limitGzKb:`,
      limit,
    )
    process.exit(2)
  }

  const re = new RegExp(pattern)
  const matches = assetFiles
    .filter((f) => re.test(f))
    .map((f) => {
      const fullPath = join(distAssets, f)
      return { name: f, size: statSync(fullPath).size, fullPath }
    })

  if (matches.length === 0) {
    failures.push({
      name,
      pattern,
      reason: 'no file matched in dist/assets/',
    })
    continue
  }

  // Pick the largest file matching the pattern. Vite occasionally emits
  // a near-empty shim alongside the real chunk; ignoring everything but
  // the heaviest match avoids false positives there.
  const target = matches.reduce((a, b) => (a.size > b.size ? a : b))
  const buf = readFileSync(target.fullPath)
  const gzKb = gzipSync(buf, { level: 9 }).length / KB
  const headroomKb = limitGzKb - gzKb
  const status = gzKb <= limitGzKb ? 'ok' : 'fail'

  summary.push({
    name,
    file: target.name,
    gzKb: gzKb.toFixed(2),
    limitGzKb: limitGzKb.toFixed(2),
    headroomKb: headroomKb.toFixed(2),
    status,
  })

  if (status === 'fail') {
    failures.push({
      name,
      file: target.name,
      gzKb: gzKb.toFixed(2),
      limitGzKb: limitGzKb.toFixed(2),
      overBy: (-headroomKb).toFixed(2),
    })
  }
}

const longestName = Math.max(...summary.map((r) => r.name.length))
console.log('Bundle size budget:')
for (const row of summary) {
  const pad = row.name.padEnd(longestName)
  const icon = row.status === 'ok' ? '✓' : '✖'
  console.log(
    `  ${icon} ${pad}  ${row.gzKb} KB gz / ${row.limitGzKb} KB  (headroom ${row.headroomKb} KB)  → ${row.file}`,
  )
}

if (failures.length > 0) {
  console.error('\n✖ bundle-size budget exceeded:')
  for (const f of failures) {
    if (f.reason) {
      console.error(`    ${f.name} — ${f.reason} (pattern: ${f.pattern})`)
    } else {
      console.error(
        `    ${f.name} (${f.file}): ${f.gzKb} KB gz > ${f.limitGzKb} KB (over by ${f.overBy} KB)`,
      )
    }
  }
  console.error(
    '\nIf the growth is intentional, raise the limit in bundle-size.json — but document why in the commit message.',
  )
  process.exit(1)
}

console.log('\n✓ all bundle-size budgets respected.')
