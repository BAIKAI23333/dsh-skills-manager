import type {
  SkillCandidate,
  SkillDefinition,
  SkillLookupOptions,
  SkillProvider,
  SkillProviderControl,
} from '@deepseek-ai/dsh-skill'
import type { SettingsScope } from '@deepseek-ai/dsh-settings'
/** Mutable library shared between the importer and the provider. */
export interface LibraryStore {
  skills: LibrarySkill[]
}

import type { LibrarySkill } from './library.ts'
import { parseSkillFile } from './library.ts'
import type { SkillsManageSettings } from './types.ts'

/**
 * Dynamic skill provider. It contributes only the currently active group and
 * invalidates its catalog whenever the settings section commits a new value,
 * so group switches are visible without restarting the host.
 */
export class ManagedSkillProvider implements SkillProvider {
  /** Registry provider identity; unique per mounted skills-manage plugin. */
  readonly name: string

  constructor(
    private readonly scope: SettingsScope<SkillsManageSettings>,
    control: SkillProviderControl,
    private readonly library: LibraryStore,
    providerName: string,
    private readonly rank: number,
  ) {
    this.name = providerName
    const off = scope.watch(() => {
      control.invalidate()
    })
    control.signal.addEventListener('abort', () => {
      off()
    }, { once: true })
  }

  private resolveActiveSkills(): LibrarySkill[] {
    const settings = this.scope.get()
    // The empty active group means "no skills enabled".
    if (settings.activeGroup === '') return []
    const group = settings.groups.find(candidate => candidate.id === settings.activeGroup)
    if (group === undefined) return []
    // The all preset tracks the whole library, including later imports.
    if (group.id === 'all') return [...this.library.skills]
    const selected = new Set(group.skills)
    return this.library.skills.filter(skill => selected.has(skill.name))
  }

  async list(_options: SkillLookupOptions): Promise<readonly SkillCandidate[]> {
    return this.resolveActiveSkills().map((skill): SkillCandidate => ({
      name: skill.name,
      description: skill.description,
      invocation: { modelInvocable: true, userInvocable: true },
      provider: this.name,
      source: 'skills-manage',
      rank: this.rank,
      locator: { path: skill.path, directory: skill.directory },
      resourceBase: { kind: 'directory', path: skill.directory },
      path: skill.path,
    }))
  }

  async get(candidate: SkillCandidate, _options: SkillLookupOptions): Promise<SkillDefinition | undefined> {
    const locator = candidate.locator as { path?: string; directory?: string } | undefined
    const path = locator?.path ?? candidate.path
    if (path === undefined) return undefined
    const parsed = parseSkillFile(path)
    if (parsed === undefined) return undefined
    return {
      name: parsed.name,
      description: parsed.description,
      invocation: candidate.invocation,
      provider: this.name,
      source: candidate.source,
      ...candidate.resourceBase === undefined ? {} : { resourceBase: candidate.resourceBase },
      path,
      content: parsed.content,
    }
  }
}
