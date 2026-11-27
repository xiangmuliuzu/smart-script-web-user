// 旧编辑页下线后的入口回归：作品详情、创作与上传、/works/create 兼容重定向都只通向 v3 工作台。
import assert from 'node:assert/strict'
import * as playwright from 'playwright'
import { createServer } from 'vite'
import { mockCreatorApi } from './fixtures/creator-api.mjs'

const server = await createServer({ logLevel: 'error', server: { host: '127.0.0.1', port: 0 } })
await server.listen()
const base = `http://127.0.0.1:${server.httpServer.address().port}/user`
const browser = await playwright.chromium.launch({ headless: true })
const checks = []
const errors = []
async function check(name, run) {
  await run()
  checks.push(name)
  console.log('PASS ' + name)
}
function studioUrl(workId, query) {
  return base + `/works/${workId}/studio?` + new URLSearchParams(query).toString()
}
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const state = await mockCreatorApi(context)
  await context.addInitScript(() => localStorage.setItem('PcUser-Token', 'browser-test-only'))
  const page = await context.newPage()
  page.on('pageerror', error => errors.push(error.message))

  await check('作品卡片进入作品详情页，详情页不再出现旧编辑页入口', async () => {
    await page.goto(base + '/works')
    const card = page.locator('.worklist .workitem:not(.new-work)').first()
    await card.waitFor()
    await card.click()
    await page.waitForURL(base + '/works/4')
    await page.getByRole('heading', { name: '山河故人', exact: true }).waitFor()
    assert.equal(await page.locator('.creation-workspace').count(), 0)
  })

  await check('进入创作工作台：审核中作品也能打开大纲视图', async () => {
    // work 2 审核中，编辑按钮禁用，但「进入创作工作台」仍可查看资料与大纲。
    await page.goto(base + '/works/2')
    const entry = page.getByRole('button', { name: '进入创作工作台', exact: true })
    await entry.waitFor()
    assert.equal(await entry.isEnabled(), true)
    await entry.click()
    await page.waitForURL(studioUrl(2, { view: 'outline' }))
    await page.getByRole('heading', { name: '《长夜将明》', exact: true }).waitFor()
  })

  await check('章节目录「编辑」跳到工作台对应章节的正文页', async () => {
    await page.goto(base + '/works/3')
    const row = page.locator('tbody tr').first()
    await row.getByRole('button', { name: '编辑', exact: true }).click()
    await page.waitForURL(studioUrl(3, { view: 'chapter', chapter: '1', tab: 'text' }))
    await page.getByRole('tab', { name: '章节文本' }).waitFor()
  })

  await check('「＋ 写新章节」先建空白章再进入工作台，且不调用 AI', async () => {
    await page.goto(base + '/works/3')
    const before = state.chapters[3].length
    const aiCalls = state.calls.filter(call => call.path.includes('/content/ai/')).length
    await page.getByRole('button', { name: '＋ 写新章节', exact: true }).click()
    await page.waitForURL(studioUrl(3, { view: 'chapter', chapter: '4', tab: 'text' }))
    assert.equal(state.chapters[3].length, before + 1)
    assert.equal(state.chapters[3].at(-1).chapterNo, 4)
    assert.equal(state.chapters[3].at(-1).chapterTitle, '第 4 章')
    assert.equal(state.chapters[3].at(-1).content, '')
    assert.equal(state.calls.filter(call => call.path.includes('/content/ai/')).length, aiCalls, '新建空章不应触发 AI 生成')
  })

  await check('「＋ 写新分镜」跳到最后一章的分镜页', async () => {
    await page.goto(base + '/works/3')
    await page.getByRole('button', { name: '＋ 写新分镜', exact: true }).click()
    await page.waitForURL(studioUrl(3, { view: 'chapter', chapter: '4', tab: 'storyboard' }))
    await page.getByRole('tab', { name: '节分镜' }).waitFor()
  })

  await check('尚无章节时「＋ 写新分镜」先建第 1 章再跳分镜页', async () => {
    state.chapters[1] = []
    await page.goto(base + '/works/1')
    await page.getByRole('button', { name: '＋ 写新分镜', exact: true }).click()
    await page.waitForURL(studioUrl(1, { view: 'chapter', chapter: '1', tab: 'storyboard' }))
    assert.equal(state.chapters[1].length, 1)
    assert.equal(state.chapters[1][0].chapterTitle, '第 1 章')
  })

  await check('「自己编辑」在弹窗内创建空白作品并进入第 1 章正文', async () => {
    await page.goto(base + '/works')
    await page.locator('.new-work').click()
    await page.getByRole('dialog').getByRole('button', { name: /自己编辑/ }).click()
    await page.getByRole('dialog').getByLabel('书名', { exact: true }).fill('空白开篇')
    await page.getByRole('dialog').getByLabel('简介', { exact: true }).fill('从一段空白开始。')
    await page.getByRole('dialog').getByRole('button', { name: '创建并开始写作', exact: true }).click()
    await page.waitForURL(/\/works\/\d+\/studio\?view=chapter&chapter=1&tab=text$/)
    const workId = Number(new URL(page.url()).pathname.match(/\/works\/(\d+)\/studio/)[1])
    const work = state.works.find(item => item.workId === workId)
    assert.equal(work.title, '空白开篇')
    assert.equal(work.summary, '从一段空白开始。')
    assert.equal(state.chapters[workId].length, 1)
    assert.equal(state.chapters[workId][0].chapterNo, 1)
    assert.equal(state.chapters[workId][0].chapterTitle, '第 1 章')
    assert.equal(state.chapters[workId][0].content, '')
  })

  await check('「导入剧本」上传原文件并把正文写入第 1 章', async () => {
    await page.goto(base + '/works')
    await page.locator('.new-work').click()
    await page.getByRole('dialog').getByRole('button', { name: /导入剧本/ }).click()
    await page.getByRole('dialog').locator('.start-upload input[type="file"]').setInputFiles({ name: '雨夜来信.txt', mimeType: 'text/plain', buffer: Buffer.from('雨夜，她拆开了那封信。\n\n信里只有一句话。') })
    await page.getByRole('dialog').getByText(/已读取 \d+ 字/).waitFor()
    assert.equal(await page.getByRole('dialog').getByLabel('书名', { exact: true }).inputValue(), '雨夜来信')
    await page.getByRole('dialog').getByRole('button', { name: '导入并开始写作', exact: true }).click()
    await page.waitForURL(/\/works\/\d+\/studio\?view=chapter&chapter=1&tab=text$/)
    const workId = Number(new URL(page.url()).pathname.match(/\/works\/(\d+)\/studio/)[1])
    assert.ok(state.calls.some(call => call.path === '/api/v1/content/upload'), '应先上传原文件')
    const created = state.calls.find(call => call.path === '/api/v1/content/works' && call.method === 'POST' && call.body?.title === '雨夜来信')
    assert.equal(created.body.scriptName, '雨夜来信.txt')
    assert.equal(created.body.scriptUrl, '/profile/upload/test-script.txt')
    assert.match(state.chapters[workId][0].content, /雨夜，她拆开了那封信。/)
  })

  await check('弹窗可返回选择，重新打开时步骤与表单已重置', async () => {
    await page.goto(base + '/works')
    await page.locator('.new-work').click()
    await page.getByRole('dialog').getByRole('button', { name: /自己编辑/ }).click()
    await page.getByRole('dialog').getByLabel('书名', { exact: true }).fill('会被丢弃的书名')
    await page.getByRole('dialog').getByRole('button', { name: '← 返回选择' }).click()
    await page.getByRole('dialog').getByRole('button', { name: /AI 起稿/ }).waitFor()
    await page.getByRole('dialog').getByRole('button', { name: '关闭此对话框', exact: true }).click()
    await page.locator('.new-work').click()
    await page.getByRole('dialog').getByRole('button', { name: /自己编辑/ }).click()
    assert.equal(await page.getByRole('dialog').getByLabel('书名', { exact: true }).inputValue(), '')
    await page.getByRole('dialog').getByRole('button', { name: '关闭此对话框', exact: true }).click()
  })

  await check('/works/create 重定向到我的作品，工作台数据仍然可用', async () => {
    await page.goto(base + '/works/create')
    await page.waitForURL(base + '/works')
    await page.locator('.worklist .workitem:not(.new-work)').first().waitFor()
    assert.equal(await page.locator('.creation-workspace').count(), 0)
  })

  await check('带 workId 的旧链接落到工作台大纲或分镜视图', async () => {
    await page.goto(base + '/works/create?workId=3')
    await page.waitForURL(studioUrl(3, { view: 'outline' }))
    await page.getByRole('heading', { name: '《第三次告白》', exact: true }).waitFor()
    await page.goto(base + '/works/create?workId=3&mode=storyboard')
    await page.waitForURL(studioUrl(3, { view: 'chapter', tab: 'storyboard' }))
    await page.getByRole('tab', { name: '章节分镜' }).waitFor()
    assert.equal(new URL(page.url()).searchParams.get('chapter'), null)
  })

  await check('/works/create?entry=import 打开导入表单并清理 URL', async () => {
    await page.goto(base + '/works/create?entry=import')
    await page.waitForURL(base + '/works')
    await page.getByRole('dialog').getByRole('button', { name: '← 返回选择' }).waitFor()
    assert.equal(await page.locator('.start-upload input[type="file"]').count(), 1)
    await page.getByRole('dialog').getByRole('button', { name: '关闭此对话框', exact: true }).click()
  })

  await check('工作台切换作品后重新加载新作品的章节', async () => {
    await page.goto(studioUrl(1, { view: 'chapter', chapter: '1', tab: 'text' }))
    await page.getByRole('heading', { name: '《归途列车》', exact: true }).waitFor()
    await page.getByLabel('切换作品').selectOption('3')
    await page.waitForURL(studioUrl(3, { view: 'outline' }))
    await page.getByRole('heading', { name: '《第三次告白》', exact: true }).waitFor()
    assert.equal(await page.getByText('《归途列车》', { exact: true }).count(), 0)
  })

  assert.deepEqual(errors, [])
  console.log(`${checks.length} editor entry checks passed; no runtime errors.`)
} finally {
  await browser.close()
  await server.close()
}
