import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { mockCreatorApi } from './fixtures/creator-api.mjs'

const base = (process.env.PREVIEW_URL || 'http://127.0.0.1:3001/user').replace(/\/$/, '')
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
await mockCreatorApi(context)
await context.route('**/dev-api/api/v1/trade/**', route => {
  const path = new URL(route.request().url()).pathname
  let data = { total: 0, rows: [] }
  if (path.endsWith('/inquiry/list')) data = { total: 1, rows: [{ inquiryId: 12, workId: 3, workTitle: '测试作品', status: 'quoted', sellerId: 7 }] }
  if (path.endsWith('/inquiry/chat/sessions')) data = { sessionId: 33 }
  return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ code: 200, data }) })
})
await context.route('**/dev-api/api/v1/users/me/chat/sessions?sessionType=TRADE', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ code: 200, data: [] }) }))
await context.addInitScript(() => localStorage.setItem('PcUser-Token', 'browser-test-only'))
const page = await context.newPage()
const errors = []
page.on('pageerror', error => errors.push(error.message))
try {
  await page.goto(base + '/works')
  for (const [name, content] of [['询盘', '测试作品'], ['会话', '暂无交易会话'], ['订单', '暂无订单'], ['合同', '暂无合同']]) {
    await page.getByRole('button', { name, exact: true }).click()
    const drawer = page.getByRole('dialog', { name, exact: true })
    await drawer.getByText(content, { exact: false }).first().waitFor()
    assert.equal(await drawer.getByRole('tab').count(), 0)
    await drawer.getByRole('button', { name: 'Close this dialog' }).click()
    await drawer.waitFor({ state: 'hidden' })
  }
  await page.getByRole('button', { name: '询盘', exact: true }).click()
  const inquiry = page.getByRole('dialog', { name: '询盘', exact: true })
  await inquiry.getByRole('button', { name: '创建交易会话' }).click()
  const session = page.getByRole('dialog', { name: '会话', exact: true })
  await session.getByText('暂无交易会话').waitFor()
  await session.getByRole('button', { name: 'Close this dialog' }).click()
  await session.waitFor({ state: 'hidden' })
  await page.getByRole('button', { name: '询盘', exact: true }).click()
  await page.getByRole('dialog', { name: '询盘', exact: true }).getByText('测试作品').waitFor()
  assert.deepEqual(errors, [])
  console.log('PASS four independent entries and inquiry-to-session navigation')
} finally { await browser.close() }
