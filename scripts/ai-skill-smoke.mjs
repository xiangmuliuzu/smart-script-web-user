// 阶段4：工作台「AI 创作抽屉」章节文本 / 章节分镜 + 导演(skill)选择回归。
// 旧编辑页已下线，AI 剧本/续写/润色入口随之移除，这里只验证仍然存在的生成流。
import assert from 'node:assert/strict'
import * as playwright from 'playwright'
import { createServer } from 'vite'
import { mockCreatorApi } from './fixtures/creator-api.mjs'

const server = await createServer({
  logLevel: 'error', server: { host: '127.0.0.1', port: 0, strictPort: false },
})
await server.listen()
const browser = await playwright.chromium.launch({ headless: true })
try {
  const context = await browser.newContext()
  const mock = await mockCreatorApi(context)
  await context.addInitScript(() => localStorage.setItem('PcUser-Token', 'test-only'))
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('http://127.0.0.1:' + server.httpServer.address().port + '/user/works/3/studio?view=chapter&chapter=1&tab=text')

  // 1) AI 抽屉：章节文本模式，生成正文草稿走 write 流并带上作品编号
  await page.getByRole('button', { name: /打开 AI 创作/ }).click()
  const drawer = page.getByLabel('AI 创作', { exact: true })
  await drawer.getByRole('heading', { name: 'AI 创作 · 章节文本', exact: true }).waitFor()
  await drawer.getByLabel('写作要求', { exact: true }).fill('雨夜便利店，悬疑故事')
  await drawer.getByRole('button', { name: /生成正文草稿/ }).click()
  await page.locator('.ai-result').filter({ hasText: '第一集 · 深夜频率' }).waitFor()
  const writeCall = mock.calls.filter(call => call.path.endsWith('/content/ai/write/stream'))
  assert.equal(writeCall.length, 1, 'write 流被调用一次')
  assert.equal(writeCall[0].body.workId, 3, '生成正文请求携带作品号')
  assert.match(writeCall[0].body.prompt, /雨夜便利店，悬疑故事/)
  assert.match(writeCall[0].body.prompt, /第三次告白/, '生成提示带入当前作品资料')

  // 2) 切到章节分镜 tab：抽屉切到分镜模式，生成请求携带 chapterTitle
  await page.getByRole('tab', { name: '章节分镜' }).click()
  await drawer.getByRole('heading', { name: 'AI 创作 · 章节分镜', exact: true }).waitFor()
  await drawer.getByRole('button', { name: /生成章节分镜/ }).click()
  await page.locator('.ai-result').filter({ hasText: '镜1｜景别' }).waitFor()
  const storyboardCall = mock.calls.filter(call => call.path.endsWith('/content/ai/storyboard/stream'))
  assert.equal(storyboardCall.length, 1, 'storyboard 流被调用一次')
  assert.equal(storyboardCall[0].body.chapterTitle, '雨夜的乘客')
  assert.equal(storyboardCall[0].body.workId, 3)
  assert.deepEqual(errors, [])
  console.log('PASS 工作台 AI 抽屉：章节正文 / 章节分镜生成流（PC 用户端）')
} finally {
  await browser.close()
  await server.close()
}
