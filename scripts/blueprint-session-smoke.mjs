import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { createServer } from 'vite'
import { mockCreatorApi } from './fixtures/creator-api.mjs'

const server = await createServer({ logLevel: 'error', server: { host: '127.0.0.1', port: 0 } })
await server.listen()
const browser = await chromium.launch({ headless: true })
const origin = `http://127.0.0.1:${server.httpServer.address().port}/user`
const blueprint = {
  storyCore: { summary: '深夜电台收到异常信号。' }, world: { setting: '旧城区' },
  outline: { acts: [{ name: '第一幕', summary: '发现异响', beats: ['守候凌晨的信号'] }] },
  characters: [{ key: 'c-one', name: '沈岚', role: '电台主播' }], items: [{ key: 'i-one', name: '磁带' }],
  planEpisodes: 12, minutesPerEpisode: 1.5
}
try {
  const context = await browser.newContext()
  const fixture = await mockCreatorApi(context)
  const sessions = new Map([['71', { sessionId: 71, title: '跳过首章测试', status: 'draft', blueprint: structuredClone(blueprint) }]])
  const metadata = new Map()
  const calls = []
  const errors = []
  const api = (route, data) => route.fulfill({ json: { code: 200, data } })
  const sse = (route, frames) => route.fulfill({ contentType: 'text/event-stream', body: frames.join('') })
  const frame = (value, type = 'message') => `event:${type}\ndata:${JSON.stringify(value)}\n\n`
  await context.route('**/dev-api/api/v1/**', async route => {
    const request = route.request()
    const path = new URL(request.url()).pathname.replace('/dev-api/api/v1', '')
    const method = request.method()
    const body = request.postData() ? request.postDataJSON() : null
    calls.push({ path, method, body })
    if (path === '/content/ai/blueprint/stream') {
      const session = { sessionId: 70, title: body.title, status: 'draft', blueprint: structuredClone(blueprint) }
      sessions.set('70', session)
      return sse(route, [frame({ stage: 'story' }, 'stage'), frame({ stage: 'outline' }, 'stage'), frame({ done: true, ...session })])
    }
    if (path === '/content/ai/blueprint/regenerate') {
      const session = sessions.get(String(body.sessionId))
      if (body.section === 'characters') session.blueprint.characters[0].role = '资深调查记者'
      if (body.section === 'outline') session.blueprint.outline.acts[0].beats = ['刷新后仍可读取的新节拍']
      return sse(route, [frame({ done: true, ...session })])
    }
    const sessionMatch = path.match(/^\/content\/ai\/blueprint\/(\d+)(\/confirm)?$/)
    if (sessionMatch) {
      const session = sessions.get(sessionMatch[1])
      if (sessionMatch[2]) {
        const workId = session.workId ?? session.sessionId + 100
        if (!session.workId) {
          fixture.works.push({ workId, title: session.title, duration: 90, status: 'draft' })
          fixture.chapters[workId] = []
          fixture.storyboards[workId] = []
          Object.assign(session, { workId, status: 'confirmed' })
          session.blueprint.status = 'confirmed'
        }
        return api(route, { workId })
      }
      return api(route, session)
    }
    const workBlueprint = path.match(/^\/content\/works\/(\d+)\/blueprint$/)
    if (workBlueprint) return api(route, [...sessions.values()].find(session => session.workId === Number(workBlueprint[1])) || null)
    if (path === '/content/ai/chapter-draft/stream') {
      return sse(route, [frame({ done: true, draft: { title: '信号回响', summary: '沈岚找到磁带。',
        cast: [{ key: 'c-one', name: '沈岚', role: '调查者', change: '第一次找到物证' }],
        items: [{ key: 'i-one', name: '磁带', change: '转交给沈岚' }], edges: [] } })])
    }
    const metaPath = path.match(/^\/content\/works\/(\d+)\/chapter-meta(?:\/(\d+))?$/)
    if (metaPath) {
      const entries = metadata.get(metaPath[1]) || {}
      if (method === 'PUT') {
        entries[metaPath[2]] = body
        metadata.set(metaPath[1], entries)
        return api(route, body)
      }
      return api(route, entries)
    }
    if (path === '/content/ai/chapter-meta') {
      const result = { source: 'ai', cast: [{ key: 'c-other', name: '档案员', role: '证人' }], items: [], edges: [] }
      metadata.get(String(body.workId))[body.chapterNo] = result
      return api(route, result)
    }
    if (path === '/content/ai/models') return api(route, [])
    return route.fallback()
  })
  await context.addInitScript(() => localStorage.setItem('PcUser-Token', 'test-only'))
  const page = await context.newPage()
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`${origin}/works/create/ai`)
  await page.getByLabel('书名').fill('服务器起稿测试')
  await page.getByLabel('故事灵感').fill('旧电台在深夜收到了一条来自未来的录音。')
  await page.getByLabel('单集时长').selectOption('1.5')
  await page.getByRole('button', { name: '生成作品资料 →' }).click()
  await page.waitForURL('**/works/create/ai/blueprint?sessionId=70')
  assert.equal(calls.find(call => call.path.endsWith('/blueprint/stream')).body.minutes, 1.5)
  await page.evaluate(() => sessionStorage.clear())
  await page.reload()
  await page.getByRole('heading', { name: '《服务器起稿测试》的作品资料' }).waitFor()
  await page.locator('[data-section="characters"]').click({ position: { x: 70, y: 85 } })
  await page.getByRole('button', { name: '单独整理' }).click()
  await page.getByPlaceholder('告诉 AI 需要怎么调整，例如：冲突再提前一点…').fill('增加调查经历')
  await page.getByRole('dialog').getByRole('button', { name: '让 AI 重新整理' }).click()
  await page.getByRole('dialog').getByText('资深调查记者', { exact: true }).waitFor()
  assert.equal(calls.find(call => call.path.endsWith('/blueprint/regenerate')).body.key, 'c-one')
  await page.getByRole('button', { name: '完成', exact: true }).click()
  await page.getByRole('button', { name: /确认资料，进入工作台/ }).first().click()
  await page.waitForURL('**/works/170/studio?*')
  await page.getByLabel('章节概要').waitFor()
  assert.equal(fixture.chapters[170].length, 1)
  assert.equal(fixture.chapters[170][0].content, '')

  await page.locator('.sub-new').click()
  await page.waitForURL('**/works/170/studio?*chapter=2*')
  assert.equal(await page.getByLabel('章节概要').inputValue(), '沈岚找到磁带。')
  await page.getByRole('tab', { name: '人物信息' }).click()
  await page.getByText('本章变化：第一次找到物证').waitFor()
  await page.reload()
  await page.getByRole('heading', { name: '沈岚', exact: true }).waitFor()
  await page.getByRole('button', { name: 'AI 整理本章资料' }).click()
  await page.getByRole('heading', { name: '档案员', exact: true }).waitFor()
  await page.reload()
  await page.getByRole('heading', { name: '档案员', exact: true }).waitFor()
  await page.goto(`${origin}/works/170/studio?view=outline`)
  await page.getByText('守候凌晨的信号', { exact: true }).waitFor()
  await page.getByRole('button', { name: '让 AI 重新整理', exact: true }).click()
  await page.getByText('刷新后仍可读取的新节拍', { exact: true }).waitFor()
  await page.reload()
  await page.getByText('刷新后仍可读取的新节拍', { exact: true }).waitFor()

  await page.goto(`${origin}/works/create/ai/blueprint?sessionId=71`)
  await page.getByRole('button', { name: '跳过查看，直接进入工作台' }).click()
  await page.waitForURL('**/works/171/studio?*')
  assert.equal(fixture.chapters[171].length, 0)
  assert.deepEqual(errors, [])
  console.log('PASS 起稿会话刷新、单项重生成、确认/跳过、工作台重生成、新章与章级资料回读')
} finally {
  await browser.close()
  await server.close()
}
