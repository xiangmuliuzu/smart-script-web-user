import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mockCreatorApi } from './fixtures/creator-api.mjs'

let playwright
try { playwright = createRequire(import.meta.url)('playwright') }
catch { playwright = createRequire(new URL('../../shared/scripts/package.json', import.meta.url))('playwright') }
const base = (process.env.PREVIEW_URL || 'http://127.0.0.1:3001/user').replace(/\/$/, '')
const browser = await playwright.chromium.launch({ headless: true })
const checks = []
async function check(name, run) { await run(); checks.push(name); console.log('PASS ' + name) }
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const state = await mockCreatorApi(context)
  state.chapters[3][1].content = '这是第三次告白第二集的原文。'
  await context.addInitScript(() => localStorage.setItem('PcUser-Token', 'browser-test-only'))
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  const title = page.getByLabel('作品名称', { exact: true })
  const picker = page.getByLabel('选择作品', { exact: true })
  const chapterTitle = page.getByLabel('分集标题', { exact: true })
  const editor = page.getByLabel('分集正文', { exact: true })
  async function switchTo(id, confirm = false) {
    await picker.selectOption(String(id))
    if (confirm) {
      await page.getByRole('button', { name: '保留并切换', exact: true }).click()
      await page.getByRole('dialog', { name: '切换作品', exact: true }).waitFor({ state: 'hidden' })
    }
    await page.waitForFunction(workId => document.querySelector('.creation-work-select')?.value === workId && !document.querySelector('.creation-work-select').disabled, String(id))
  }

  await check('editing a chapter navigates to the creation page and loads its work and selected chapter', async () => {
    await page.goto(base + '/works/3')
    await page.locator('tbody tr').nth(1).getByRole('button', { name: '编辑', exact: true }).click()
    await chapterTitle.waitFor()
    await page.waitForFunction(() => !document.querySelector('.creation-title')?.disabled)
    assert.equal(new URL(page.url()).searchParams.get('workId'), '3')
    assert.equal(new URL(page.url()).searchParams.get('chapterId'), '31')
    assert.equal(await title.inputValue(), '第三次告白')
    assert.equal(await picker.inputValue(), '3')
    assert.equal(await page.getByLabel('分类', { exact: true }).inputValue(), '2')
    assert.equal(await chapterTitle.inputValue(), '无人认领的行李')
    assert.match(await editor.innerText(), /第三次告白第二集的原文/)
    assert.equal(await page.getByRole('dialog', { name: '编辑章节', exact: true }).count(), 0)
    const categoryBounds = await page.getByLabel('分类', { exact: true }).boundingBox()
    const pickerBounds = await picker.boundingBox()
    assert.ok(pickerBounds.x > categoryBounds.x)
  })

  await check('pristine work switching loads the other work with its category and chapters', async () => {
    await switchTo(1)
    assert.equal(await title.inputValue(), '归途列车')
    assert.equal(await page.getByLabel('分类', { exact: true }).inputValue(), '1')
    assert.equal(await chapterTitle.inputValue(), '雨夜的乘客')
    assert.equal(await page.getByRole('dialog', { name: '切换作品', exact: true }).count(), 0)
    await switchTo(3)
  })

  await check('cancelling a dirty work switch retains the selected work and its edits', async () => {
    await editor.fill('第三次告白第一集，尚未提交的改稿。')
    await picker.selectOption('1')
    await page.getByRole('button', { name: '继续编辑', exact: true }).click()
    await page.getByRole('dialog', { name: '切换作品', exact: true }).waitFor({ state: 'hidden' })
    assert.equal(await picker.inputValue(), '3')
    assert.equal(new URL(page.url()).searchParams.get('workId'), '3')
    assert.match(await editor.innerText(), /尚未提交的改稿/)
  })

  await check('drafts remain separate per work, and switching back restores only that work', async () => {
    await switchTo(1, true)
    assert.doesNotMatch(await editor.innerText(), /第三次告白第一集/)
    await editor.fill('归途列车第一集的独立修改。')
    await switchTo(3, true)
    assert.match(await editor.innerText(), /第三次告白第一集，尚未提交的改稿/)
    assert.doesNotMatch(await editor.innerText(), /归途列车第一集的独立修改/)
    const drafts = await page.evaluate(() => [1, 3].map(id => JSON.parse(localStorage.getItem('PcUser-CreationDraft:7:work:' + id))))
    assert.equal(drafts[0].createdId, 1)
    assert.equal(drafts[1].createdId, 3)
  })

  await check('saving an existing work updates only its edited chapter without creating works or chapters', async () => {
    const before = state.calls.length
    await page.getByRole('button', { name: '保存草稿', exact: true }).click()
    await page.waitForURL(base + '/works/3')
    const writes = state.calls.slice(before).filter(call => call.method !== 'GET')
    assert.deepEqual(writes, [{ path: '/api/v1/users/me/works/3/chapters/30', method: 'PUT' }])
    assert.match(state.chapters[3][0].content, /尚未提交的改稿/)
    assert.doesNotMatch(state.chapters[1][0].content, /独立修改/)
    assert.equal(state.works.length, 4)
    assert.equal(await page.evaluate(() => localStorage.getItem('PcUser-CreationDraft:7:work:3')), null)
    assert.notEqual(await page.evaluate(() => localStorage.getItem('PcUser-CreationDraft:7:work:1')), null)
  })

  await check('new work drafts stay independent from existing work drafts', async () => {
    await page.goto(base + '/works/create')
    await page.waitForFunction(() => !document.querySelector('.creation-title')?.disabled)
    assert.equal(await title.inputValue(), '')
    await title.fill('未发表的新故事')
    await editor.fill('新作品草稿不能写入旧作品。')
    await switchTo(3, true)
    assert.equal(await title.inputValue(), '第三次告白')
    await switchTo('')
    assert.equal(await title.inputValue(), '未发表的新故事')
    assert.match(await editor.innerText(), /新作品草稿不能写入旧作品/)
  })

  await check('unedited remote chapters survive a save, and conflicting edits are not overwritten', async () => {
    await switchTo(3, true)
    await editor.fill('本页编辑第三次告白第一集。')
    state.chapters[3][1].content = '其他页面对第二集的更新必须保留。'
    await page.getByRole('button', { name: '保存草稿', exact: true }).click()
    await page.waitForURL(base + '/works/3')
    assert.equal(state.chapters[3][1].content, '其他页面对第二集的更新必须保留。')
    await page.locator('tbody tr').first().getByRole('button', { name: '编辑', exact: true }).click()
    await page.waitForFunction(() => !document.querySelector('.creation-title')?.disabled)
    await editor.fill('当前页面尚未保存的第一集。')
    state.chapters[3][0].content = '其他页面刚保存了第一集。'
    const before = state.calls.length
    await page.getByRole('button', { name: '保存草稿', exact: true }).click()
    await page.locator('.creation-error').filter({ hasText: '章节已在其他页面修改' }).waitFor()
    assert.equal(state.chapters[3][0].content, '其他页面刚保存了第一集。')
    assert.equal(state.calls.slice(before).filter(call => call.method !== 'GET').length, 0)
    assert.match(await editor.innerText(), /当前页面尚未保存的第一集/)
    await switchTo(4, true)
  })

  await check('reload restores the selected work and draft; review lock still prevents writing', async () => {
    await switchTo(1)
    await page.reload()
    await page.waitForFunction(() => document.querySelector('.creation-work-select')?.value === '1' && !document.querySelector('.creation-work-select').disabled)
    assert.match(await editor.innerText(), /归途列车第一集的独立修改/)
    await switchTo(2, true)
    assert.equal(await title.inputValue(), '长夜将明')
    assert.equal(await title.isDisabled(), true)
    assert.equal(await page.getByRole('button', { name: '保存草稿', exact: true }).isDisabled(), true)
    assert.equal(await editor.getAttribute('contenteditable'), 'false')
    await switchTo(4)
  })

  await check('mobile layout keeps the work selector usable without horizontal overflow', async () => {
    await page.setViewportSize({ width: 390, height: 844 })
    assert.equal(await picker.isVisible(), true)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    await switchTo(4)
    assert.equal(await title.inputValue(), '山河故人')
    await page.setViewportSize({ width: 1440, height: 1000 })
  })

  await check('AI generation follows the selected work and does not carry results to another work', async () => {
    const generations = []
    page.on('request', request => { if (request.url().endsWith('/content/ai/outline')) generations.push(request.postDataJSON()) })
    await page.getByLabel('你的要求', { exact: true }).fill('为山河故人设计父女重逢的大纲。')
    await page.getByRole('button', { name: '生成大纲', exact: true }).click()
    await page.locator('.creation-ai .ai-result').waitFor()
    assert.equal(Number(generations.at(-1).workId), 4)
    await switchTo(1)
    assert.equal(await page.locator('.creation-ai .ai-result').count(), 0)
    await page.getByLabel('你的要求', { exact: true }).fill('为归途列车设计列车悬疑大纲。')
    await page.getByRole('button', { name: '生成大纲', exact: true }).click()
    await page.locator('.creation-ai .ai-result').waitFor()
    assert.equal(Number(generations.at(-1).workId), 1)
    await page.waitForFunction(() => !document.querySelector('.el-message'))
    if (process.env.SCREENSHOT_PATH) await page.screenshot({ path: process.env.SCREENSHOT_PATH })
  })

  await check('missing work or chapter fails safely without enabling save', async () => {
    await page.goto(base + '/works/create?workId=99999')
    await page.getByRole('alert').filter({ hasText: '作品不存在' }).first().waitFor()
    assert.equal(await page.getByRole('button', { name: '保存草稿', exact: true }).isDisabled(), true)
    await switchTo(3)
    assert.equal(await title.inputValue(), '第三次告白')
    await page.goto(base + '/works/create?workId=3&chapterId=99999')
    await page.getByRole('alert').filter({ hasText: '该章节不存在' }).waitFor()
    assert.equal(await page.getByRole('button', { name: '保存草稿', exact: true }).isDisabled(), true)
  })

  await check('legacy drafts migrate without losing pending content when the work is now under review', async () => {
    const legacyContext = await browser.newContext()
    await mockCreatorApi(legacyContext)
    await legacyContext.addInitScript(() => {
      localStorage.setItem('PcUser-Token', 'browser-test-only')
      localStorage.setItem('PcUser-CreationDraft:7', JSON.stringify({
        createdId: 2, form: { title: '长夜将明', genreId: '1', summary: '' },
        chapters: [{ chapterId: 20, chapterTitle: '待恢复的章节', content: '这段旧版草稿必须保留。' }], characters: '',
      }))
    })
    const legacyPage = await legacyContext.newPage()
    await legacyPage.goto(base + '/works/create')
    await legacyPage.waitForFunction(() => new URL(location.href).searchParams.get('workId') === '2' && !document.querySelector('.creation-work-select').disabled)
    assert.equal(await legacyPage.getByRole('button', { name: '保存草稿', exact: true }).isDisabled(), true)
    assert.equal(await legacyPage.evaluate(() => localStorage.getItem('PcUser-CreationDraft:7')), null)
    assert.match(await legacyPage.evaluate(() => localStorage.getItem('PcUser-CreationDraft:7:work:2')), /这段旧版草稿必须保留/)
    await legacyContext.close()
  })
  assert.deepEqual(errors, [])
  console.log(`PASS ${checks.length} chapter workspace browser checks`)
} finally {
  await browser.close()
}
