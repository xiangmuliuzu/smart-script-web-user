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
  await check('writing a new chapter opens the workspace, restores its draft and saves only the new chapter', async () => {
    const context = await browser.newContext()
    const state = await mockCreatorApi(context)
    const original = structuredClone(state.chapters[3])
    await context.addInitScript(() => localStorage.setItem('PcUser-Token', 'browser-test-only'))
    const page = await context.newPage()
    await page.goto(base + '/works/3')
    await page.getByRole('button', { name: '＋ 写新章节', exact: true }).click()
    await page.waitForURL(base + '/works/create?workId=3&chapterId=new', { timeout: 5000 })
    await page.waitForFunction(() => document.querySelector('.creation-title')?.disabled === false)
    const title = page.getByLabel('分集标题', { exact: true })
    const editor = page.getByLabel('分集正文', { exact: true })
    assert.equal(await page.getByLabel('选择作品', { exact: true }).inputValue(), '3')
    assert.equal(await title.inputValue(), '第 4 集')
    assert.equal((await editor.innerText()).trim(), '')
    assert.equal(await page.getByRole('dialog', { name: '新建章节', exact: true }).count(), 0)
    assert.equal(state.calls.filter(call => call.method !== 'GET').length, 0)
    await title.fill('新的故事')
    await editor.fill('新章节的正文，不能覆盖已有章节。')
    await page.reload()
    await page.waitForFunction(() => document.querySelector('.creation-title')?.disabled === false)
    assert.equal(await page.locator('.creation-directory .episode-select').count(), 4)
    assert.equal(await title.inputValue(), '新的故事')
    assert.match(await editor.innerText(), /新章节的正文/)
    await page.getByRole('button', { name: '保存草稿', exact: true }).click()
    await page.waitForURL(base + '/works/3')
    assert.equal(state.chapters[3].length, 4)
    assert.deepEqual(state.chapters[3].slice(0, 3), original)
    assert.deepEqual(state.calls.filter(call => call.method !== 'GET'), [{ path: '/api/v1/users/me/works/3/chapters', method: 'POST' }])
    await page.locator('tbody tr').filter({ hasText: '新的故事' }).waitFor()
    await context.close()
  })

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
    page.on('request', request => { if (request.url().endsWith('/content/ai/outline/stream')) generations.push(request.postDataJSON()) })
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

  await check('trial flags load per chapter, survive reload and save independently of text edits', async () => {
    const trialContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const trialState = await mockCreatorApi(trialContext)
    trialState.chapters[3][1].isFree = '1'
    await trialContext.addInitScript(() => localStorage.setItem('PcUser-Token', 'browser-test-only'))
    const trialPage = await trialContext.newPage()
    const toggle = trialPage.getByRole('switch', { name: '设为试读章节（免费阅读）', exact: true })
    const ready = () => trialPage.waitForFunction(() => document.querySelector('.creation-title')?.disabled === false)
    await trialPage.goto(base + '/works/create?workId=3&chapterId=31')
    await ready()
    assert.equal(await toggle.isChecked(), true)
    await toggle.locator('..').click()
    await trialPage.locator('.creation-directory .episode-select').first().click()
    assert.equal(await toggle.isChecked(), false)
    await trialPage.locator('.creation-directory .episode-select').nth(1).click()
    assert.equal(await toggle.isChecked(), false)
    await trialPage.waitForFunction(() => JSON.parse(localStorage.getItem('PcUser-CreationDraft:7:work:3'))?.chapters[1].isFree === '0')
    await trialPage.reload()
    await ready()
    assert.equal(await toggle.isChecked(), false)
    const before = trialState.calls.length
    await trialPage.getByRole('button', { name: '保存草稿', exact: true }).click()
    await trialPage.waitForURL(base + '/works/3')
    assert.equal(trialState.chapters[3][1].isFree, '0')
    assert.deepEqual(trialState.calls.slice(before).filter(call => call.method !== 'GET'), [{ path: '/api/v1/users/me/works/3/chapters/31', method: 'PUT' }])
    await trialPage.locator('tbody tr').nth(1).getByRole('button', { name: '编辑', exact: true }).click()
    await ready()
    await toggle.locator('..').click()
    await trialPage.getByRole('button', { name: '保存草稿', exact: true }).click()
    await trialPage.waitForURL(base + '/works/3')
    assert.equal(trialState.chapters[3][1].isFree, '1')
    await trialPage.locator('tbody tr').nth(1).getByText('试读', { exact: true }).waitFor()
    await trialPage.goto(base + '/works/create?workId=2')
    await trialPage.getByRole('status').filter({ hasText: '作品正在审核中' }).waitFor()
    assert.equal(await toggle.isDisabled(), true)
    await trialContext.close()
  })

  await check('trial-only changes detect concurrent text edits and failed saves keep the selected flag', async () => {
    const trialContext = await browser.newContext()
    const trialState = await mockCreatorApi(trialContext)
    await trialContext.addInitScript(() => localStorage.setItem('PcUser-Token', 'browser-test-only'))
    const trialPage = await trialContext.newPage()
    await trialPage.goto(base + '/works/create?workId=3&chapterId=30')
    await trialPage.waitForFunction(() => document.querySelector('.creation-title')?.disabled === false)
    const toggle = trialPage.getByRole('switch', { name: '设为试读章节（免费阅读）', exact: true })
    await toggle.locator('..').click()
    const originalContent = trialState.chapters[3][0].content
    trialState.chapters[3][0].content = '其他页面刚保存的正文，不能被试读设置覆盖。'
    const before = trialState.calls.length
    await trialPage.getByRole('button', { name: '保存草稿', exact: true }).click()
    await trialPage.locator('.creation-error').filter({ hasText: '章节已在其他页面修改' }).waitFor()
    assert.equal(trialState.calls.slice(before).filter(call => call.method !== 'GET').length, 0)
    assert.equal(await toggle.isChecked(), true)
    trialState.chapters[3][0].content = originalContent
    await trialPage.route('**/api/v1/users/me/works/3/chapters/30', route => route.fulfill({ json: { code: 500, message: '试读设置保存失败' } }))
    await trialPage.getByRole('button', { name: '保存草稿', exact: true }).click()
    await trialPage.locator('.creation-error').filter({ hasText: '试读设置保存失败' }).waitFor()
    assert.equal(await toggle.isChecked(), true)
    await trialPage.unroute('**/api/v1/users/me/works/3/chapters/30')
    await trialPage.getByRole('button', { name: '保存草稿', exact: true }).click()
    await trialPage.waitForURL(base + '/works/3')
    assert.equal(trialState.chapters[3][0].isFree, '1')
    await trialContext.close()
  })
  await check('legacy drafts preserve existing trial flags and new chapters can be marked for trial', async () => {
    const trialContext = await browser.newContext()
    const trialState = await mockCreatorApi(trialContext)
    trialState.chapters[3][0].isFree = '1'
    const legacyDraft = {
      createdId: 3, form: { title: '第三次告白', genreId: '2', summary: '电台主播的故事。' },
      chapters: trialState.chapters[3].map(({ chapterId, chapterTitle, content }) => ({ chapterId, chapterTitle, content })), characters: '',
    }
    await trialContext.addInitScript(draft => {
      localStorage.setItem('PcUser-Token', 'browser-test-only')
      localStorage.setItem('PcUser-CreationDraft:7:work:3', JSON.stringify(draft))
    }, legacyDraft)
    const trialPage = await trialContext.newPage()
    const toggle = trialPage.getByRole('switch', { name: '设为试读章节（免费阅读）', exact: true })
    await trialPage.goto(base + '/works/create?workId=3')
    await trialPage.waitForFunction(() => document.querySelector('.creation-title')?.disabled === false)
    assert.equal(await toggle.isChecked(), true)
    await trialPage.goto(base + '/works/create')
    await trialPage.waitForFunction(() => document.querySelector('.creation-title')?.disabled === false)
    assert.equal(await toggle.isChecked(), false)
    await trialPage.getByLabel('作品名称', { exact: true }).fill('新作品的试读章节')
    await trialPage.getByLabel('分类', { exact: true }).selectOption('1')
    await toggle.locator('..').click()
    await trialPage.getByRole('button', { name: '保存草稿', exact: true }).click()
    await trialPage.getByRole('alert').filter({ hasText: '请输入正文或上传草稿' }).first().waitFor()
    assert.equal(trialState.works.length, 4)
    await trialPage.getByLabel('分集正文', { exact: true }).fill('读者可以免费阅读这段新正文。')
    await trialPage.getByRole('button', { name: '保存草稿', exact: true }).click()
    await trialPage.waitForURL(base + '/works/5')
    assert.equal(trialState.chapters[5][0].isFree, '1')
    await trialPage.locator('tbody tr').first().getByText('试读', { exact: true }).waitFor()
    await trialContext.close()
  })
  assert.deepEqual(errors, [])
  console.log(`PASS ${checks.length} chapter workspace browser checks`)
} finally {
  await browser.close()
}
