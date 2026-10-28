import assert from 'node:assert/strict'
import * as playwright from 'playwright'
const browser = await playwright.chromium.launch({ headless: true })
const base = (process.env.PREVIEW_URL || 'http://127.0.0.1:3001/user').replace(/\/$/, '')
const page = await browser.newPage()
const imageBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6dFoAAAAASUVORK5CYII=', 'base64')
const originalPath = '/profile/upload/avatar-original.png'
const updatedPath = '/profile/upload/avatar-updated.png'
const profile = { nickname: '头像测试', avatar: originalPath, bio: '', phoneMasked: '' }
const errors = []
page.on('pageerror', error => errors.push(error.message))
await page.addInitScript(() => localStorage.setItem('PcUser-Token', 'avatar-test-only'))
await page.route('**/dev-api/**', async route => {
  const path = new URL(route.request().url()).pathname.slice('/dev-api'.length)
  if (path.startsWith('/profile/upload/')) {
    const missing = path.includes('missing')
    await route.fulfill({ status: missing ? 404 : 200, contentType: missing ? 'text/plain' : 'image/png', body: missing ? 'Image not found' : imageBytes })
    return
  }
  let data = null
  let result
  if (path === '/api/v1/auth/getInfo') result = { code: 200, user: { userId: 7, userType: '01', authorCapability: true, ...profile }, roles: [], permissions: [] }
  else if (path === '/api/v1/users/me/profile') {
    if (route.request().method() === 'PUT') {
      const body = route.request().postDataJSON()
      profile.nickname = body.nickname; profile.bio = body.bio
      profile.avatar = new URL(body.avatar, 'http://backend.invalid').pathname
    }
    data = { ...profile }
  } else if (path === '/api/v1/users/me/avatar') data = { url: 'http://localhost:8080' + updatedPath, path: updatedPath }
  else if (path === '/api/v1/users/me/real-name') data = { status: 'NOT_SUBMITTED' }
  else if (path === '/api/v1/messages/unread-count') data = { total: 0 }
  else if (path === '/api/v1/users/me/works') data = []
  await route.fulfill({ contentType: 'application/json', body: JSON.stringify(result || { code: 200, data }) })
})
async function imageLoaded(selector) {
  await page.waitForFunction(selector => {
    const image = document.querySelector(selector)
    return image?.complete && image.naturalWidth > 0
  }, selector, { timeout: 5000 })
}
try {
  await page.goto(base + '/works')
  await page.getByRole('heading', { name: '我的作品', exact: true }).waitFor()
  assert.equal(await page.locator('.avatar-btn img').count(), 1, 'Topbar must render the account avatar, not only an initial')
  await imageLoaded('.avatar-btn img')
  assert.ok((await page.locator('.avatar-btn img').getAttribute('src')).endsWith('/dev-api' + originalPath))
  await page.getByRole('button', { name: '账号菜单', exact: true }).click()
  await page.getByRole('menuitem', { name: '个人资料', exact: true }).click()
  const account = page.getByRole('dialog', { name: '账号', exact: true })
  await imageLoaded('.profile-avatar img')
  await account.locator('.profile-avatar-row input[type=file]').setInputFiles({ name: 'avatar.png', mimeType: 'image/png', buffer: imageBytes })
  await page.waitForFunction(path => document.querySelector('.profile-avatar img')?.src.endsWith(path), updatedPath)
  await account.getByRole('button', { name: '保存修改', exact: true }).click()
  await page.waitForFunction(path => document.querySelector('.avatar-btn img')?.src.endsWith(path), updatedPath)
  await imageLoaded('.avatar-btn img')
  await page.reload()
  await imageLoaded('.avatar-btn img')
  assert.ok((await page.locator('.avatar-btn img').getAttribute('src')).endsWith('/dev-api' + updatedPath))
  profile.avatar = '/profile/upload/missing.png'
  await page.reload()
  await page.getByRole('heading', { name: '我的作品', exact: true }).waitFor()
  await page.waitForFunction(() => document.querySelector('.avatar-btn .avatar')?.textContent === '头')
  assert.equal(await page.locator('.avatar-btn img').count(), 0)
  assert.deepEqual(errors, [])
  console.log('PASS avatar: API path, topbar/profile loading, save synchronization, refresh persistence and broken-image fallback')
} finally { await browser.close() }
