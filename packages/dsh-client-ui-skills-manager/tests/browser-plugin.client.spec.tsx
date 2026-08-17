// @vitest-environment jsdom
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { resolveSlotLabel } from '@deepseek-ai/dsh-client-ui-slots'
import { apply, inject, NS } from '../src/client/index.ts'
import { SkillsManageSection } from '../src/client/SkillsManageSection.tsx'
import type { SkillsManageTabInjected } from '../src/client/SkillsManageSection.tsx'

afterEach(() => { document.body.innerHTML = '' })

function mockScope() {
  const snapshot = { status: 'loading' as const, value: undefined, base: undefined, user: undefined, revision: undefined, writable: true, mode: 'host' as const }
  const listeners = new Set<() => void>()
  return {
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    getSnapshot: () => snapshot,
    set: async () => {},
    unset: async () => {},
  }
}

async function bench() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const locale = new LocaleRuntime(ctx)
  ctx.provide('locale', locale)
  ctx.provide('settingsScope', { bind: () => mockScope() })
  ctx.provide('connection', {})
  ctx.provide('remote', {})
  return { ctx, slots: ctx.get('slots') as SlotRegistry, locale }
}

function declareSettingsSection(slots: SlotRegistry): () => void {
  return slots.register({
    name: 'root',
    children: { 'settings.section': { kind: 'list', scope: 'root' } },
  } as never, () => null)
}

describe('ui-skills-manage browser plugin', () => {
  it('declares only the services used by the Settings slot and namespace scope', () => {
    expect(inject).toEqual(['slots', 'locale', 'connection', 'remote', 'settingsScope'])
  })

  it('registers a top-level settings section next to Plugins', async () => {
    const b = await bench()
    declareSettingsSection(b.slots)
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    b.locale.setLocale('zh')

    const entry = b.slots.entries('settings.section')[0]!
    expect(entry.component).toBe(SkillsManageSection)
    expect(entry.options).toMatchObject({ id: 'skills-manage', order: 16 })
    expect(entry.locale).toBe(NS)
    expect(resolveSlotLabel(entry.options.label)).toBe('Skill 群')

    const injected = (entry.inject as unknown as () => SkillsManageTabInjected)()
    const scope = injected.scope
    expect(scope).toBeDefined()
    expect(scope.getSnapshot().status).toBe('loading')
    await b.ctx.fiber.dispose()
  })
})
