import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright'

const BASE = process.env.DSH_WEB_URL ?? 'http://127.0.0.1:3099'
const SHOT_DIR = new URL('./screenshots/', import.meta.url).pathname
const LIB_DIR = `${process.env.HOME}/.dsh/skills-manage/library`
const TEST_SKILL_NAME = `e2e-drag-${Date.now().toString(36)}`
const TEST_SKILL_CONTENT = `---\nname: ${TEST_SKILL_NAME}\ndescription: Browser automation test skill.\n---\n# E2E Drag Import\n`

mkdirSync(SHOT_DIR, { recursive: true })

function assert(condition, message) {
  if (!condition) throw new Error(`assertion failed: ${message}`)
}

async function visibleText(page, pattern) {
  const locator = page.getByText(pattern).first()
  await locator.waitFor({ state: 'visible', timeout: 15_000 })
  return locator
}

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
try {
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.waitForTimeout(6000)

  await page.getByRole('button', { name: 'Settings' }).click()
  await visibleText(page, /插件|Plugins/)

  const skillNav = page.getByText(/Skill 群|Skill Groups/).first()
  await skillNav.click()
  await visibleText(page, /新建 Skill 群|New group/)
  await visibleText(page, /办公/)
  await visibleText(page, /Vibe Coding/)
  await visibleText(page, /科研写作/)

  const section = page.locator('body')
  const overflow = await section.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  assert(overflow <= 0, `页面存在横向溢出 ${overflow}px`)
  await page.screenshot({ path: `${SHOT_DIR}skills-manage-section.png`, fullPage: true })

  await visibleText(page, /不加载|None/)
  await visibleText(page, /全部启用/)

  // 不加载 + 全部启用两个特殊模式
  const noneCard = page.locator('li').filter({ hasText: /不加载|None/ }).first()
  await noneCard.getByRole('button', { name: /启用|Activate/ }).click()
  await visibleText(page, /已停用所有 Skill|All skill groups disabled/)
  const allCard = page.locator('li').filter({ hasText: /全部启用/ }).first()
  await allCard.getByRole('button', { name: /启用|Activate/ }).click()
  await visibleText(page, /已启用 Skill 群|Skill group activated/)
  await page.screenshot({ path: `${SHOT_DIR}skills-manage-none-all.png`, fullPage: true })

  // 编辑已有群也必须提供导入入口
  await page.getByRole('button', { name: /编辑|Edit/ }).first().click()
  await visibleText(page, /拖拽 SKILL\.md|Drop SKILL\.md/)
  await page.screenshot({ path: `${SHOT_DIR}skills-manage-edit-import.png`, fullPage: true })
  await page.getByRole('button', { name: /取消|Cancel/ }).last().click()

  // 新建群 + 拖拽文件导入
  await page.getByRole('button', { name: /新建 Skill 群|New group/ }).click()
  await visibleText(page, /拖拽 SKILL\.md|Drop SKILL\.md/)
  const nameInput = page.locator('input[placeholder*="名称"], input[placeholder*="Name"]').first()
  await nameInput.waitFor({ state: 'visible' })
  await nameInput.fill('E2E 临时群')

  const tempFile = `/tmp/${TEST_SKILL_NAME}.md`
  writeFileSync(tempFile, TEST_SKILL_CONTENT)
  await page.locator('input[type="file"]').setInputFiles(tempFile)
  await visibleText(page, new RegExp(TEST_SKILL_NAME))
  await page.getByRole('button', { name: /导入文件|Import files/ }).click()
  await visibleText(page, /Skill 导入完成|Skills imported/)
  const importedCheckbox = page.locator(`label:has-text("${TEST_SKILL_NAME}") input[type="checkbox"]`)
  await importedCheckbox.waitFor({ state: 'visible' })
  assert(await importedCheckbox.isChecked(), '导入的 skill 应自动勾选进新群')
  await page.screenshot({ path: `${SHOT_DIR}skills-manage-import.png`, fullPage: true })
  await page.getByRole('button', { name: /取消|Cancel/ }).last().click()

  // 刷新 Skill 库（先清理导入产生的测试文件）
  rmSync(`${LIB_DIR}/${TEST_SKILL_NAME}`, { recursive: true, force: true })
  rmSync(tempFile, { force: true })
  await page.getByRole('button', { name: /刷新 Skill 库|Refresh library/ }).click()
  await visibleText(page, /Skill 库已刷新|Skill library refreshed/)

  // 预设重置
  await page.getByRole('button', { name: /重置预设|Reset presets/ }).first().click()
  await visibleText(page, /确定用预设替换|Replace all current groups/)
  await page.getByRole('button', { name: /重置预设|Reset presets/ }).last().click()
  await visibleText(page, /已重置为预设|Presets restored/)
  console.log('visual checks passed')
  console.log('screenshots:')
  for (const name of ['skills-manage-section.png', 'skills-manage-none-all.png', 'skills-manage-edit-import.png', 'skills-manage-import.png']) {
    console.log(`  ${SHOT_DIR}${name}`)
  }
} finally {
  await browser.close()
}
