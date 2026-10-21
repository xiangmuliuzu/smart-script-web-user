import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mockCreatorApi } from './fixtures/creator-api.mjs'

let playwright
try { playwright = createRequire(import.meta.url)('playwright') }
catch { playwright = createRequire(new URL('../../shared/scripts/package.json', import.meta.url))('playwright') }
const base = (process.env.PREVIEW_URL || 'http://127.0.0.1:3101/user').replace(/\/$/, '')
const browser = await playwright.chromium.launch({ headless: true })
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const state = await mockCreatorApi(context, process.env.API_PREFIX || '/prod-api')
  await context.addInitScript(() => localStorage.setItem('PcUser-Token', 'browser-test-only'))
  const deletionRequests = []
  let sendFails = true
  let blocked = false
  await context.route('**/api/v1/content/works/**', async route => {
    const request = route.request()
    const match = new URL(request.url()).pathname.match(/\/content\/works\/(\d+)(\/delete-code)?$/)
    if (!match || !['POST', 'DELETE'].includes(request.method())) return route.fallback()
    let result
    if (match[2]) {
      assert.equal(request.method(), 'POST')
      assert.equal(request.postData(), null)
      result = sendFails ? { code: 42901, message: '请稍后重新获取验证码' }
        : { code: 200, data: { sent: true, phoneMasked: '139****0001', cooldownSeconds: 60 } }
    } else {
      const body = request.postDataJSON()
      deletionRequests.push(body)
      if (body.code !== '123456') result = { code: 40001, message: 'sms code invalid' }
      else if (blocked) result = { code: 409, message: '作品存在订单，请使用下架功能' }
      else {
        state.works.splice(state.works.findIndex(work => work.workId === Number(match[1])), 1)
        result = { code: 200, data: { message: '删除成功' } }
      }
    }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(result) })
  })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(base + '/works/3')
  await page.getByRole('button', { name: '删除作品', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '删除作品', exact: true })
  await dialog.getByText('确定删除《第三次告白》吗？').waitFor()
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  await dialog.waitFor({ state: 'hidden' })
  assert.equal(deletionRequests.length, 0)
  await page.getByRole('button', { name: '删除作品', exact: true }).click()
  await dialog.getByRole('button', { name: '验证并删除', exact: true }).click()
  assert.equal(deletionRequests.length, 0)
  await dialog.getByRole('button', { name: '获取验证码', exact: true }).click()
  await dialog.getByRole('alert').filter({ hasText: '请稍后重新获取验证码' }).waitFor()
  sendFails = false
  await dialog.getByRole('button', { name: '获取验证码', exact: true }).click()
  await dialog.getByText('验证码已发送至 139****0001').waitFor()
  assert.equal(await dialog.getByRole('button', { name: /秒后重发/ }).isDisabled(), true)
  await dialog.getByLabel('短信验证码').fill('000000')
  await dialog.getByRole('button', { name: '验证并删除', exact: true }).click()
  await dialog.getByRole('alert').filter({ hasText: '验证码错误' }).waitFor()
  blocked = true
  await dialog.getByLabel('短信验证码').fill('123456')
  await dialog.getByRole('button', { name: '验证并删除', exact: true }).click()
  await dialog.getByRole('alert').filter({ hasText: '作品存在订单' }).waitFor()
  blocked = false
  await dialog.getByRole('button', { name: '验证并删除', exact: true }).click()
  await page.waitForURL(base + '/works')
  assert.equal(state.works.some(work => work.workId === 3), false)
  assert.deepEqual(deletionRequests, [{ code: '000000' }, { code: '123456' }, { code: '123456' }])
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(base + '/works/2')
  await page.getByRole('button', { name: '删除作品', exact: true }).click()
  await dialog.getByLabel('短信验证码').waitFor()
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  assert.deepEqual(errors, [])
  console.log('PASS work deletion: cancel, empty code, send retry, cooldown, invalid code, transaction guard, success, mobile layout')
} finally {
  await browser.close()
}
