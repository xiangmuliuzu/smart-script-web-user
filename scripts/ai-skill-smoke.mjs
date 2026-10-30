// 阶段4：PC 用户端「AI 剧本 / AI 分镜 + 导演(skill)选择」浏览器冒烟
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
  await page.goto('http://127.0.0.1:' + server.httpServer.address().port + '/user/works/create')

  // 1) 「AI 大纲」已改名「AI 剧本」，且各创作 tab 带「导演(skill)」下拉
  await page.getByRole('tab', { name: 'AI 剧本', exact: true }).click()
  await page.getByLabel('导演(skill)', { exact: true }).waitFor()
  const skillOptions = await page.getByLabel('导演(skill)', { exact: true }).locator('option').allTextContents()
  assert.deepEqual(skillOptions, ['默认导演', '悬疑烧脑导演', '甜宠爆款导演'])
  assert.equal(mock.calls.some(call => call.path.endsWith('/ai/skills')), true, 'skills 接口已被调用')

  // 2) AI 剧本 + 导演选择：生成请求携带 skill_id
  await page.getByLabel('导演(skill)', { exact: true }).selectOption('1')
  await page.getByLabel('你的要求', { exact: true }).fill('雨夜便利店，悬疑故事')
  await page.getByRole('button', { name: '生成剧本大纲', exact: true }).click()
  await page.locator('.ai-result').filter({ hasText: '第一集 · 深夜频率' }).waitFor()
  const outlineCall = mock.calls.filter(call => call.path.endsWith('/content/ai/outline/stream'))
  assert.equal(outlineCall.length, 1, 'outline 流被调用一次')
  assert.equal(outlineCall[0].body.skillId, 1, '剧本生成请求携带导演 skill_id')

  // 3) AI 分镜 tab：剧本文本 + 分镜风格 + 导演下拉 + 一键带入
  await page.getByRole('tab', { name: 'AI 分镜', exact: true }).click()
  await page.getByLabel('剧本文本', { exact: true }).waitFor()
  await page.getByLabel('分镜风格', { exact: true }).waitFor()
  assert.equal(await page.getByLabel('导演(skill)', { exact: true }).inputValue(), '1', '导演选择延续到分镜 tab')
  await page.getByRole('button', { name: /一键带入/ }).click()
  assert.match(await page.getByLabel('剧本文本', { exact: true }).inputValue(), /第一集 · 深夜频率/)

  // 4) 生成分镜：流式输出 + skill_id 携带
  await page.getByRole('button', { name: '生成分镜', exact: true }).click()
  await page.locator('.ai-result').filter({ hasText: '镜1｜景别' }).waitFor()
  const storyboardCall = mock.calls.filter(call => call.path.endsWith('/content/ai/storyboard/stream'))
  assert.equal(storyboardCall.length, 1, 'storyboard 流被调用一次')
  assert.equal(storyboardCall[0].body.skillId, 1, '分镜生成请求携带导演 skill_id')
  assert.equal(storyboardCall[0].body.style, '电影感', '分镜风格默认电影感')
  assert.match((await page.getByLabel('剧本文本', { exact: true }).inputValue()), /深夜频率/)
  assert.deepEqual(errors, [])
  console.log('PASS AI 剧本改名 + 导演(skill)选择 + AI 分镜一条龙（PC 用户端）')
} finally {
  await browser.close()
  await server.close()
}
