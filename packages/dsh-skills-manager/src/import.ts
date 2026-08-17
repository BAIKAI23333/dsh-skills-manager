import {
  cpSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { parseSkillFile, parseSkillText } from './library.ts'

export interface ImportFile {
  name: string
  content: string
}

export interface ImportOutcome {
  ok: boolean
  message: string
  /** Skill names newly imported by this request. */
  imported: string[]
}

const MAX_FILE_BYTES = 512 * 1024

function kebabName(value: string): string | undefined {
  const candidate = value.trim().toLowerCase().replace(/[\s_]+/g, '-')
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(candidate) ? candidate : undefined
}

function existing(targetDir: string): boolean {
  try {
    return statSync(targetDir).isDirectory()
  } catch {
    return false
  }
}

/** Import one SKILL.md file (or a flat <name>.md file) into the managed library. */
function importFileText(managedDir: string, rawName: string, content: string): { name?: string; error?: string } {
  if (Buffer.byteLength(content, 'utf8') > MAX_FILE_BYTES) {
    return { error: `${rawName}: 文件超过 512 KiB 限制` }
  }
  const parsed = parseSkillText(content)
  const fromBasename = rawName !== 'SKILL.md' && rawName.endsWith('.md')
    ? kebabName(basename(rawName, '.md'))
    : undefined
  const name = parsed?.name ?? fromBasename
  if (name === undefined) {
    return { error: `${rawName}: 无法解析 SKILL.md 的 name` }
  }
  const targetDir = join(managedDir, name)
  if (existing(targetDir)) return { error: `${name}: skill 已存在，跳过` }
  mkdirSync(targetDir, { recursive: true })
  writeFileSync(join(targetDir, 'SKILL.md'), content, 'utf8')
  return { name }
}

/** Import every skill found under one directory. */
function importDirectory(managedDir: string, dir: string, visited: Set<string> = new Set()): { imported: string[]; skipped: string[] } {
  const imported: string[] = []
  const skipped: string[] = []
  let real: string
  try {
    real = realpathSync(dir)
  } catch {
    real = dir
  }
  if (visited.has(real)) return { imported, skipped: [`${basename(dir)}: 符号链接循环，已跳过`] }
  visited.add(real)
  const direct = join(dir, 'SKILL.md')
  try {
    if (statSync(direct).isFile()) {
      const parsed = parseSkillFile(direct)
      if (parsed === undefined) return { imported, skipped: [basename(dir)] }
      if (existing(join(managedDir, parsed.name))) return { imported, skipped: [parsed.name] }
      cpSync(dir, join(managedDir, parsed.name), { recursive: true })
      imported.push(parsed.name)
      return { imported, skipped }
    }
  } catch {}

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const child = join(dir, entry.name)
    try {
      let isDir = entry.isDirectory()
      let isFile = entry.isFile()
      if (entry.isSymbolicLink()) {
        const stats = statSync(child)
        isDir = stats.isDirectory()
        isFile = stats.isFile()
      }
      if (isDir) {
        const result = importDirectory(managedDir, child, visited)
        imported.push(...result.imported)
        skipped.push(...result.skipped)
      } else if (isFile) {
        if (entry.name === 'SKILL.md') {
          const parsed = parseSkillFile(child)
          if (parsed === undefined) {
            skipped.push(entry.name)
            continue
          }
          if (existing(join(managedDir, parsed.name))) {
            skipped.push(parsed.name)
            continue
          }
          mkdirSync(join(managedDir, parsed.name), { recursive: true })
          cpSync(child, join(managedDir, parsed.name, 'SKILL.md'))
          imported.push(parsed.name)
        } else if (entry.name.endsWith('.md')) {
          const result = importFileText(managedDir, entry.name, readFileSync(child, 'utf8'))
          if (result.error !== undefined) skipped.push(result.error)
          else if (result.name !== undefined) imported.push(result.name)
        }
      }
    } catch (error) {
      skipped.push(`${entry.name}: ${String(error)}`)
    }
  }
  return { imported, skipped }
}

/** Import from a host filesystem path (file or directory). */
export function importFromPath(managedDir: string, inputPath: string): ImportOutcome {
  const dir = resolve(inputPath)
  let stats
  try {
    stats = statSync(dir)
  } catch (error) {
    return { ok: false, message: `路径不可用: ${String(error)}`, imported: [] }
  }
  try {
    if (stats.isDirectory()) {
      const result = importDirectory(managedDir, dir)
      if (result.imported.length === 0 && result.skipped.length === 0) {
        return { ok: false, message: '目录中没有找到可导入的 skill', imported: [] }
      }
      return {
        ok: result.imported.length > 0,
        message: `导入 ${result.imported.length} 个${result.skipped.length > 0 ? `，跳过: ${result.skipped.join(', ')}` : ''}`,
        imported: result.imported,
      }
    }
    if (stats.isFile()) {
      const parsed = parseSkillFile(dir)
      if (parsed === undefined) return { ok: false, message: '文件无法解析为 skill', imported: [] }
      if (existing(join(managedDir, parsed.name))) return { ok: false, message: `${parsed.name} 已存在`, imported: [] }
      mkdirSync(join(managedDir, parsed.name), { recursive: true })
      cpSync(dir, join(managedDir, parsed.name, 'SKILL.md'))
      return { ok: true, message: `导入 1 个: ${parsed.name}`, imported: [parsed.name] }
    }
    return { ok: false, message: '路径既不是文件也不是目录', imported: [] }
  } catch (error) {
    return { ok: false, message: `导入失败: ${String(error)}`, imported: [] }
  }
}

/** Import browser-uploaded .md files. */
export function importFromFiles(managedDir: string, files: ImportFile[]): ImportOutcome {
  const imported: string[] = []
  const skipped: string[] = []
  for (const file of files) {
    const result = importFileText(managedDir, file.name, file.content)
    if (result.error !== undefined) skipped.push(result.error)
    else if (result.name !== undefined) imported.push(result.name)
  }
  if (imported.length === 0 && skipped.length === 0) return { ok: false, message: '没有收到文件', imported: [] }
  return {
    ok: imported.length > 0,
    message: `导入 ${imported.length} 个${skipped.length > 0 ? `，跳过: ${skipped.join(', ')}` : ''}`,
    imported,
  }
}
