import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve, sep, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mockCreatorApi } from './fixtures/creator-api.mjs'

let playwright
try { playwright = createRequire(import.meta.url)('playwright') }
catch { playwright = createRequire(new URL('../../shared/scripts/package.json', import.meta.url))('playwright') }
const apps = [
  { prefix: '/user/', root: fileURLToPath(new URL('../dist/', import.meta.url)) },
  { prefix: '/enterprise/', root: fileURLToPath(new URL('../../smart-script-web-enterprise/dist/', import.meta.url)) },
  { prefix: '/', root: fileURLToPath(new URL('../../smart-script-web-admin/dist/', import.meta.url)) }
]
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' }
// 同一个站点挂载三份真实生产包，并模拟各应用自己的 SPA 回退。
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
    const app = apps.find(item => pathname.startsWith(item.prefix))
    const root = resolve(app.root)
    const path = resolve(root, pathname.slice(app.prefix.length) || 'index.html')
    if (path !== root && !path.startsWith(root + sep)) { response.writeHead(403); response.end(); return }
    let body
    let extension = extname(path)
    try { body = await readFile(path) }
    catch {
      if (extension) { response.writeHead(404); response.end(); return }
      body = await readFile(resolve(root, 'index.html')); extension = '.html'
    }
    response.writeHead(200, { 'Content-Type': types[extension] || 'application/octet-stream' }); response.end(body)
  } catch { response.writeHead(500); response.end() }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const origin = `http://127.0.0.1:${server.address().port}`
const browser = await playwright.chromium.launch({ headless: true })
const errors = [], requests = [], checks = []
async function check(name, run) { await run(); checks.push(name); console.log('PASS ' + name) }
try {
  const context = await browser.newContext()
  await mockCreatorApi(context, '/prod-api')
  await context.route('https://images.unsplash.com/**', route => route.abort())
  const page = await context.newPage()
  page.on('pageerror', error => errors.push(error.message))
  page.on('request', request => { if (request.url().startsWith(origin)) requests.push(new URL(request.url()).pathname) })
  await check('three production HTML entries reference only assets in their own mount', async () => {
    for (const app of apps) {
      const response = await fetch(origin + app.prefix)
      assert.equal(response.status, 200)
      const html = await response.text()
      for (const [, asset] of html.matchAll(/(?:src|href)="([^\"]+\.(?:js|css))"/g)) {
        assert.ok(asset.startsWith(app.prefix + 'assets/'), asset)
        const resource = await fetch(origin + asset)
        assert.equal(resource.status, 200)
        assert.ok(!resource.headers.get('content-type').startsWith('text/html'), asset)
      }
    }
  })
  await check('user login, protected redirect and refresh stay under /user/', async () => {
    await page.goto(origin + '/user/works/create')
    await page.getByRole('heading', { name: '登录创作者中心', exact: true }).waitFor()
    assert.equal(new URL(page.url()).pathname, '/user/login')
    await page.getByLabel('用户名 / 手机号', { exact: true }).fill('test-only')
    await page.getByLabel('密码', { exact: true }).fill('test-only-password')
    await page.getByRole('button', { name: '登录', exact: true }).click()
    await page.getByLabel('分集正文', { exact: true }).waitFor()
    assert.equal(new URL(page.url()).pathname, '/user/works/create')
    await page.reload(); await page.getByLabel('分集正文', { exact: true }).waitFor()
    assert.equal(new URL(page.url()).pathname, '/user/works/create')
  })
  await check('enterprise login and refresh stay under /enterprise/ with separate tokens', async () => {
    await page.goto(origin + '/enterprise/')
    await page.getByRole('heading', { name: '欢迎回来', exact: true }).waitFor()
    assert.equal(new URL(page.url()).pathname, '/enterprise/login')
    await page.getByLabel('用户名 / 手机号', { exact: true }).fill('test-only')
    await page.getByLabel('密码', { exact: true }).fill('test-only-password')
    await page.getByRole('button', { name: '登录', exact: true }).click()
    await page.getByRole('heading', { name: '登录成功', exact: true }).waitFor()
    assert.equal(new URL(page.url()).pathname, '/enterprise/session')
    await page.reload(); await page.getByRole('heading', { name: '登录成功', exact: true }).waitFor()
    await page.getByRole('button', { name: '退出登录', exact: true }).click()
    await page.getByRole('heading', { name: '欢迎回来', exact: true }).waitFor()
    assert.equal(new URL(page.url()).pathname, '/enterprise/login')
    assert.equal(await page.evaluate(() => localStorage.getItem('PcEnterprise-Token')), null)
    assert.equal(await page.evaluate(() => localStorage.getItem('PcUser-Token')), 'browser-test-only')
  })
  await check('admin keeps its root login and user authentication does not authorize it', async () => {
    await page.goto(origin + '/')
    await page.getByRole('heading', { name: '欢迎回来', exact: true }).waitFor()
    assert.equal(new URL(page.url()).pathname, '/login')
    await page.reload(); await page.getByRole('heading', { name: '欢迎回来', exact: true }).waitFor()
  })
  await check('expired user identity returns to /user/login and API paths remain site-wide', async () => {
    await page.route('**/prod-api/api/v1/auth/getInfo', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ code: 401, msg: '会话过期' }) }))
    await page.goto(origin + '/user/works')
    await page.getByRole('heading', { name: '登录创作者中心', exact: true }).waitFor()
    assert.equal(new URL(page.url()).pathname, '/user/login')
    assert.ok(requests.includes('/prod-api/api/v1/auth/login'))
    assert.ok(!requests.some(path => path.includes('/user/prod-api/') || path.includes('/enterprise/prod-api/')))
  })
  assert.deepEqual(errors, [])
  await writeFile(new URL('../docs/screenshots/server-paths-results.json', import.meta.url), JSON.stringify({ checks, errors }, null, 2) + '\n')
  console.log(`${checks.length} server path checks passed.`)
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)) }
