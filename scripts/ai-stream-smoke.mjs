// 工作台 AI 创作为流式输出：分块展示、生成中禁用写入、连接中断保留已收到内容。
import assert from 'node:assert/strict'
import * as playwright from 'playwright'
import { createServer } from 'vite'
import { mockCreatorApi } from './fixtures/creator-api.mjs'

let response
const event = data => 'data:' + JSON.stringify(data) + '\n\n'
const server = await createServer({
  logLevel: 'error', server: { host: '127.0.0.1', port: 0, strictPort: false },
  plugins: [{ name: 'test-delayed-ai-stream', configureServer(vite) {
    vite.middlewares.use((req, res, next) => {
      if (!/^\/dev-api\/api\/v1\/content\/ai\/write\/stream$/.test(req.url)) return next()
      req.resume()
      req.on('end', () => {
        response = res
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' })
        res.write(event({ delta: '雨夜的便利店' }))
      })
    })
  } }],
})
await server.listen()
const browser = await playwright.chromium.launch({ headless: true })
try {
  const context = await browser.newContext()
  await mockCreatorApi(context)
  await context.route('**/content/ai/write/stream', route => route.continue())
  await context.addInitScript(() => localStorage.setItem('PcUser-Token', 'test-only'))
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('http://127.0.0.1:' + server.httpServer.address().port + '/user/works/3/studio?view=chapter&chapter=1&tab=text')
  await page.getByRole('button', { name: /打开 AI 创作/ }).click()
  const drawer = page.getByLabel('AI 创作', { exact: true })
  await drawer.getByLabel('写作要求', { exact: true }).fill('雨夜便利店')
  await drawer.getByRole('button', { name: /生成正文草稿/ }).click()
  await drawer.getByText('雨夜的便利店', { exact: false }).waitFor()
  assert.equal(response.writableEnded, false, '响应未结束时仍应流式展示')
  assert.equal(await drawer.getByRole('button', { name: /插入到正文/ }).isDisabled(), true, '生成中不能提前写入')
  response.write(event({ delta: '，她推门而入。' }))
  await drawer.getByText('她推门而入', { exact: false }).waitFor()
  response.end(event({ done: true, quotaUsed: 1, recordId: 7 }))
  await drawer.getByRole('button', { name: /插入到正文/ }).waitFor()
  assert.equal(await drawer.getByRole('button', { name: /插入到正文/ }).isEnabled(), true)
  console.log('PASS 章节正文生成按分块展示，完成前不可插入')

  // 中断：保留已收到内容并提示，不吞掉正文
  await drawer.getByRole('button', { name: '丢弃', exact: true }).click()
  await drawer.getByRole('button', { name: /生成正文草稿/ }).click()
  await drawer.getByText('雨夜的便利店', { exact: false }).waitFor()
  response.end()
  await drawer.getByRole('alert').filter({ hasText: '生成中断' }).waitFor()
  assert.match(await drawer.locator('.ai-result .preview').innerText(), /雨夜的便利店/)
  assert.equal(await drawer.getByRole('button', { name: '重新生成', exact: true }).isEnabled(), true)
  console.log('PASS 生成中断保留已收到内容并结束加载')
  assert.deepEqual(errors, [])
} finally {
  response?.end()
  await browser.close()
  await server.close()
}
