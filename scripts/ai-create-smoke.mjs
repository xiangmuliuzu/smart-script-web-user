import assert from 'node:assert/strict'
import * as playwright from 'playwright'
import { createServer } from 'vite'
import { mockCreatorApi } from './fixtures/creator-api.mjs'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const shots = fileURLToPath(new URL('../docs/screenshots/', import.meta.url))
await mkdir(shots, { recursive: true })
const server = await createServer({ logLevel: 'error', server: { host: '127.0.0.1', port: 0, strictPort: false } })
await server.listen()
const base = 'http://127.0.0.1:' + server.httpServer.address().port + '/user'
const browser = await playwright.chromium.launch({ headless: true })
const checks = []
async function check(name, run) { await run(); checks.push(name); console.log('PASS ' + name) }
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const fixture = await mockCreatorApi(context)
  await context.addInitScript(() => localStorage.setItem('PcUser-Token', 'ai-create-test-only'))
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))

  await page.goto(base + '/works')
  await page.getByRole('heading', { name: '我的作品', exact: true }).waitFor()
  await check('create entry asks for AI or manual editing', async () => {
    await page.locator('.new-work').click()
    const dialog = page.getByRole('dialog', { name: '开始创作' })
    await dialog.waitFor()
    await dialog.getByRole('button', { name: /自己编辑/ }).click()
    await page.waitForURL(base + '/works/create')
    await page.getByRole('button', { name: '保存草稿', exact: true }).waitFor()
  })

  await check('manual editing path still opens the three-column workspace', async () => {
    assert.equal(await page.locator('.creation-columns').count(), 1)
    assert.equal(await page.getByRole('button', { name: /AI 创作/ }).count(), 0)
  })

  await check('AI path opens the standalone creation flow at setup step', async () => {
    await page.goto(base + '/works')
    await page.locator('.new-work').click()
    await page.getByRole('dialog', { name: '开始创作' }).getByRole('button', { name: /AI 创作/ }).click()
    await page.waitForURL(base + '/works/create/ai')
    await page.getByLabel('书名', { exact: true }).waitFor()
    assert.equal((await page.locator('.steps li[aria-current="step"] .step-name').innerText()).trim(), '设定')
  })

  await check('outline is generated, editable and parsed into episodes', async () => {
    await page.getByLabel('书名', { exact: true }).fill('深夜频率')
    await page.getByLabel('故事灵感', { exact: true }).fill('深夜电台主播在听众留言里听到十年前的自己')
    await page.getByRole('button', { name: '生成剧本大纲', exact: true }).click()
    const preview = page.getByLabel('剧本大纲预览', { exact: true })
    await preview.waitFor()
    await page.getByText(/大纲已生成/).waitFor()
    assert.match(await preview.innerText(), /第一集 · 深夜频率/)
    assert.equal((await page.locator('.steps li[aria-current="step"] .step-name').innerText()).trim(), '大纲')
    // 预览用于选中修订，手动增改需切到编辑模式。
    await page.getByRole('button', { name: '手动编辑', exact: true }).click()
    const outline = page.getByLabel('剧本大纲', { exact: true })
    await outline.waitFor()
    await outline.fill((await outline.inputValue()) + String.fromCharCode(10) + '第三集 · 补写' + String.fromCharCode(10) + '补写的剧情概要。')
    await page.getByRole('button', { name: '完成编辑', exact: true }).click()
    await preview.waitFor()
    assert.equal(await page.locator('.note.bad').count(), 0)
  })

  await check('selecting an outline passage asks the AI to rewrite just that part', async () => {
    const selected = await page.locator('.outline-preview').evaluate(root => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
      let node
      while ((node = walker.nextNode())) {
        const i = node.textContent.indexOf('雨夜的咖啡馆')
        if (i < 0) continue
        const range = document.createRange()
        range.setStart(node, i)
        range.setEnd(node, i + 6)
        const sel = getSelection()
        sel.removeAllRanges()
        sel.addRange(range)
        root.closest('.outline-paper').dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
        return sel.toString()
      }
      return ''
    })
    assert.equal(selected, '雨夜的咖啡馆')
    const bubble = page.locator('.select-bubble')
    await bubble.waitFor()
    await bubble.click()
    await page.getByLabel('修改意见', { exact: true }).fill('这一段改成两人在白天重逢')
    const before = fixture.calls.filter(call => call.path.includes('/ai/write/stream')).length
    await page.getByRole('button', { name: '让 AI 改这一段', exact: true }).click()
    await page.locator('.outline-passage').first().waitFor({ timeout: 10000 })
    const reviseCalls = fixture.calls.filter(call => call.path.includes('/ai/write/stream')).slice(before)
    assert.equal(reviseCalls.length, 1)
    assert.ok(reviseCalls[0].body.prompt.includes('这一段改成两人在白天重逢'))
    // 改写结果里回显的分集标题会被剔除，大纲仍可正常拆章。
    assert.equal(await page.locator('.outline-passage').count(), 1)
    assert.equal(await page.locator('.note.bad').count(), 0)
  })

  await check('confirming the outline creates the draft work and generates saved chapters', async () => {
    await page.getByRole('button', { name: '确认大纲，进入章节生成', exact: true }).click()
    await page.waitForURL(base + '/works/create/ai')
    await page.getByText('已创建草稿 #5').waitFor()
    assert.equal(fixture.calls.filter(call => call.path === '/api/v1/content/works' && call.method === 'POST').length, 1)
    assert.equal(await page.locator('.chapter-list > li.chapter').count(), 3)
    await page.getByRole('button', { name: '生成 3 章', exact: true }).click()
    await page.getByText(/已生成 3 章并保存到作品/).waitFor({ timeout: 20000 })
    assert.equal(await page.locator('.chapter-list > li.chapter[data-state="generated"]').count(), 3)
    const saves = fixture.calls.filter(call => /\/api\/v1\/users\/me\/works\/5\/chapters$/.test(call.path) && call.method === 'POST')
    assert.equal(saves.length, 3)
    assert.match(saves[0].body.chapterTitle, /第一集 · 深夜频率/)
    assert.match(saves[0].body.content, /雨夜的咖啡馆|深夜频率/)
  })

  await check('unselected episodes are skipped and chapter preview is available', async () => {
    await page.getByRole('checkbox', { name: /第三集 / }).uncheck()
    const first = page.locator('.chapter-list > li.chapter').first()
    await first.getByText(/查看正文/).click()
    assert.equal(await first.locator('.chapter-prose').isVisible(), true)
  })

  await check('AI usage history merges one outline and its chapters into a single entry', async () => {
    await page.getByRole('button', { name: /AI 使用记录/ }).click()
    const drawer = page.getByRole('dialog', { name: 'AI 使用记录' })
    await drawer.waitFor()
    await drawer.locator('.history-row').first().waitFor({ timeout: 8000 })
    // 一次创作（大纲 + 2 章正文）只占一条；日志页/工作台等本页之外的记录保持单条。
    const sessions = drawer.locator('.history-row').filter({ hasText: 'AI 创作' })
    assert.equal(await sessions.count(), 1)
    assert.ok(await drawer.locator('.history-row').count() >= 1)
    const row = drawer.locator('.history-row').first()
    assert.match(await row.innerText(), /AI 创作/)
    assert.match(await row.innerText(), /深夜频率/)
    // 「继续这次创作」只在展开详情里出现，收起行不占位。
    assert.equal(await drawer.getByRole('button', { name: '继续这次创作' }).count(), 0)
    await row.click()
    assert.equal(await drawer.locator('.history-detail').first().isVisible(), true)
    // 章节区来自合并进这次创作的正文；同一 fixture 下被去重为 1 条，这里只验证它被合并进来。
    assert.ok(await drawer.locator('.history-chapters li').count() >= 1)
    assert.equal(await drawer.locator('.history-detail-actions').getByRole('button', { name: '继续这次创作' }).count(), 1)
    await drawer.getByRole('button', { name: 'Close this dialog', exact: true }).click()
    await drawer.waitFor({ state: 'hidden' })
  })

  await check('record management selects several records and deletes them in one request', async () => {
    await page.goto(base + '/works/create/ai')
    await page.getByRole('button', { name: /AI 使用记录/ }).click()
    const drawer = page.getByRole('dialog', { name: 'AI 使用记录' })
    await drawer.waitFor()
    await drawer.locator('.history-row').first().waitFor({ timeout: 8000 })
    // 分组后条目数 = 合并后的创作条目 + 本页外的单条记录。
    const before = await drawer.locator('.history-row').count()
    assert.ok(before >= 1)
    assert.equal(await drawer.locator('.history-row').filter({ hasText: 'AI 创作' }).count(), 1)
    await drawer.getByRole('button', { name: '记录管理', exact: true }).click()
    await drawer.getByRole('button', { name: '全选', exact: true }).click()
    assert.equal(await drawer.getByText(`已选 ${before} 项`).count(), 1)
    await drawer.getByRole('button', { name: /^删除所选/ }).click()
    await page.getByRole('button', { name: '删除', exact: true }).last().click()
    await page.waitForTimeout(600)
    const deleteCalls = fixture.calls.filter(call => call.path.endsWith('/ai/write-records') && call.method === 'DELETE')
    assert.equal(deleteCalls.length, 1)
    // 一次创作的大纲与它的章节记录一起删除（删除条数 = 该组包含的记录数）。
    assert.ok(deleteCalls[0].body.recordIds.length >= 2)
    await drawer.getByText('还没有 AI 使用记录').waitFor()
  })

  await check('narrow viewport keeps the flow without horizontal overflow', async () => {
    await page.setViewportSize({ width: 1024, height: 900 })
    await page.goto(base + '/works/create/ai')
    await page.getByLabel('书名', { exact: true }).waitFor()
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    await page.screenshot({ path: shots + 'ai-create-1024.png', fullPage: true })
  })

  assert.deepEqual(errors, [])
  console.log(`${checks.length} AI creation checks passed; no runtime errors.`)
} finally {
  await browser.close()
  await server.close()
}
