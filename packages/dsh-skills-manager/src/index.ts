/**
 * Skills Manage — one host plugin that turns a library of Claude-style
 * `SKILL.md` bundles into switchable, user-owned groups.
 *
 * - registers the `skills-manage` settings namespace
 * - discovers the configured library dirs plus a managed import directory
 * - registers a dynamic SkillProvider whose catalog follows the active group
 * - exposes import and refresh commands through a Typert Remote namespace
 *   (`skillsManage.importPath` / `skillsManage.importFiles` /
 *   `skillsManage.refresh`) so no command-shaped settings fields are needed
 */
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { settingsNamespace, type SettingsScope } from '@deepseek-ai/dsh-settings'
import { TypertRemoteService, Remote } from '@deepseek-ai/dsh-typert-protocol'
import { discoverLibrary } from './library.ts'
import { importFromFiles, importFromPath } from './import.ts'
import { PRESET_GROUPS } from './presets.ts'
import { ManagedSkillProvider, type LibraryStore } from './provider.ts'
import type {
  ImportFile,
  ImportOutcome,
  SkillGroup,
  SkillLibraryEntry,
  SkillsManageSettings,
  SkillsRefreshResult,
} from './types.ts'

export { PRESET_GROUPS, ManagedSkillProvider }
export type { LibraryStore }
export type { SkillGroup, SkillLibraryEntry, SkillsManageSettings }
export type * from './types.ts'

export const name = 'skills-manage'

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

const SettingsSchema = z.object({
  activeGroup: z.string().default('office'),
  groups: z.array(SkillGroupSchema).default(PRESET_GROUPS as unknown as SkillGroup[]),
  presets: z.array(SkillGroupSchema).default(PRESET_GROUPS as unknown as SkillGroup[]),
  library: z.array(LibraryEntrySchema).default([]),
})

function projectLibrary(store: LibraryStore): SkillLibraryEntry[] {
  return store.skills.map(skill => ({
    name: skill.name,
    description: skill.description,
  }))
}

function sameProjection(a: SkillLibraryEntry[], b: SkillLibraryEntry[]): boolean {
  if (a.length !== b.length) return false
  return a.every((entry, index) => entry.name === b[index]?.name && entry.description === b[index]?.description)
}

/**
 * Host service: settings namespace, dynamic skill provider, and import/refresh
 * Remote commands.
 */
export class SkillsManageService extends TypertRemoteService {
  static inject = ['settings', 'skills'] as const
  static Config = z.object({
    libraryDirs: z.array(z.string()).default([]),
    managedLibraryDir: z.string(),
    providerName: z.string().default('skills-manage'),
    rank: z.number().default(250),
  })

  private readonly managedDir: string
  private readonly allDirs: string[]
  private readonly store: LibraryStore
  private readonly scope: SettingsScope<SkillsManageSettings>

  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'skillsManage')
    this.managedDir = resolve(config.managedLibraryDir ?? join(
      process.env.DSH_HOME ?? join(homedir(), '.dsh'),
      'skills-manage',
      'library',
    ))
    this.allDirs = [...(config.libraryDirs ?? []), this.managedDir]
    this.store = { skills: discoverLibrary(this.allDirs) }

    this.scope = ctx.settings.register<SkillsManageSettings>(
      SKILLS_MANAGE_NAMESPACE,
      SettingsSchema as unknown as z<SkillsManageSettings>,
      { applies: 'live' },
    )

    // Remove command-shaped fields left by the pre-Remote settings-channel
    // implementation.
    void ctx.settings.mutate(SKILLS_MANAGE_NAMESPACE, [
      { op: 'unset', path: ['importRequest'] },
      { op: 'unset', path: ['importResult'] },
      { op: 'unset', path: ['refreshRequestId'] },
      { op: 'unset', path: ['refreshResult'] },
    ])

    const current = this.scope.get()
    if (!sameProjection(current.library, projectLibrary(this.store))) {
      void this.scope.update({ library: projectLibrary(this.store) })
    }

    ctx.skills.registerProvider(control => new ManagedSkillProvider(
      this.scope,
      control,
      this.store,
      config.providerName ?? 'skills-manage',
      config.rank ?? 250,
    ))
  }

  /** Import skills from a host filesystem path. */
  @Remote('importPath')
  async importPath(path: string): Promise<ImportOutcome> {
    const outcome = await importFromPath(this.managedDir, path)
    if (outcome.ok) await this.rescanLibrary()
    return outcome
  }

  /** Import browser-uploaded markdown files. */
  @Remote('importFiles')
  async importFiles(files: ImportFile[]): Promise<ImportOutcome> {
    const outcome = await importFromFiles(this.managedDir, files)
    if (outcome.ok) await this.rescanLibrary()
    return outcome
  }

  /** Rescan library roots and publish the fresh projection. */
  @Remote('refresh')
  async refresh(): Promise<SkillsRefreshResult> {
    const before = this.store.skills.length
    this.store.skills = discoverLibrary(this.allDirs)
    await this.scope.update({ library: projectLibrary(this.store) })
    return {
      ok: true,
      message: `Skill 库已刷新：${before} → ${this.store.skills.length} 个 Skill`,
    }
  }

  private async rescanLibrary(): Promise<void> {
    this.store.skills = discoverLibrary(this.allDirs)
    await this.scope.update({ library: projectLibrary(this.store) })
  }
}

export default SkillsManageService
