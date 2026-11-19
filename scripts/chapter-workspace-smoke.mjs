import assert from 'node:assert/strict'
import * as playwright from 'playwright'
import { mockCreatorApi } from './fixtures/creator-api.mjs'
import { documentText } from '../src/utils/document.js'

const base = (process.env.PREVIEW_URL || 'http://127.0.0.1:3001/user').replace(/\/$/, '')
const browser = await playwright.chromium.launch({
  headless: true,
  channel: process.env.PW_BROWSER || undefined,
})
const checks = []
async function check(name, run) { await run(); checks.push(name); console.log('PASS ' + name) }
try {
  await check('canceling a continuation keeps the partial chapter and makes no further requests', async () => {
    const context = await browser.newContext()
    await mockCreatorApi(context)
    await context.addInitScript(() => localStorage.setItem('PcUser-Token', 'browser-test-only'))
    const page = await context.newPage()
    await page.route('**/content/ai/outline/stream', route => route.fulfill({ contentType: 'text/event-stream', body: 'data: ' + JSON.stringify({ delta: '第一集：相遇\n车站相遇。\n第二集：告别\n车站告别。' }) + '\n\ndata: {"done":true}\n\n' }))
    let requests = 0
    await page.route('**/content/ai/write/stream', route => { requests++; return route.fulfill({ contentType: 'text/event-stream', body: 'data: {"delta":"部分正文"}\n\ndata: {"done":true,"truncated":true}\n\n' }) })
    await page.goto(base + '/works/create')
    await page.waitForFunction(() => !document.querySelector('.creation-title')?.disabled)
    await page.getByLabel('你的要求', { exact: true }).fill('故事')
    await page.getByRole('button', { name: '生成大纲', exact: true }).click()
    await page.getByRole('button', { name: '按大纲生成各章', exact: true }).click()
    await page.getByRole('button', { name: '开始生成', exact: true }).click()
    await page.getByRole('button', { name: '暂时停止', exact: true }).click()
    await page.getByRole('alert').filter({ hasText: '尚未写完' }).first().waitFor()
    assert.equal(requests, 1)
    const draft = await page.evaluate(() => JSON.parse(localStorage.getItem('PcUser-CreationDraft:7')))
    assert.equal(draft.chapters.length, 1)
    assert.match(documentText(draft.chapters[0].content), /部分正文/)
    await context.close()
  })
  await check('a truncated chapter waits for confirmation before spending quota on continuation', async () => {
    const context = await browser.newContext()
    await mockCreatorApi(context)
    await context.addInitScript(() => localStorage.setItem('PcUser-Token', 'browser-test-only'))
    const page = await context.newPage()
    await page.route('**/content/ai/outline/stream', route => route.fulfill({ contentType: 'text/event-stream', body: 'data: ' + JSON.stringify({ delta: '第一集：相遇\n车站相遇。\n第二集：告别\n车站告别。' }) + '\n\ndata: {"done":true}\n\n' }))
    const requests = []
    await page.route('**/content/ai/write/stream', route => {
      requests.push(route.request().postDataJSON())
      const content = ['第一段', '续写结束', '第二章正文'][requests.length - 1]
      return route.fulfill({ contentType: 'text/event-stream', body: 'data: ' + JSON.stringify({ delta: content }) + '\n\ndata: ' + JSON.stringify({ done: true, truncated: requests.length === 1 }) + '\n\n' })
    })
    await page.goto(base + '/works/create')
    await page.waitForFunction(() => !document.querySelector('.creation-title')?.disabled)
    await page.getByLabel('你的要求', { exact: true }).fill('故事')
    await page.getByRole('button', { name: '生成大纲', exact: true }).click()
    await page.getByRole('button', { name: '按大纲生成各章', exact: true }).click()
    await page.getByRole('button', { name: '开始生成', exact: true }).click()
    await page.getByRole('dialog', { name: '章节需要续写' }).waitFor()
    assert.equal(requests.length, 1)
    const partial = await page.evaluate(() => JSON.parse(localStorage.getItem('PcUser-CreationDraft:7')))
    assert.match(documentText(partial.chapters[0].content), /第一段/)
    await page.getByRole('button', { name: '续写本章', exact: true }).click()
    await page.getByText('已生成 2 章，请检查后保存草稿').waitFor()
    assert.equal(requests.length, 3)
    assert.match(requests[1].prompt, /第一段/)
    const draft = await page.evaluate(() => JSON.parse(localStorage.getItem('PcUser-CreationDraft:7')))
    assert.match(documentText(draft.chapters[0].content), /第一段[\s\S]*续写结束/)
    assert.match(documentText(draft.chapters[1].content), /第二章正文/)
    await context.close()
  })
  await check('changes from another page prevent generation before spending quota', async () => {
    const context = await browser.newContext()
    const state = await mockCreatorApi(context)
    await context.addInitScript(() => localStorage.setItem('PcUser-Token', 'browser-test-only'))
    const page = await context.newPage()
    let writes = 0
    await page.route('**/content/ai/outline/stream', route => route.fulfill({ contentType: 'text/event-stream', body: 'data: ' + JSON.stringify({ delta: '第一集：相遇\n车站相遇。' }) + '\n\ndata: {"done":true}\n\n' }))
    await page.route('**/content/ai/write/stream', route => { writes++; return route.abort() })
    await page.goto(base + '/works/create?workId=3')
    await page.waitForFunction(() => !document.querySelector('.creation-title')?.disabled)
    await page.getByLabel('你的要求', { exact: true }).fill('故事')
    await page.getByRole('button', { name: '生成大纲', exact: true }).click()
    state.chapters[3][0].chapterNo = 9
    await page.getByRole('button', { name: '按大纲生成各章', exact: true }).click()
    await page.getByRole('alert').filter({ hasText: '其他页面变更' }).first().waitFor()
    assert.equal(writes, 0)
    assert.equal(await page.getByRole('button', { name: '开始生成', exact: true }).count(), 0)
    await context.close()
  })
  await check('batch failure keeps completed chapters and does not fill the failed chapter', async () => {
    const context = await browser.newContext()
    await mockCreatorApi(context)
    await context.addInitScript(() => localStorage.setItem('PcUser-Token', 'browser-test-only'))
    const page = await context.newPage()
    await page.route('**/content/ai/outline/stream', route => route.fulfill({ contentType: 'text/event-stream', body: 'data: ' + JSON.stringify({ delta: '第一集：相遇\n车站相遇。\n第二集：告别\n车站告别。' }) + '\n\ndata: {"done":true}\n\n' }))
    let count = 0
    await page.route('**/content/ai/write/stream', route => {
      count++
      return route.fulfill({ contentType: 'text/event-stream', body: count === 1 ? 'data: {"delta":"第一集正文"}\n\ndata: {"done":true}\n\n' : 'event: error\ndata: {"code":400,"message":"AI次数不足"}\n\n' })
    })
    await page.goto(base + '/works/create')
    await page.waitForFunction(() => !document.querySelector('.creation-title')?.disabled)
    await page.getByLabel('你的要求', { exact: true }).fill('故事')
    await page.getByRole('button', { name: '生成大纲', exact: true }).click()
    await page.getByRole('button', { name: '按大纲生成各章', exact: true }).click()
    await page.getByRole('button', { name: '开始生成', exact: true }).click()
    await page.getByRole('alert').filter({ hasText: '已生成 1 章' }).first().waitFor()
    const draft = await page.evaluate(() => JSON.parse(localStorage.getItem('PcUser-CreationDraft:7')))
    assert.deepEqual(draft.chapters.map(c => [c.chapterTitle, documentText(c.content)]), [['第一集：相遇', '第一集正文']])
    await context.close()
  })
  await check('outline generation fills matching empty chapters and preserves existing text', async () => {
    const context = await browser.newContext()
    const state = await mockCreatorApi(context)
    state.chapters[3] = [
      { chapterId: 30, chapterNo: 1, chapterTitle: '第1章 相遇', content: '已有正文', status: '0', wordCount: 4 },
      { chapterId: 31, chapterNo: 2, chapterTitle: '第贰章（告别）', content: '', status: '1', wordCount: 0 },
      { chapterId: 32, chapterNo: 4, chapterTitle: '第4集：不同名称', content: '', status: '1', wordCount: 0 }
    ]
    await context.addInitScript(() => localStorage.setItem('PcUser-Token', 'browser-test-only'))
    const page = await context.newPage()
    const requests = []
    await page.route('**/content/ai/outline/stream', route => route.fulfill({ contentType: 'text/event-stream', body: 'data: ' + JSON.stringify({ delta: '第一集：相遇\n两人在车站相遇。\n第二集：告别\n两人依依惜别。\n第三集：重逢\n多年后再次相见。\n第四章：终章\n故事结束。\n第五集：续篇\n新的开始。' }) + '\n\ndata: {"done":true}\n\n' }))
    await page.route('**/content/ai/write/stream', route => {
      const body = route.request().postDataJSON(); requests.push(body)
      return route.fulfill({ contentType: 'text/event-stream', body: 'data: ' + JSON.stringify({ delta: body.prompt.includes('为“第二集：告别”') ? '告别正文' : '重逢正文' }) + '\n\ndata: {"done":true}\n\n' })
    })
    await page.goto(base + '/works/create?workId=3')
    await page.waitForFunction(() => !document.querySelector('.creation-title')?.disabled)
    await page.getByLabel('你的要求', { exact: true }).fill('写一个重逢故事')
    await page.getByRole('button', { name: '生成大纲', exact: true }).click()
    await page.getByRole('button', { name: '按大纲生成各章', exact: true }).click()
    await page.getByRole('dialog').getByText('第三集：重逢：冲突，跳过', { exact: false }).waitFor()
    await page.getByRole('dialog').getByText('第四章：终章：冲突，跳过', { exact: false }).waitFor()
    await page.getByRole('button', { name: '开始生成', exact: true }).click()
    await page.getByText('已生成 2 章，请检查后保存草稿').waitFor()
    assert.equal(requests.length, 2)
    assert.ok(requests.every(request => request.workId === 3))
    const draft = await page.evaluate(() => JSON.parse(localStorage.getItem('PcUser-CreationDraft:7:work:3')))
    assert.deepEqual(draft.chapters.map(c => [c.chapterTitle, c.content]), [['第1章 相遇', '已有正文'], ['第贰章（告别）', '告别正文'], ['第4集：不同名称', ''], ['第五集：续篇', '重逢正文']])
    await context.close()
  })
  await check('a trial draft can be published from the work detail', async () => {
    const context = await browser.newContext()
    const state = await mockCreatorApi(context)
    state.chapters[3][0].status = '1'
    state.chapters[3][0].isFree = '1'
    await context.addInitScript(() => localStorage.setItem('PcUser-Token', 'browser-test-only'))
    const page = await context.newPage()
    await page.route('**/api/v1/content/chapters/30', async route => {
      assert.deepEqual(route.request().postDataJSON(), { status: '0' })
      state.chapters[3][0].status = '0'
      await route.fulfill({ json: { code: 200, data: {} } })
    })
    await page.goto(base + '/works/3')
    const row = page.locator('tbody tr').first()
    await row.getByText('草稿', { exact: true }).waitFor()
    await row.getByRole('button', { name: '发布', exact: true }).click()
    await row.getByText('已发布', { exact: true }).waitFor()
    assert.equal(state.chapters[3][0].isFree, '1')
    await context.close()
  })
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

  await check('only approved chapters have an independent trial switch on the detail page', async () => {
    const trialContext = await browser.newContext()
    try {
      const state = await mockCreatorApi(trialContext)
      const list = state.chapters[4]
      list[0].isFree = '0'
      list[1].status = '1'
      list[2].status = '2'
      await trialContext.addInitScript(() => localStorage.setItem('PcUser-Token', 'browser-test-only'))
      const trialPage = await trialContext.newPage()
      await trialPage.goto(base + '/works/4')
      const rows = trialPage.locator('.creator-catalog').first().locator('tbody tr')
      await rows.first().getByText('审核通过', { exact: true }).waitFor()
      await rows.nth(1).getByText('草稿', { exact: true }).waitFor()
      await rows.nth(2).getByText('未通过审核', { exact: true }).waitFor()
      assert.equal(await rows.getByRole('switch').count(), 1)
      const input = rows.first().getByRole('switch')
      for (const enabled of [true, false]) {
        const response = trialPage.waitForResponse(res => res.url().endsWith('/works/4/chapters/40') && res.request().method() === 'PUT')
        await input.locator('..').click()
        assert.deepEqual((await response).request().postDataJSON(), { isFree: enabled ? '1' : '0' })
        await trialPage.waitForFunction(value => document.querySelector('.creator-catalog [role=switch]')?.getAttribute('aria-checked') === value, String(enabled))
      }
      await trialPage.reload()
      await input.locator('..').waitFor()
      assert.equal(await input.getAttribute('aria-checked'), 'false')
      assert.equal(list[0].content, '雨夜，列车驶入站台。')
    } finally { await trialContext.close() }
  })
  await check('editing does not auto-save and a reload preserves the local draft', async () => {
    const trialContext = await browser.newContext()
    try {
      const state = await mockCreatorApi(trialContext)
      await trialContext.addInitScript(() => localStorage.setItem('PcUser-Token', 'browser-test-only'))
      const trialPage = await trialContext.newPage()
      await trialPage.goto(base + '/works/create?workId=4&chapterId=40')
      const toggle = trialPage.getByRole('switch', { name: '开启章节试读' })
      await toggle.locator('..').waitFor()
      const before = state.calls.length
      const title = trialPage.getByRole('textbox', { name: '分集标题' })
      await title.fill('等待手动保存的分集')
      await trialPage.getByText('有未保存的修改', { exact: true }).waitFor()
      await trialPage.waitForTimeout(5600)
      assert.equal(state.calls.slice(before).filter(call => call.method !== 'GET').length, 0)
      assert.equal(await toggle.count(), 0)
      await trialPage.reload()
      await trialPage.waitForFunction(() => document.querySelector('.episode-title')?.value === '等待手动保存的分集')
    } finally { await trialContext.close() }
  })
  assert.deepEqual(errors, [])
  console.log(`PASS ${checks.length} chapter workspace browser checks`)
} finally {
  await browser.close()
}
