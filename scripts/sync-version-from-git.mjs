/**
 * Sync app version from Git tag (or VERSION env for CI).
 *
 * Usage:
 *   node scripts/sync-version-from-git.mjs
 *   VERSION=1.2.0 node scripts/sync-version-from-git.mjs
 *
 * Resolves version as:
 *   1. process.env.VERSION (set by release workflow from the git tag)
 *   2. latest git tag matching v*.*.* (strips leading "v")
 */
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function resolveVersion() {
  if (process.env.VERSION?.trim()) {
    return process.env.VERSION.trim().replace(/^v/, '')
  }

  try {
    const tag = execSync('git describe --tags --abbrev=0', {
      cwd: root,
      encoding: 'utf8',
    }).trim()
    return tag.replace(/^v/, '')
  } catch {
    console.warn('[sync-version] No git tag found; leaving versions unchanged.')
    return null
  }
}

function isSemver(version) {
  return /^\d+\.\d+\.\d+([.-][\w.-]+)?$/.test(version)
}

function updateJsonVersion(filePath, version) {
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  if (data.version === version) return false
  data.version = version
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`)
  return true
}

function updateCargoTomlVersion(filePath, version) {
  const raw = fs.readFileSync(filePath, 'utf8')
  const next = raw.replace(/^version\s*=\s*"[^"]+"/m, `version = "${version}"`)
  if (next === raw) return false
  fs.writeFileSync(filePath, next)
  return true
}

const version = resolveVersion()
if (!version) process.exit(0)

if (!isSemver(version)) {
  console.error(`[sync-version] Invalid version "${version}". Expected semver like 1.2.0`)
  process.exit(1)
}

const targets = [
  {
    label: 'src-tauri/tauri.conf.json',
    apply: () => updateJsonVersion(path.join(root, 'src-tauri/tauri.conf.json'), version),
  },
  {
    label: 'src-tauri/Cargo.toml',
    apply: () => updateCargoTomlVersion(path.join(root, 'src-tauri/Cargo.toml'), version),
  },
  {
    label: 'gui_frontend/package.json',
    apply: () => updateJsonVersion(path.join(root, 'gui_frontend/package.json'), version),
  },
]

const changed = []
for (const target of targets) {
  if (target.apply()) changed.push(target.label)
}

if (changed.length === 0) {
  console.log(`[sync-version] Already at ${version}`)
} else {
  console.log(`[sync-version] Set version to ${version}:`)
  for (const file of changed) console.log(`  - ${file}`)
}
