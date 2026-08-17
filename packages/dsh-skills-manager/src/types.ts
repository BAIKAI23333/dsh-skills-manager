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
  /** Pending import command; host clears it after processing. */
  importRequest: SkillsImportRequest
  /** Last completed import command result. */
  importResult: SkillsImportResult
  /** Refresh request id issued by the client. */
  refreshRequestId: number
  /** Last completed refresh result. */
  refreshResult: SkillsRefreshResult
}

/** Client-to-host import command carried by the settings section. */
export interface SkillsImportRequest {
  /** Monotonic request id issued by the client. */
  id: number
  /** Optional host path for folder/file import. */
  path: string
  /** Optional browser-uploaded markdown files. */
  files: ImportFileEntry[]
}

/** One browser-uploaded skill file. */
export interface ImportFileEntry {
  name: string
  content: string
}

/** Host response to one import command. */
export interface SkillsImportResult {
  /** Echoes the request id that produced this result. */
  id: number
  ok: boolean
  message: string
  /** Skill names newly imported by this request. */
  imported: string[]
}

/** Host response to one refresh command. */
export interface SkillsRefreshResult {
  /** Echoes the request id that produced this result. */
  id: number
  ok: boolean
  message: string
}
