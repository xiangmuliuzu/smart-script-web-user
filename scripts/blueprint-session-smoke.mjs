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
  const sessions = new Map([['71', { sessionId: 71, title: '跳过首章测试', status: 'draft', blueprint: structuredClone(blueprint) }], ['72', { sessionId: 72, title: '步骤直达工作台', status: 'draft', blueprint: structuredClone(blueprint) }]])
  const metadata = new Map()
  const calls = []
  const errors = []
  const draftFailures = new Set()
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
      const sessionMatch = String(body.title || '').match(/^会话(\d+)$/)
      const session = { sessionId: sessionMatch ? Number(sessionMatch[1]) : 70, title: body.title, status: 'draft', blueprint: structuredClone(blueprint) }
      sessions.set(String(session.sessionId), session)
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
      const workId = Number(body?.workId)
      const existing = fixture.chapters[workId]?.find(chapter => Number(chapter.chapterNo) === Number(body?.chapterNo))
      // 已有非空概要：直接复用，不重复生成也不重复扣费（起稿确认页不应再调用 AI）。
      if (draftFailures.has(workId)) {
        return route.fulfill({ status: 402, contentType: 'application/json', body: JSON.stringify({ code: 402, message: '积分不足，无法使用 AI 创作' }) })
      }
      if (existing?.summary) return sse(route, [frame({ done: true, draft: null })])
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
  // 顶栏只保留首页 / 工作台 / 任务广场，创作页期间「工作台」保持高亮。
  const nav = page.getByRole('navigation', { name: '主导航' })
  await nav.waitFor()
  assert.deepEqual((await nav.getByRole('button').allInnerTexts()).map(text => text.trim()), ['首页', '工作台', '任务广场'])
  assert.equal(await nav.getByRole('button', { name: '工作台' }).getAttribute('aria-current'), 'page')
  await page.getByLabel('书名').fill('服务器起稿测试')
  await page.getByLabel('故事灵感').fill('旧电台在深夜收到了一条来自未来的录音。')
  // 起稿设定只保留书名/灵感/题材/要求/模型；集数与时长由后端兜底，不再出现输入项。
  assert.equal(await page.getByLabel('计划集数').count(), 0)
  assert.equal(await page.getByLabel('单集时长').count(), 0)
  // 尚未生成会话时，步骤条也能在设定与资料确认之间往返，并保住已填写的表单。
  const steps = page.locator('.steps')
  await steps.getByRole('button', { name: '二 资料确认' }).click()
  await page.waitForURL('**/works/create/ai/blueprint')
  await page.locator('.blueprint-head').getByRole('button', { name: '作品设定', exact: true }).click()
  await page.waitForURL('**/works/create/ai')
  assert.equal(await page.getByLabel('书名').inputValue(), '服务器起稿测试')
  assert.equal(await page.getByLabel('故事灵感').inputValue(), '旧电台在深夜收到了一条来自未来的录音。')
  // 第三步：未创建作品时回工作台列表。
  await steps.getByRole('button', { name: '三 进入工作台' }).click()
  await page.waitForURL('**/works')
  await page.goto(`${origin}/works/create/ai`)
  assert.equal(await page.getByLabel('书名').inputValue(), '服务器起稿测试')
  await page.getByRole('button', { name: '生成作品资料 →' }).click()
  await page.waitForURL('**/works/create/ai/blueprint?sessionId=70')
  assert.equal(calls.find(call => call.path.endsWith('/blueprint/stream')).body.minutes, undefined)
  // 生成后带 sessionId 往返：设定 → 资料确认 → 设定内容都不丢。
  await page.locator('.blueprint-head').getByRole('button', { name: '作品设定', exact: true }).click()
  await page.waitForURL('**/works/create/ai?sessionId=70')
  assert.equal(await page.getByLabel('书名').inputValue(), '服务器起稿测试')
  assert.equal(await page.getByLabel('故事灵感').inputValue(), '旧电台在深夜收到了一条来自未来的录音。')
  await page.locator('.steps').getByRole('button', { name: '二 资料确认' }).click()
  await page.waitForURL('**/works/create/ai/blueprint?sessionId=70')
  await page.getByRole('heading', { name: '《服务器起稿测试》的作品资料' }).waitFor()
  await page.locator('.blueprint-head').getByRole('button', { name: '作品设定', exact: true }).click()
  await page.waitForURL('**/works/create/ai?sessionId=70')
  assert.equal(await page.getByLabel('书名').inputValue(), '服务器起稿测试')
  await page.locator('.steps').getByRole('button', { name: '二 资料确认' }).click()
  await page.waitForURL('**/works/create/ai/blueprint?sessionId=70')
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
  // 头像悬浮卡：只展示对应人物的资料，且不打开弹窗；点击卡片仍是原来的「全部人物」弹窗。
  const people = page.locator('[data-section="characters"] .people .person').first()
  await people.hover()
  const pop = people.locator('.person-pop')
  await pop.waitFor({ state: 'visible' })
  await pop.getByText('沈岚', { exact: true }).waitFor()
  await pop.getByText('资深调查记者', { exact: true }).waitFor()
  assert.equal(await page.getByRole('dialog').count(), 0)
  const popup = await people.evaluate(node => {
    const tip = node.querySelector('.person-pop').getBoundingClientRect()
    return {
      width: tip.width, height: tip.height,
      inViewport: tip.left >= 0 && tip.right <= window.innerWidth && tip.top >= 0,
      overflow: getComputedStyle(node.closest('.blue-card')).overflow
    }
  })
  assert.ok(popup.width > 200 && popup.height > 40, '浮层应有可读尺寸')
  assert.equal(popup.overflow, 'visible', '蓝卡不能裁切浮层')
  assert.equal(popup.inViewport, true, '浮层不应超出屏幕边缘')
  await page.mouse.move(0, 0)
  await pop.waitFor({ state: 'hidden' })
  await page.locator('[data-section="characters"]').click({ position: { x: 70, y: 85 } })
  await page.getByRole('dialog').waitFor()
  await page.getByRole('button', { name: '完成', exact: true }).click()
  await page.getByRole('button', { name: /确认资料，进入工作台/ }).first().click()
  await page.waitForURL('**/works/170/studio?*')
  await page.getByLabel('章节概要').waitFor()
  // 确认资料后先让 AI 生成第 1 章概要，再建章并保存本章资料。
  assert.equal(fixture.chapters[170].length, 1)
  assert.equal(fixture.chapters[170][0].content, '')
  assert.equal(fixture.chapters[170][0].summary, '沈岚找到磁带。')
  assert.equal(fixture.chapters[170][0].chapterTitle, '信号回响')
  assert.deepEqual(metadata.get('170')?.['1']?.cast?.map(entry => entry.name), ['沈岚'])
  assert.equal(metadata.get('170')?.['1']?.source, 'ai')
  assert.ok(calls.some(call => call.path === '/content/ai/chapter-draft/stream' && Number(call.body?.workId) === 170))
  // 首次进入本章概要页显示「AI 已生成本章起稿概要」，切换 Tab 再回来后不再显示。
  const aiSummaryHint = page.locator('.summary-box', { hasText: 'AI 已生成本章起稿概要' })
  await aiSummaryHint.waitFor({ state: 'visible' })
  await page.getByRole('tab', { name: '章节文本' }).click()
  await page.getByRole('tab', { name: '内容概要' }).click()
  await page.getByLabel('章节概要').waitFor()
  assert.equal(await aiSummaryHint.count(), 0)

  await page.locator('.sub-new').click()
  await page.waitForURL('**/works/170/studio?*chapter=2*')
  assert.equal(await page.getByLabel('章节概要').inputValue(), '沈岚找到磁带。')
  // 新建第 2 章首次进入时显示一次，切到人物信息再切回概要后不再显示。
  await aiSummaryHint.waitFor({ state: 'visible' })
  await page.getByRole('tab', { name: '人物信息' }).click()
  await page.getByText('本章变化：第一次找到物证').waitFor()
  await page.getByRole('tab', { name: '内容概要' }).click()
  await page.getByLabel('章节概要').waitFor()
  assert.equal(await aiSummaryHint.count(), 0)
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
  // 资料确认页点「工作台」步骤：草稿未确认时确认创建并直接进入工作台。
  await page.goto(`${origin}/works/create/ai/blueprint?sessionId=72`)
  await page.getByRole('heading', { name: '《步骤直达工作台》的作品资料' }).waitFor()
  await page.locator('.blueprint-head').getByRole('button', { name: '工作台', exact: true }).click()
  await page.waitForURL('**/works/172/studio?*')
  assert.equal(fixture.chapters[172].length, 1)
  assert.equal(fixture.chapters[172][0].summary, '沈岚找到磁带。')
  // 第 1 章已有非空概要：再次确认（复用同一会话）不重复生成、不重复扣费。
  const draftsBefore = calls.filter(call => call.path === '/content/ai/chapter-draft/stream').length
  await page.goto(`${origin}/works/create/ai/blueprint?sessionId=72`)
  await page.getByRole('heading', { name: '《步骤直达工作台》的作品资料' }).waitFor()
  await page.getByRole('button', { name: /确认资料，进入工作台/ }).first().click()
  await page.waitForURL('**/works/172/studio?*')
  assert.equal(fixture.chapters[172].length, 1)
  assert.equal(calls.filter(call => call.path === '/content/ai/chapter-draft/stream').length, draftsBefore)
  // AI 生成失败（积分不足）不阻断进入工作台：兜底建空壳第 1 章，且作品只创建一次。
  fixture.works.push({ workId: 173, title: '降级测试', duration: 90, status: 'draft' })
  fixture.chapters[173] = []
  fixture.storyboards[173] = []
  sessions.set('73', { sessionId: 73, workId: 173, title: '降级测试', status: 'confirmed', blueprint: structuredClone(blueprint) })
  draftFailures.add(173)
  await page.goto(`${origin}/works/create/ai/blueprint?sessionId=73`)
  await page.getByRole('heading', { name: '《降级测试》的作品资料' }).waitFor()
  await page.getByRole('button', { name: /确认资料，进入工作台/ }).first().click()
  await page.waitForURL('**/works/173/studio?*')
  assert.equal(fixture.works.filter(work => work.workId === 173).length, 1)
  assert.equal(fixture.chapters[173].length, 1)
  assert.equal(fixture.chapters[173][0].chapterTitle, '第 1 章')
  assert.equal(fixture.chapters[173][0].summary, '')
  // 起稿设定页不再有集数/时长输入项。
  await page.goto(`${origin}/works/create/ai`)
  await page.getByLabel('书名').waitFor()
  assert.equal(await page.getByLabel('计划集数').count(), 0)
  assert.equal(await page.getByLabel('单集时长').count(), 0)
  // 新作品排在「创作与上传」之后的第一位（updateTime 缺失时按创建时间/workId 倒序兜底）。
  await page.goto(`${origin}/works`)
  const firstWork = page.locator('.worklist .workitem:not(.new-work)').first()
  await firstWork.waitFor()
  assert.equal(await firstWork.locator('h3').innerText(), '降级测试')
  // 步骤条在 1440 / 1024 / 390 视口下排版收起，不产生横向溢出。
  for (const width of [1440, 1024, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto(`${origin}/works/create/ai`)
    await page.locator('.steps').waitFor()
    await page.goto(`${origin}/works/create/ai/blueprint?sessionId=71`)
    await page.locator('.blueprint-head').waitFor()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    assert.ok(overflow <= 0, `${width}px 视口出现 ${overflow}px 横向溢出`)
  }
  assert.deepEqual(errors, [])
  console.log('PASS 顶栏无「创作」、步骤条往返保留表单、资料确认步骤直达工作台、会话刷新、单项重生成、确认/跳过、工作台重生成、新章与章级资料回读')
} finally {
  await browser.close()
  await server.close()
}
