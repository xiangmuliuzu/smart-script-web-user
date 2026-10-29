import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { mockCreatorApi } from './fixtures/creator-api.mjs'

const base = (process.env.PREVIEW_URL || 'http://127.0.0.1:3001/user').replace(/\/$/, '')
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext()
const { works } = await mockCreatorApi(context)
works[0].cover = 'http://old-host/profile/upload/cover.png'
works[1].cover = '/profile/upload/missing.png'
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+nmQAAAABJRU5ErkJggg==', 'base64')
await context.route('**/dev-api/profile/upload/**', route => route.request().url().endsWith('missing.png')
  ? route.fulfill({ status: 404 })
  : route.fulfill({ status: 200, contentType: 'image/png', body: png }))
await context.addInitScript(() => localStorage.setItem('PcUser-Token', 'browser-test-only'))
const page = await context.newPage()
try {
  await page.goto(base + '/works')
  const card = page.locator('.workitem').filter({ hasText: '归途列车' })
  const image = card.locator('.work-cover img')
  await image.waitFor()
  assert.equal(await image.getAttribute('src'), '/dev-api/profile/upload/cover.png')
  await page.waitForFunction(() => document.querySelector('.workitem img')?.naturalWidth > 0)
  const missing = page.locator('.workitem').filter({ hasText: '长夜将明' })
  await missing.locator('.glyph').waitFor()
  await card.click()
  const detailImage = page.locator('.wh-cover img')
  await detailImage.waitFor()
  assert.equal(await detailImage.getAttribute('src'), '/dev-api/profile/upload/cover.png')
  await page.waitForFunction(() => document.querySelector('.wh-cover img')?.naturalWidth > 0)
  await page.getByRole('button', { name: '作品设置', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '作品设置' })
  assert.equal(await dialog.locator('.cover-preview img').getAttribute('src'), '/dev-api/profile/upload/cover.png')
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  await page.getByRole('button', { name: '返回我的作品' }).click()
  await page.locator('.workitem').filter({ hasText: '长夜将明' }).click()
  await page.locator('.wh-cover .glyph').waitFor()
  console.log('PASS work covers load in list, detail and settings; broken covers fall back')
} finally { await browser.close() }
