import assert from 'node:assert/strict'
import { mockCreatorApi } from './fixtures/creator-api.mjs'
import * as playwright from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
const { chromium } = playwright
const base = (process.env.PREVIEW_URL || 'http://127.0.0.1:3001/user').replace(/\/$/, '')
const shots = fileURLToPath(new URL('../docs/screenshots/', import.meta.url))
await mkdir(shots, { recursive: true })
const browser = await chromium.launch({ headless: true })
const checks = []
const errors = []
async function check(name, run) { await run(); checks.push(name); console.log('PASS ' + name) }
async function selectText(editor) {
  await editor.evaluate(element => { element.focus(); const range = document.createRange(); range.selectNodeContents(element); const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range); document.dispatchEvent(new Event('selectionchange')) })
}
async function choose(page, name, value) {
  const picker = page.locator('.document-toolbar .ql-picker.' + name)
  await picker.locator('.ql-picker-label').click()
  await picker.locator(`.ql-picker-item[data-value="${value}"]`).click()
}
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  await mockCreatorApi(context)
  await context.addInitScript(() => localStorage.setItem('PcUser-Token', 'browser-test-only'))
  const page = await context.newPage()
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(base + '/works/create')
  await page.getByRole('button', { name: '保存草稿', exact: true }).waitFor()
  const editor = page.getByLabel('分集正文', { exact: true })
  await check('single global header, three desktop columns and single scrolling toolbar', async () => {
    assert.equal(await page.locator('.topbar').count(), 1)
    assert.equal(await page.locator('.creation-header .avatar').count(), 0)
    const columns = await page.locator('.creation-columns').evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').map(parseFloat))
    assert.equal(columns.length, 3); assert.ok(columns[1] > columns[0] && columns[1] > columns[2])
    const toolbar = await page.locator('.document-toolbar').evaluate(element => ({ height: element.clientHeight, width: element.clientWidth, total: element.scrollWidth }))
    assert.ok(toolbar.height < 55 && toolbar.total > toolbar.width)
  })
  await check('font, size, bold and alignment format real selected text', async () => {
    await page.getByLabel('作品名称', { exact: true }).fill('雨夜惊魂')
    await page.getByLabel('分类', { exact: true }).selectOption('1')
    await editor.fill('林深坐在角落，手里的咖啡已经凉了。')
    await selectText(editor); await choose(page, 'ql-font', 'songti')
    await selectText(editor); await choose(page, 'ql-size', '24px')
    await selectText(editor); await page.getByRole('button', { name: '加粗', exact: true }).click()
    assert.match(await editor.innerHTML(), /ql-font-songti/); assert.match(await editor.innerHTML(), /font-size: 24px/); assert.match(await editor.innerHTML(), /<strong/)
    await selectText(editor); await choose(page, 'ql-align', 'center')
    assert.match(await editor.innerHTML(), /ql-align-center/)
    await page.waitForTimeout(500)
    await page.reload(); await editor.waitFor()
    assert.match(await editor.innerHTML(), /ql-font-songti/); assert.match(await editor.innerHTML(), /font-size: 24px/); assert.match(await editor.innerHTML(), /ql-align-center/)
  })
  await check('reading mode preserves formatted drafts and prevents edits', async () => {
    const original = await editor.innerHTML()
    const title = await page.getByLabel('分集标题', { exact: true }).inputValue()
    await page.getByRole('button', { name: '阅读', exact: true }).click()
    assert.equal(await page.getByRole('button', { name: '阅读', exact: true }).getAttribute('aria-pressed'), 'true')
    assert.equal(await editor.getAttribute('contenteditable'), 'false')
    assert.equal(await page.locator('.document-toolbar-frame').isVisible(), false)
    assert.equal(await page.getByLabel('分集标题', { exact: true }).getAttribute('readonly'), '')
    assert.equal(await page.getByRole('button', { name: '新建分集', exact: true }).isDisabled(), true)
    assert.equal(await page.getByRole('button', { name: '导入剧本', exact: true }).isDisabled(), true)
    await page.getByRole('button', { name: '故事简介', exact: true }).click()
    assert.equal(await page.getByLabel('故事简介', { exact: true }).getAttribute('readonly'), '')
    await page.getByRole('button', { name: '人物便签', exact: true }).click()
    assert.equal(await page.getByLabel('人物便签', { exact: true }).getAttribute('readonly'), '')
    await page.getByRole('navigation', { name: '正文分集', exact: true }).locator('.episode-select').first().click()
    assert.equal(await editor.innerHTML(), original)
    assert.equal(await editor.getAttribute('contenteditable'), 'false')
    await page.getByRole('button', { name: '编辑', exact: true }).click()
    assert.equal(await editor.getAttribute('contenteditable'), 'true')
    assert.equal(await page.locator('.document-toolbar-frame').isVisible(), true)
    assert.equal(await page.getByLabel('分集标题', { exact: true }).inputValue(), title)
    assert.equal(await editor.innerHTML(), original)
  })
  await check('chapter switching, removal and AI append preserve previous text and formatting', async () => {
    const first = await editor.innerHTML()
    await page.getByRole('button', { name: '新建分集', exact: true }).click(); await editor.fill('第二集的雨还在下。')
    await page.getByRole('navigation', { name: '正文分集', exact: true }).locator('.episode-select').first().click()
    assert.equal(await editor.innerHTML(), first)
    await page.getByLabel('你的要求', { exact: true }).fill('旧友在雨夜重逢，续写一个悬念。')
    await page.getByRole('button', { name: '生成大纲', exact: true }).click(); await page.locator('.ai-result').waitFor()
    await page.getByRole('button', { name: '插入正文', exact: true }).click()
    assert.match(await editor.innerText(), /林深坐在角落/); assert.match(await editor.innerText(), /第一集 · 深夜频率/); assert.match(await editor.innerHTML(), /ql-font-songti/)
    await page.locator('.episode-card').first().getByRole('button', { name: /^删除分集：/ }).click(); await page.getByRole('button', { name: '保留', exact: true }).click()
    assert.equal(await page.getByRole('navigation', { name: '正文分集', exact: true }).locator('.episode-select').count(), 2)
  })
  await check('default episode names stay numeric and card corner deletion preserves the active chapter', async () => {
    const cards = page.getByRole('navigation', { name: '正文分集', exact: true }).locator('.episode-card')
    assert.equal(await cards.first().locator('.episode-name').innerText(), '第 1 集')
    assert.equal(await cards.nth(1).locator('.episode-name').innerText(), '第 2 集')
    assert.equal(await page.getByRole('button', { name: '删除当前分集', exact: true }).count(), 0)
    await page.getByRole('button', { name: '新建分集', exact: true }).click()
    assert.equal(await page.getByLabel('分集标题', { exact: true }).inputValue(), '第 3 集')
    await editor.fill('第三集的正文不能因为删除其他分集而变化。')
    const corner = await cards.nth(1).evaluate(card => { const button = card.querySelector('.episode-delete'); const rect = card.getBoundingClientRect(), corner = button.getBoundingClientRect(); return { right: rect.right - corner.right, bottom: rect.bottom - corner.bottom } })
    assert.ok(corner.right < 20 && corner.bottom < 15)
    await cards.nth(1).getByRole('button', { name: /^删除分集：/ }).click()
    await page.getByRole('button', { name: '删除', exact: true }).click()
    assert.equal(await cards.count(), 2)
    assert.match(await editor.innerText(), /第三集的正文不能因为删除其他分集而变化/)
    assert.equal(await page.getByLabel('分集标题', { exact: true }).inputValue(), '第 2 集')
    await cards.first().locator('.episode-select').click()
    assert.match(await editor.innerText(), /林深坐在角落/)
    assert.match(await editor.innerHTML(), /ql-font-songti/)
  })
  await check('toolbar arrows, font menu and layout adapt from wide desktop to phone', async () => {
    for (const width of [1920, 1440, 1280, 1024, 768, 390]) {
      await page.setViewportSize({ width, height: 900 }); await page.waitForTimeout(100)
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `page overflow at ${width}`)
      const paperContainsText = await editor.evaluate(element => element.getBoundingClientRect().bottom <= element.closest('.script-paper').getBoundingClientRect().bottom)
      assert.equal(paperContainsText, true, `document extends below paper at ${width}`)
      const toolbar = page.locator('.document-toolbar')
      await toolbar.evaluate(element => { element.scrollLeft = 0 })
      await page.getByRole('button', { name: '向右滚动工具栏', exact: true }).click(); await page.waitForTimeout(350)
      assert.ok(await toolbar.evaluate(element => element.scrollLeft > 0))
      await page.getByRole('button', { name: '向左滚动工具栏', exact: true }).click(); await page.waitForTimeout(350)
      await page.locator('.ql-font .ql-picker-label').click()
      // 下拉菜单在 requestAnimationFrame 中定位，先等待实际布局完成再检查边界。
      await page.waitForFunction(viewportWidth => {
        const bounds = document.querySelector('.ql-font .ql-picker-options')?.getBoundingClientRect()
        return bounds && bounds.x >= 0 && bounds.right <= viewportWidth && bounds.height > 100
      }, width)
      const menu = await page.locator('.ql-font .ql-picker-options').evaluate(element => element.getBoundingClientRect().toJSON())
      assert.ok(menu.x >= 0 && menu.right <= width && menu.height > 100, `font menu outside viewport at ${width}: ${JSON.stringify(menu)}`)
      await page.keyboard.press('Escape'); await editor.click()
      await page.screenshot({ path: shots + `creation-workspace-${width}.png`, fullPage: true })
    }
    await page.getByRole('button', { name: '☰ 分集与资料', exact: true }).click()
    await page.getByRole('dialog', { name: '分集与资料', exact: true }).getByRole('button', { name: '人物便签', exact: true }).click()
    await page.getByLabel('人物便签', { exact: true }).fill('林深：咖啡馆店主，与苏浅重逢。')
    const downloaded = page.waitForEvent('download'); await page.getByRole('button', { name: '导出人物便签', exact: true }).click(); assert.match((await downloaded).suggestedFilename(), /人物便签.txt$/)
    await page.getByRole('button', { name: '✦ AI 助手', exact: true }).click()
    await page.getByRole('dialog', { name: 'AI 创作助手', exact: true }).locator('.ai-result').waitFor()
    await page.getByRole('button', { name: 'Close this dialog', exact: true }).click()
  })
  await check('restoring a formatted draft strips executable markup and keeps safe formatting', async () => {
    const safeContext = await browser.newContext()
    await mockCreatorApi(safeContext)
    await safeContext.addInitScript(() => localStorage.setItem('PcUser-Token', 'browser-test-only'))
    await safeContext.addInitScript(() => localStorage.setItem('PcUser-CreationDraft:7', JSON.stringify({ form: { title: '安全恢复验证', genreId: 1, summary: '', scriptUrl: '', scriptName: '', scriptSize: 0 }, chapters: [{ chapterTitle: '第一集', content: '<div data-script-document="1"><p><strong>安全正文</strong></p><img src=x onerror="window.unsafeDocument=1"><script>window.unsafeDocument=2</script><iframe srcdoc="bad"></iframe></div>' }], characters: '', createdId: null })))
    const safePage = await safeContext.newPage(); safePage.on('pageerror', error => errors.push(error.message))
    await safePage.goto(base + '/works/create'); await safePage.getByLabel('分集正文', { exact: true }).waitFor()
    assert.match(await safePage.getByLabel('分集正文', { exact: true }).innerHTML(), /<strong>安全正文<\/strong>/)
    assert.equal(await safePage.locator('.rich-document img,.rich-document script,.rich-document iframe').count(), 0)
    assert.equal(await safePage.evaluate(() => window.unsafeDocument), undefined)
    assert.equal(await safePage.getByLabel('分类', { exact: true }).inputValue(), '1')
    await safeContext.close()
  })
  const real = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  await real.addInitScript(() => localStorage.setItem('PcUser-Token', 'creation-test-only'))
  const apiPage = await real.newPage(); apiPage.on('pageerror', error => errors.push(error.message))
  const chapters = []
  let work = null, createCalls = 0, chapterAdds = 0, lostResponse = false, submitted = false
  await apiPage.route('**/dev-api/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname.replace('/dev-api', '')
    const body = request.method() === 'GET' ? null : request.postDataJSON()
    let payload = { code: 200, data: null }
    if (path.endsWith('/auth/getInfo')) payload = { code: 200, user: { userId: 73, userType: '01', nickname: '验证用户', authorCapability: true } }
    else if (path.endsWith('/categories')) payload.data = [{ categoryId: 1, categoryName: '都市悬疑' }]
    else if (path === '/api/v1/content/works') { createCalls++; work = { workId: 501, title: body.title, genreId: body.categoryId, summary: body.description, status: 'draft' }; payload.data = { workId: 501 } }
    else if (path.endsWith('/501/chapters') && request.method() === 'POST') {
      chapterAdds++; const chapter = { ...body, chapterId: chapters.length + 1, chapterNo: chapters.length + 1 }; chapters.push(chapter); payload.data = chapter
      // 模拟服务端已落库、客户端未收到成功响应；重试必须先对齐远端分集。
      if (chapters.length === 2 && !lostResponse) { lostResponse = true; payload = { code: 503, message: '模拟保存响应中断' } }
    } else if (/\/501\/chapters\/\d+$/.test(path)) Object.assign(chapters[Number(path.split('/').at(-1)) - 1], body)
    else if (path.endsWith('/501/submit')) { submitted = true; work.status = 'reviewing' }
    else if (path.endsWith('/501') && request.method() === 'PUT') Object.assign(work, body)
    else if (path.endsWith('/501')) payload.data = { work, chapters, latestReview: null }
    else if (path.endsWith('/users/me/works')) payload.data = work ? [work] : []
    else if (path.endsWith('/unread-count')) payload.data = { total: 0 }
    else if (path.endsWith('/real-name')) payload.data = { status: 'APPROVED' }
    else if (path.endsWith('/review-records')) payload.data = []
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(payload) })
  })
  await check('server-committed failed response retries without duplicate works or chapters', async () => {
    await apiPage.goto(base + '/works/create')
    await apiPage.getByLabel('作品名称', { exact: true }).fill('断线保存验证')
    await apiPage.getByLabel('分类', { exact: true }).selectOption('1')
    await apiPage.getByLabel('分集正文', { exact: true }).fill('第一集正文。')
    await apiPage.getByRole('button', { name: '新建分集', exact: true }).click(); await apiPage.getByLabel('分集正文', { exact: true }).fill('第二集正文。')
    await apiPage.getByRole('button', { name: '保存草稿', exact: true }).click(); await apiPage.getByText(/模拟保存响应中断/).first().waitFor()
    await apiPage.reload(); await apiPage.getByLabel('分集正文', { exact: true }).waitFor(); await apiPage.getByRole('button', { name: '保存草稿', exact: true }).click()
    await apiPage.getByRole('heading', { name: '断线保存验证', exact: true }).waitFor()
    assert.equal(createCalls, 1); assert.equal(chapterAdds, 2); assert.equal(chapters.length, 2)
    assert.equal(await apiPage.evaluate(() => localStorage.getItem('PcUser-CreationDraft:73')), null)
  })
  await check('publish action confirms and submits all chapters for review', async () => {
    await apiPage.getByRole('button', { name: '返回我的作品' }).click(); await apiPage.locator('.new-work').click()
    await apiPage.getByLabel('作品名称', { exact: true }).fill('审核验证')
    await apiPage.getByLabel('分类', { exact: true }).selectOption('1'); await apiPage.getByLabel('分集正文', { exact: true }).fill('可提交的完整正文。')
    chapters.splice(0); await apiPage.getByRole('button', { name: '提交审核', exact: true }).click()
    assert.equal(submitted, false); await apiPage.getByRole('button', { name: '保存并提交', exact: true }).click()
    await apiPage.getByRole('heading', { name: '审核验证', exact: true }).waitFor(); assert.equal(submitted, true)
    assert.equal(await apiPage.getByRole('button', { name: '＋ 写新章节', exact: true }).isDisabled(), true)
  })
  assert.deepEqual(errors, [])
  await writeFile(new URL('../docs/screenshots/creation-smoke-results.json', import.meta.url), JSON.stringify({ checks, errors }, null, 2) + '\n')
  console.log(`${checks.length} creation workspace checks passed; no runtime errors.`)
} finally { await browser.close() }
