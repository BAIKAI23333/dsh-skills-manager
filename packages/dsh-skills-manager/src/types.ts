/** Public settings vocabulary for the skills-manage namespace. */

/** One skill exposed to the settings UI (no host paths). */
export interface SkillLibraryEntry {
  /** kebab-case skill name. */
  name: string
  /** One-line routing description. */
  description: string
}

/** One user-created or preset skill group. */
export interface SkillGroup {
  /** Stable machine id; kebab-case is conventional but not enforced. */
  id: string
  /** Display name. */
  name: string
  /** Optional one-line purpose shown in the UI. */
  description: string
  /** Skill names that belong to this group. */
  skills: string[]
}

/** Resolved settings section for the skills-manage namespace. */
export interface SkillsManageSettings {
  /** Id of the currently active group. */
  activeGroup: string
  /** User-owned groups, newest last. */
  groups: SkillGroup[]
  /** Host-managed library projection. */
  library: SkillLibraryEntry[]
  /** Preset groups; clients use this as the reset target. */
  presets: SkillGroup[]
}

/** One browser-uploaded skill file for the importFiles Remote. */
export interface ImportFile {
  name: string
  content: string
}

/** Result of one importFiles/importPath Remote command. */
export interface ImportOutcome {
  ok: boolean
  message: string
  /** Skill names newly imported by this request. */
  imported: string[]
}

/** Result of the refresh Remote command. */
export interface SkillsRefreshResult {
  ok: boolean
  message: string
}
