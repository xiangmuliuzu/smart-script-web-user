import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { createServer } from 'vite'
import { mockCreatorApi } from './fixtures/creator-api.mjs'

let playwright
try { playwright = createRequire(import.meta.url)('playwright') }
catch { playwright = createRequire(new URL('../../shared/scripts/package.json', import.meta.url))('playwright') }
let response
const event = data => 'data:' + JSON.stringify(data) + '\n\n'
const server = await createServer({
  logLevel: 'error', server: { host: '127.0.0.1', port: 0, strictPort: false },
  plugins: [{ name: 'test-delayed-ai-stream', configureServer(vite) {
    vite.middlewares.use((req, res, next) => {
      if (!/^\/dev-api\/api\/v1\/content\/ai\/(outline|write|polish)\/stream$/.test(req.url)) return next()
      req.resume()
      req.on('end', () => {
        response = res
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' })
        res.write(event({ delta: '书名：雨夜\n第一段故事' }))
      })
    })
  } }],
})
await server.listen()
const browser = await playwright.chromium.launch({ headless: true })
try {
  const context = await browser.newContext()
  await mockCreatorApi(context)
  await context.route('**/content/ai/*/stream', route => route.continue())
  await context.addInitScript(() => localStorage.setItem('PcUser-Token', 'test-only'))
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('http://127.0.0.1:' + server.httpServer.address().port + '/user/works/create')
  for (const [tab, field, button] of [
    ['AI 大纲', '你的要求', '生成大纲'],
    ['AI 续写', '场景要求', '生成正文'],
    ['AI 润色', '要润色的原文', '开始润色'],
  ]) {
    await page.getByRole('tab', { name: tab, exact: true }).click()
    await page.getByLabel(field, { exact: true }).fill('合成测试内容')
    await page.getByRole('button', { name: button, exact: true }).click()
    await page.locator('.ai-result').filter({ hasText: '第一段故事' }).waitFor()
    assert.equal(response.writableEnded, false)
    assert.equal(await page.getByRole('button', { name: '正在生成…', exact: true }).isDisabled(), true)
    assert.equal(await page.getByRole('button', { name: '插入正文', exact: true }).isDisabled(), true)
    response.write(event({ delta: '\n第二段故事' }))
    await page.locator('.ai-result').filter({ hasText: '第二段故事' }).waitFor()
    response.end(event({ done: true, quotaUsed: 1, recordId: 7 }))
    await page.getByRole('button', { name: button, exact: true }).waitFor()
    assert.equal(await page.getByRole('button', { name: '插入正文', exact: true }).isEnabled(), true)
    console.log('PASS ' + tab + ' displays chunks before generation completes')
  }
  await page.getByRole('button', { name: '开始润色', exact: true }).click()
  await page.locator('.ai-result').filter({ hasText: '第一段故事' }).waitFor()
  response.end()
  await page.locator('.compose-form [role="alert"]').filter({ hasText: '生成中断' }).waitFor()
  assert.match(await page.locator('.ai-result').innerText(), /第一段故事/)
  assert.equal(await page.getByRole('button', { name: '开始润色', exact: true }).isEnabled(), true)
  console.log('PASS interrupted generation keeps partial text and stops loading')
  assert.deepEqual(errors, [])
} finally {
  response?.end()
  await browser.close()
  await server.close()
}
