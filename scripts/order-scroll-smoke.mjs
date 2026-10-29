import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { mockCreatorApi } from './fixtures/creator-api.mjs'

const browser = await chromium.launch({ headless: true })
try {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport })
    await mockCreatorApi(context)
    await context.route('**/dev-api/api/v1/trade/order/list**', route => {
      const status = new URL(route.request().url()).searchParams.get('status')
      const rows = status === 'confirmed' ? Array.from({ length: 10 }, (_, i) => ({
        orderId: i + 1, orderNo: `TEST-${i + 1}`, workTitle: `作品${i + 1}`, status, amount: 10000
      })) : []
      return route.fulfill({ json: { code: 200, data: { total: rows.length, rows } } })
    })
    await context.addInitScript(() => localStorage.setItem('PcUser-Token', 'browser-test-only'))
    const page = await context.newPage()
    await page.goto('http://127.0.0.1:3001/user/works')
    const list = page.getByRole('region', { name: '订单待办列表' })
    await list.waitFor()
    assert.equal(await list.locator('.order-todo').count(), 10)
    const dimensions = await list.evaluate(el => ({ height: el.clientHeight, total: el.scrollHeight }))
    assert.ok(dimensions.total > dimensions.height && dimensions.height <= 320)
    await list.scrollIntoViewIfNeeded()
    await list.hover()
    await page.mouse.wheel(0, 500)
    await page.waitForTimeout(100)
    assert.ok(await list.evaluate(el => el.scrollTop) > 0)
    await page.getByText('最近动态', { exact: true }).scrollIntoViewIfNeeded()
    assert.ok(await page.getByText('最近动态', { exact: true }).isVisible())
    await context.close()
  }
  console.log('订单待办滚动检查通过')
} finally {
  await browser.close()
}
