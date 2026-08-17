import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { parse as parseYaml } from 'yaml'
import type { SkillLibraryEntry } from './types.ts'

/** Private catalog entry with the filesystem locator the provider needs. */
export interface LibrarySkill extends SkillLibraryEntry {
  /** Absolute path of SKILL.md (or flat .md file). */
  path: string
  /** Absolute resource root for relative references. */
  directory: string
}

const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

interface ParsedSkill {
  name: string
  description: string
  content: string
}

/**
 * Parse the small, DSH-relevant frontmatter subset of a Claude-style skill.
 * @returns undefined when the file is absent, malformed, or lacks a name.
 */
export function parseSkillFile(path: string): ParsedSkill | undefined {
  let raw: string
  try {
    raw = readFileSync(path, 'utf8')
  } catch {
    return undefined
  }
  return parseSkillText(raw)
}

/** Parse skill text without touching the filesystem. */
export function parseSkillText(raw: string): ParsedSkill | undefined {
  const firstLineEnd = raw.indexOf('\n')
  if (firstLineEnd < 0 || raw.slice(0, firstLineEnd).replace(/\r$/, '') !== '---') return undefined
  const start = firstLineEnd + 1
  let lineStart = start
  let closing: number | undefined
  while (lineStart <= raw.length) {
    const nextNewline = raw.indexOf('\n', lineStart)
    const lineEnd = nextNewline < 0 ? raw.length : nextNewline
    if (raw.slice(lineStart, lineEnd).replace(/\r$/, '') === '---') {
      closing = lineStart
      break
    }
    if (nextNewline < 0) return undefined
    lineStart = nextNewline + 1
  }
  if (closing === undefined) return undefined
  const bodyStart = raw.indexOf('\n', closing)
  const body = bodyStart < 0 ? '' : raw.slice(bodyStart + 1)
  let data: unknown
  try {
    data = parseYaml(raw.slice(start, closing))
  } catch {
    return undefined
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return undefined
  const record = data as Record<string, unknown>
  const name = record['name']
  const description = record['description']
  if (typeof name !== 'string' || name.length === 0 || !SKILL_NAME.test(name)) return undefined
  if (typeof description !== 'string' || description.length === 0) return undefined
  return { name, description, content: body.trim() }
}

/**
 * Discover one-level skill bundles (`<name>/SKILL.md`) and flat `.md` skills.
 * Nested skill trees are intentionally ignored, matching dsh-skill-filesystem.
 */
export function discoverLibrary(dirs: readonly string[]): LibrarySkill[] {
  const byName = new Map<string, LibrarySkill>()
  for (const dir of dirs) {
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      // Follow symlinked skill farms (the mode directories are symlink farms).
      let kind = entry.isDirectory() ? 'directory' : entry.isFile() ? 'file' : undefined
      if (entry.isSymbolicLink()) {
        try {
          kind = statSync(join(dir, entry.name)).isDirectory() ? 'directory' : 'file'
        } catch {
          continue
        }
      }
      let path: string
      let directory: string
      if (kind === 'directory') {
        path = join(dir, entry.name, 'SKILL.md')
        directory = join(dir, entry.name)
      } else if (kind === 'file' && entry.name.endsWith('.md') && entry.name !== 'SKILL.md') {
        path = join(dir, entry.name)
        directory = dir
      } else {
        continue
      }
      const parsed = parseSkillFile(path)
      if (parsed === undefined) continue
      const previous = byName.get(parsed.name)
      if (previous !== undefined) {
        // First root wins; duplicate names are already excluded in our mode farms.
        continue
      }
      byName.set(parsed.name, {
        name: parsed.name,
        description: parsed.description,
        path,
        directory,
      })
    }
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name))
}
