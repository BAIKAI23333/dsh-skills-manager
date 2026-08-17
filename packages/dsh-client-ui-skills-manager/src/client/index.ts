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
import skillsManageRemote from '@deepseek-ai/dsh-skills-manage/remote'
import type {} from '@deepseek-ai/dsh-skills-manage/remote'
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

/** Services required by the Settings slot, scope, and Remote namespace. */
export const inject = ['slots', 'locale', 'connection', 'remote', 'settingsScope']

function unwrap<T>(
  result: { ok: true; value: T } | { ok: false; error: { code: string; message: string } },
  method: string,
): T {
  if (!result.ok) throw new Error(`${method} failed: ${result.error.code}: ${result.error.message}`)
  return result.value
}

/** Mount the generated Remote contribution and register the Settings section. */
export async function apply(ctx: ClientContext): Promise<void> {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-skills-manage: dictionaries')

  const disposeRemote = await ctx.remote.$mount(skillsManageRemote)
  ctx.effect(() => disposeRemote, 'ui-skills-manage: skillsManage remote')
  const skillsManage = ctx.get('remote.skillsManage') as ClientContext['remote']['skillsManage']

  const t = ctx.locale.bind(NS)
  const injected = (): SkillsManageTabInjected => ({
    scope: ctx.settingsScope.bind({ namespace: 'skills-manage' }),
    remote: {
      importPath: async path => unwrap(await skillsManage.importPath(path), 'skillsManage.importPath'),
      importFiles: async files => unwrap(await skillsManage.importFiles(files), 'skillsManage.importFiles'),
      refresh: async () => unwrap(await skillsManage.refresh(), 'skillsManage.refresh'),
    },
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
