import assert from 'node:assert/strict'
import { mockCreatorApi } from './fixtures/creator-api.mjs'
import * as playwright from 'playwright'
import { fileURLToPath } from 'node:url'
import { mkdir, writeFile } from 'node:fs/promises'
// 优先使用项目安装的 Playwright，本工作区也可复用 shared/scripts 中已有版本。
const { chromium } = playwright
const base = (process.env.PREVIEW_URL || 'http://127.0.0.1:3001/user').replace(/\/$/, '')
const shots = fileURLToPath(new URL('../docs/screenshots/', import.meta.url))
await mkdir(shots, { recursive: true })
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
await mockCreatorApi(context)
await context.addInitScript(() => localStorage.setItem('PcUser-Token', 'browser-test-only'))
const page = await context.newPage()
const runtimeErrors = []
page.on('pageerror', error => runtimeErrors.push(error.message))
const checks = []
async function check(name, run) { await run(); checks.push(name); console.log('PASS ' + name) }
async function closeLayer() { await page.getByRole('button', { name: 'Close this dialog', exact: true }).last().click(); await page.waitForTimeout(300) }
async function screenshot(name) { await page.screenshot({ path: shots + name + '.png', fullPage: true }) }
async function noOverflow() { assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false) }
try {
  await page.goto(base + '/works')
  await page.getByRole('heading', { name: '我的作品', exact: true }).waitFor()
  await check('authenticated workspace uses API data', async () => { assert.equal(await page.locator('.workitem').count(), 5); assert.equal(await page.evaluate(() => localStorage.getItem('PcUser-Token')), 'browser-test-only'); await noOverflow(); await screenshot('prototype-workspace-desktop') })
  await check('search and status filters', async () => { await page.getByRole('button', { name: '筛选 / 搜索' }).click(); await page.getByRole('searchbox', { name: '搜索作品' }).fill('归途'); assert.equal(await page.locator('.workitem').count(), 2); await page.getByRole('button', { name: '重置', exact: true }).click(); await page.getByRole('combobox', { name: '作品状态' }).selectOption('reviewing'); assert.equal(await page.locator('.workitem').count(), 2); await page.getByRole('button', { name: '重置', exact: true }).click() })
  await check('review lock and selected work detail', async () => { await page.locator('.workitem').filter({ hasText: '长夜将明' }).click(); await page.getByRole('heading', { name: '长夜将明', exact: true }).waitFor(); assert.equal(await page.getByRole('button', { name: '＋ 写新章节' }).isDisabled(), true); assert.equal(await page.getByRole('button', { name: '作品设置', exact: true }).isDisabled(), true); await page.getByRole('button', { name: '返回我的作品' }).click(); await page.locator('.workitem').filter({ hasText: '归途列车' }).click(); await page.getByRole('heading', { name: '归途列车', exact: true }).waitFor(); await screenshot('prototype-detail-desktop') })
  await check('chapter edit opens the creation page with the selected work and chapter', async () => { await page.locator('tr').filter({ hasText: '十二号车厢' }).getByRole('button', { name: '修改', exact: true }).click(); await page.getByLabel('分集标题', { exact: true }).waitFor(); assert.equal(new URL(page.url()).searchParams.get('workId'), '1'); assert.equal(new URL(page.url()).searchParams.get('chapterId'), '12'); assert.equal(await page.getByRole('dialog', { name: '编辑章节', exact: true }).count(), 0); await page.getByLabel('分集标题', { exact: true }).fill('十二号车厢 · 修订'); await page.getByRole('button', { name: '保存草稿', exact: true }).click(); await page.locator('tr').filter({ hasText: '十二号车厢 · 修订' }).waitFor() })
  await check('chapter create, file import and delete', async () => { await page.getByRole('button', { name: '＋ 写新章节' }).click(); await page.getByLabel('分集标题', { exact: true }).waitFor(); assert.equal(new URL(page.url()).searchParams.get('chapterId'), 'new'); assert.equal(await page.getByRole('dialog', { name: '新建章节', exact: true }).count(), 0); await page.locator('.creation-file-input').setInputFiles({ name: '第五幕.txt', mimeType: 'text/plain', buffer: Buffer.from('夜班车缓缓驶入站台。') }); await page.getByLabel('分集标题', { exact: true }).fill('浏览器验证章节'); await page.getByRole('button', { name: '保存草稿', exact: true }).click(); await page.locator('tr').filter({ hasText: '浏览器验证章节' }).waitFor(); await page.locator('tr').filter({ hasText: '浏览器验证章节' }).getByRole('button', { name: '删除', exact: true }).click(); await page.getByRole('button', { name: '删除', exact: true }).last().click(); await page.waitForTimeout(250); assert.equal(await page.locator('tr').filter({ hasText: '浏览器验证章节' }).count(), 0) })
  await check('work settings save', async () => { await page.getByRole('button', { name: '作品设置', exact: true }).click(); const drawer = page.getByRole('dialog', { name: '作品设置', exact: true }); await drawer.getByLabel('简介', { exact: true }).fill('修订后的作品简介'); await drawer.getByRole('button', { name: '保存设置', exact: true }).click(); await page.getByText('修订后的作品简介', { exact: true }).waitFor() })
  await check('messages mark all read and platform chat', async () => { await page.getByRole('button', { name: '消息', exact: true }).click(); await page.getByRole('button', { name: '全部已读', exact: true }).click(); await page.waitForTimeout(150); assert.equal(await page.locator('.msg[data-unread=true]').count(), 0); await page.getByRole('tab', { name: '与平台沟通' }).click(); await page.getByRole('textbox', { name: '输入消息', exact: true }).fill('已完成章节调整，请帮我确认。'); await page.getByRole('button', { name: '发送', exact: true }).click(); await page.locator('.bubble').filter({ hasText: '已完成章节调整，请帮我确认。' }).waitFor(); await screenshot('prototype-messages-desktop'); await closeLayer() })
  await check('cooperation and contracts keep real unavailable states', async () => { await page.getByRole('button', { name: '我的合作', exact: true }).click(); await page.getByText(/合作服务暂未开放/).waitFor(); for (const name of ['报价', '订单', '询盘']) await page.getByRole('tab', { name, exact: true }).click(); await page.getByRole('button', { name: '我的合同', exact: true }).click(); await page.getByText(/合同服务暂未开放/).waitFor(); await closeLayer(); await closeLayer() })
  await check('rights settle and withdraw reuse finance APIs', async () => {
    await page.getByRole('button', { name: '版权与收益', exact: true }).click()
    await page.getByRole('tab', { name: '结算', exact: true }).click()
    await page.getByText('总收益', { exact: true }).waitFor()
    await page.getByRole('tab', { name: '待结算', exact: true }).click()
    await page.getByText('归途列车', { exact: true }).waitFor()
    await page.getByRole('tab', { name: '收益明细', exact: true }).click()
    await page.getByText('订单收入', { exact: true }).waitFor()
    await page.getByRole('tab', { name: '提现', exact: true }).click()
    await page.getByText('可提现余额', { exact: true }).waitFor()
    assert.equal(await page.getByRole('button', { name: '申请提现', exact: true }).count(), 1)
    assert.equal(await page.getByText(/版权与收益服务暂未开放/).count(), 0)
    await closeLayer()
  })
  await check('account profile and feedback', async () => { await page.getByRole('button', { name: '账号菜单', exact: true }).click(); await page.getByRole('menuitem', { name: '个人资料', exact: true }).click(); const account = page.getByRole('dialog', { name: '账号', exact: true }); await account.getByLabel('个人简介', { exact: true }).fill('这是浏览器验证后的简介'); await account.getByRole('button', { name: '保存修改', exact: true }).click(); await page.getByRole('tab', { name: '意见反馈', exact: true }).click(); await account.getByLabel('描述你遇到的问题或建议', { exact: true }).fill('窄屏显示检查反馈'); await account.getByRole('button', { name: '提交反馈', exact: true }).click(); await account.getByText('窄屏显示检查反馈', { exact: true }).waitFor(); await screenshot('prototype-account-desktop'); await closeLayer() })
  await page.getByRole('button', { name: '返回我的作品' }).click()
  await check('TXT draft upload and work creation', async () => { await page.locator('.new-work').click(); await page.getByRole('heading', { name: '创作上传', exact: true }).waitFor(); await page.locator('.creation-file-input').setInputFiles({ name: '浏览器新作品.txt', mimeType: 'text/plain', buffer: Buffer.from('第一幕\n雨一直在下。') }); await page.getByLabel('分类', { exact: true }).selectOption('2'); await page.getByRole('button', { name: '保存草稿', exact: true }).click(); await page.getByRole('heading', { name: '浏览器新作品', exact: true }).waitFor(); assert.equal(await page.locator('tbody tr').count(), 1) })
  await page.getByRole('button', { name: '返回我的作品' }).click(); await page.locator('.new-work').click()
  await check('AI generation, insert and record tabs', async () => {
    await page.getByLabel('分集正文', { exact: true }).fill('原有正文不能丢失。');
    await page.getByLabel('你的要求', { exact: true }).fill('电台主播与听众的双线叙事，前三集埋一个反转。');
    await page.getByRole('button', { name: '生成大纲', exact: true }).click(); await page.locator('.ai-result').waitFor();
    await page.getByRole('button', { name: '插入正文', exact: true }).click(); assert.match(await page.getByLabel('分集正文', { exact: true }).innerText(), /原有正文不能丢失。/);
    assert.match(await page.getByLabel('分集正文', { exact: true }).innerText(), /第一集 · 深夜频率/);
    await page.getByRole('tab', { name: '生成记录', exact: true }).click(); await page.locator('.ai-records').getByText('AI 大纲', { exact: true }).first().waitFor();
    await page.getByRole('tab', { name: 'AI 大纲', exact: true }).click(); await screenshot('prototype-create-desktop');
  })
  await check('DOCX native body import', async () => {
    // 真实 ZIP 结构，压缩方法 8；验证原生解压而非只验证 .docx 后缀。
    const { deflateRawSync } = await import('node:zlib')
    const name = Buffer.from('word/document.xml')
    const xml = Buffer.from('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>DOCX 验证正文</w:t></w:r></w:p></w:body></w:document>')
    const zipped = deflateRawSync(xml)
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50); local.writeUInt16LE(8, 8); local.writeUInt32LE(zipped.length, 18); local.writeUInt32LE(xml.length, 22); local.writeUInt16LE(name.length, 26)
    const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50); central.writeUInt16LE(8, 10); central.writeUInt32LE(zipped.length, 20); central.writeUInt32LE(xml.length, 24); central.writeUInt16LE(name.length, 28)
    const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10); end.writeUInt32LE(central.length + name.length, 12); end.writeUInt32LE(local.length + name.length + zipped.length, 16)
    const zip = Buffer.concat([local, name, zipped, central, name, end])
    await page.locator('.creation-file-input').setInputFiles({ name: '实际文档.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: zip })
    await page.getByRole('button', { name: '替换正文', exact: true }).click();
    await page.getByText('实际文档.docx', { exact: true }).waitFor(); await page.getByText(/已读取 8 字/).waitFor()
  })
  await check('mobile layouts and no horizontal page overflow', async () => { await page.goto(base + '/works'); await page.setViewportSize({ width: 390, height: 844 }); await page.getByRole('heading', { name: '我的作品', exact: true }).waitFor(); await noOverflow(); await screenshot('prototype-workspace-mobile'); await page.locator('.workitem').filter({ hasText: '归途列车' }).click(); await page.getByRole('heading', { name: '归途列车', exact: true }).waitFor(); await noOverflow(); await screenshot('prototype-detail-mobile'); await page.getByRole('button', { name: '版权与收益', exact: true }).click(); await page.getByRole('tab', { name: '电子证书', exact: true }).click(); await noOverflow(); await screenshot('prototype-rights-mobile'); await closeLayer() })
  const realContext = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const realPage = await realContext.newPage()
  realPage.on('pageerror', error => runtimeErrors.push(error.message))
  const realUser = { userId: 7, userType: '02', nickname: '真实接口测试用户', authorCapability: true }
  let workFailure = false
  let authFailure = false
  await realPage.route('**/dev-api/**', async route => {
    const path = new URL(route.request().url()).pathname.replace('/dev-api', '')
    let payload = { code: 200, data: null }
    if (path.endsWith('/captchaImage')) payload = { code: 200, captchaEnabled: false }
    else if (path.endsWith('/auth/login')) payload = { code: 200, token: 'browser-test-only', user: realUser }
    else if (path.endsWith('/auth/getInfo')) payload = authFailure ? { code: 401, msg: '会话已过期' } : { code: 200, user: realUser, roles: ['buyer'], permissions: [] }
    else if (path.endsWith('/users/me/works')) payload = workFailure ? { code: 503, message: '作品服务暂不可用' } : { code: 200, data: [{ workId: 17, title: '接口作品', status: 'draft', genreName: '都市情感', summary: '接口返回的真实字段', wordCount: 1200 }] }
    else if (path.endsWith('/messages/unread-count')) payload.data = { total: 1 };
    else if (path.endsWith('/messages')) payload.data = { list: [{ messageId: 4, title: '接口通知', read: false, summary: '请查看审核结果', createdAt: '2026-10-14 09:00' }] }
    else if (path.endsWith('/real-name')) payload.data = { status: 'NOT_SUBMITTED' }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(payload) })
  })
  await check('login has no demo entry and former demo paths cannot bypass authentication', async () => { for (const path of ['/login', '/preview', '/preview/create', '/preview/1']) { await realPage.goto(base + path); await realPage.getByRole('heading', { name: '登录创作者中心', exact: true }).waitFor(); assert.equal(await realPage.getByRole('link', { name: /查看.*预览/ }).count(), 0); assert.equal(await realPage.locator('.creation-workspace,.worklist').count(), 0); assert.equal(new URL(realPage.url()).pathname, new URL(base).pathname + '/login') } })
  await check('buyer without creator capability cannot log in', async () => { realUser.authorCapability = false; await realPage.goto(base + '/login'); await realPage.getByLabel('用户名 / 手机号 / 邮箱', { exact: true }).fill('buyer-test'); await realPage.getByLabel('密码', { exact: true }).fill('test-only-password'); await realPage.getByRole('button', { name: '登录', exact: true }).click(); await realPage.getByText('账号未开通创作者能力，暂时无法登录创作者端', { exact: true }).waitFor(); assert.equal(await realPage.evaluate(() => localStorage.getItem('PcUser-Token')), null); assert.equal(new URL(realPage.url()).pathname, new URL(base).pathname + '/login'); realUser.authorCapability = true })
  await check('normal login enters API workspace and restores on refresh', async () => { await realPage.goto(base + '/login'); await realPage.getByLabel('用户名 / 手机号 / 邮箱', { exact: true }).fill('test-only'); await realPage.getByLabel('密码', { exact: true }).fill('test-only-password'); await realPage.getByRole('button', { name: '登录', exact: true }).click(); await realPage.getByRole('heading', { name: '我的作品', exact: true }).waitFor(); await realPage.getByRole('heading', { name: '接口作品', exact: true }).waitFor(); await realPage.reload(); await realPage.getByRole('heading', { name: '接口作品', exact: true }).waitFor() })
  await check('business 503 retains token and retry recovers', async () => { workFailure = true; await realPage.reload(); await realPage.getByText('作品服务暂不可用', { exact: true }).first().waitFor(); assert.equal(await realPage.evaluate(() => localStorage.getItem('PcUser-Token')), 'browser-test-only'); workFailure = false; await realPage.getByRole('button', { name: '重新加载', exact: true }).click(); await realPage.getByRole('heading', { name: '接口作品', exact: true }).waitFor() })
  await check('revoked creator capability blocks session restoration and clears token', async () => { realUser.authorCapability = false; await realPage.reload(); await realPage.getByRole('heading', { name: '登录创作者中心', exact: true }).waitFor(); await realPage.getByText('账号未开通创作者能力，暂时无法登录创作者端。', { exact: true }).waitFor(); assert.equal(await realPage.evaluate(() => localStorage.getItem('PcUser-Token')), null); realUser.authorCapability = true; await realPage.getByLabel('用户名 / 手机号 / 邮箱', { exact: true }).fill('test-only'); await realPage.getByLabel('密码', { exact: true }).fill('test-only-password'); await realPage.getByRole('button', { name: '登录', exact: true }).click(); await realPage.getByRole('heading', { name: '接口作品', exact: true }).waitFor() })
  await check('user-facing unsupported services do not call admin APIs', async () => { const adminRequests = []; realPage.on('request', req => { if (req.url().includes('/api/v1/admin/')) adminRequests.push(req.url()) }); await realPage.getByRole('button', { name: '我的合作', exact: true }).click(); await realPage.getByText(/合作服务暂未开放/).waitFor(); await realPage.getByRole('button', { name: 'Close this dialog', exact: true }).click(); assert.deepEqual(adminRequests, []) })
  await check('expired identity returns to login and clears only user token', async () => { await realPage.evaluate(() => localStorage.setItem('PcEnterprise-Token', 'other-portal')); authFailure = true; await realPage.reload(); await realPage.getByRole('heading', { name: '登录创作者中心', exact: true }).waitFor(); assert.equal(await realPage.evaluate(() => localStorage.getItem('PcUser-Token')), null); assert.equal(await realPage.evaluate(() => localStorage.getItem('PcEnterprise-Token')), 'other-portal'); await realPage.screenshot({ path: shots + 'prototype-login-desktop.png', fullPage: true }); await realPage.setViewportSize({ width: 390, height: 844 }); await realPage.screenshot({ path: shots + 'prototype-login-mobile.png', fullPage: true }) })
  assert.deepEqual(runtimeErrors, [])
  await writeFile(new URL('../docs/screenshots/browser-smoke-results.json', import.meta.url), JSON.stringify({ checks, runtimeErrors }, null, 2) + '\n')
  console.log(`${checks.length} browser checks passed; no runtime errors.`)
} finally { await browser.close() }
