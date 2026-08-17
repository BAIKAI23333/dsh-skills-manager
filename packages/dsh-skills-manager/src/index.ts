/**
 * Skills Manage — one host plugin that turns a library of Claude-style
 * `SKILL.md` bundles into switchable, user-owned groups.
 *
 * - registers the `skills-manage` settings namespace
 * - discovers the configured library dirs plus a managed import directory
 * - accepts import commands through the settings section (host path or
 *   browser-uploaded files) and copies them into the managed library
 * - registers a dynamic SkillProvider whose catalog follows the active group
 * - invalidates the provider on every settings commit, so switching groups
 *   and importing skills need no restart
 */
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import { discoverLibrary } from './library.ts'
import { importFromFiles, importFromPath } from './import.ts'
import { PRESET_GROUPS } from './presets.ts'
import { ManagedSkillProvider, type LibraryStore } from './provider.ts'
import type {
  SkillGroup,
  SkillLibraryEntry,
  SkillsManageSettings,
} from './types.ts'

export { PRESET_GROUPS, ManagedSkillProvider }
export type { LibraryStore }
export type { SkillGroup, SkillLibraryEntry, SkillsManageSettings }
export type * from './types.ts'

export const name = 'skills-manage'
export const inject = ['settings', 'skills'] as const

/** Settings namespace owned by this plugin. */
export const SKILLS_MANAGE_NAMESPACE = settingsNamespace('skills-manage')

/** Plugin configuration. */
export interface Config {
  /** Read-only skill roots scanned one level deep. */
  libraryDirs?: string[]
  /** Writable library where imported skills are copied. */
  managedLibraryDir?: string
  /** Provider name inside `ctx.skills`; defaults to `skills-manage`. */
  providerName?: string
  /** Lower ranks win duplicate skill names. */
  rank?: number
}

export const Config: z<Config> = z.object({
  libraryDirs: z.array(z.string()).default([]),
  managedLibraryDir: z.string(),
  providerName: z.string().default('skills-manage'),
  rank: z.number().default(250),
})

const SkillGroupSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default(''),
  skills: z.array(z.string()).default([]),
})

const LibraryEntrySchema = z.object({
  name: z.string().min(1),
  description: z.string().default(''),
})

const ImportFileSchema = z.object({
  name: z.string().min(1),
  content: z.string(),
})

const ImportRequestSchema = z.object({
  id: z.number().default(0),
  path: z.string().default(''),
  files: z.array(ImportFileSchema).default([]),
})

const ImportResultSchema = z.object({
  id: z.number().default(0),
  ok: z.boolean().default(true),
  message: z.string().default(''),
  imported: z.array(z.string()).default([]),
})

const RefreshResultSchema = z.object({
  id: z.number().default(0),
  ok: z.boolean().default(true),
  message: z.string().default(''),
})

const SettingsSchema = z.object({
  activeGroup: z.string().default('office'),
  groups: z.array(SkillGroupSchema).default(PRESET_GROUPS as unknown as SkillGroup[]),
  presets: z.array(SkillGroupSchema).default(PRESET_GROUPS as unknown as SkillGroup[]),
  library: z.array(LibraryEntrySchema).default([]),
  importRequest: ImportRequestSchema.default({ id: 0, path: '', files: [] }),
  importResult: ImportResultSchema.default({ id: 0, ok: true, message: '', imported: [] }),
  refreshRequestId: z.number().default(0),
  refreshResult: RefreshResultSchema.default({ id: 0, ok: true, message: '' }),
})

function projectLibrary(store: LibraryStore): SkillLibraryEntry[] {
  return store.skills.map(skill => ({
    name: skill.name,
    description: skill.description,
  }))
}

/** Compare two skill libraries by name+description, for write avoidance. */
function sameProjection(a: SkillLibraryEntry[], b: SkillLibraryEntry[]): boolean {
  if (a.length !== b.length) return false
  return a.every((entry, index) => entry.name === b[index]?.name && entry.description === b[index]?.description)
}

/**
 * Register the settings namespace and the dynamic provider.
 * @param ctx - context carrying `settings` and `skills` services.
 */
export function apply(ctx: Context, config: Config = {}): void {
  const managedDir = resolve(config.managedLibraryDir ?? join(
    process.env.DSH_HOME ?? join(homedir(), '.dsh'),
    'skills-manage',
    'library',
  ))
  const allDirs = [...(config.libraryDirs ?? []), managedDir]
  const store: LibraryStore = { skills: discoverLibrary(allDirs) }

  const scope = ctx.settings.register<SkillsManageSettings>(
    SKILLS_MANAGE_NAMESPACE,
    SettingsSchema as unknown as z<SkillsManageSettings>,
    { applies: 'live' },
  )

  // Publish the discovered library as the user-layer projection. It is
  // host-managed state; the UI never edits this field directly.
  const current = scope.get()
  if (!sameProjection(current.library, projectLibrary(store))) {
    void scope.update({ library: projectLibrary(store) })
  }

  scope.watch(async (next, previous) => {
    if (next.refreshRequestId !== 0 && next.refreshRequestId !== previous.refreshRequestId) {
      const before = store.skills.length
      store.skills = discoverLibrary(allDirs)
      await scope.update({
        library: projectLibrary(store),
        refreshResult: {
          id: next.refreshRequestId,
          ok: true,
          message: `Skill 库已刷新：${before} → ${store.skills.length} 个 Skill`,
        },
      })
    }
    if (next.importRequest.id !== 0 && next.importRequest.id !== previous.importRequest.id) {
      const request = next.importRequest
      const outcome = request.path.length > 0
        ? importFromPath(managedDir, request.path)
        : importFromFiles(managedDir, request.files)
      store.skills = discoverLibrary(allDirs)
      await scope.update({
        library: projectLibrary(store),
        importResult: { id: request.id, ok: outcome.ok, message: outcome.message, imported: outcome.imported },
        importRequest: { id: 0, path: '', files: [] },
      })
    }
  })

  ctx.skills.registerProvider(control => new ManagedSkillProvider(
    scope,
    control,
    store,
    config.providerName ?? 'skills-manage',
    config.rank ?? 250,
  ))
}
