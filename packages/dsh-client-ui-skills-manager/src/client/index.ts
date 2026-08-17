/**
 * Skills Manage browser half: contributes a top-level `skills-manage` section
 * to Web Settings (sibling of Models / Plugins / Agent presets) and edits the
 * Host-registered `skills-manage` settings namespace through `settingsScope`.
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: brings ctx.settingsScope into the ClientContext merge.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: brings ctx.locale into the ClientContext merge.
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { en, zh, type SkillsManageLocaleKey } from './locales.ts'
import { SkillsManageSection, type SkillsManageTabInjected } from './SkillsManageSection.tsx'

export type { SkillsManageLocaleKey } from './locales.ts'
export type { SkillsManageTabInjected, SkillsManageSectionProps } from './SkillsManageSection.tsx'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Skills Manage tab copy. */
    'settings.skillsManage': SkillsManageLocaleKey
  }
}

/** Dictionary namespace owned by this plugin. */
export const NS = 'settings.skillsManage'

/** Services required by the Settings slot and the namespace scope. */
export const inject = ['slots', 'locale', 'connection', 'remote', 'settingsScope']

/** Contribute the top-level Skills section to Settings. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-skills-manage: dictionaries')

  const t = ctx.locale.bind(NS)
  const injected = (): SkillsManageTabInjected => ({
    scope: ctx.settingsScope.bind({ namespace: 'skills-manage' }),
  })

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'skills-manage',
    order: 16,
    label: () => t('nav'),
    locale: NS,
    inject: injected,
  }, SkillsManageSection))
}
