import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { mockCreatorApi } from './fixtures/creator-api.mjs'

const browser = await chromium.launch({ headless: true })
try {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport })
    await mockCreatorApi(context)
    const records = {
      '/api/v1/content/copyright/application/list': { applyId: 11, workId: 1, workName: '归途列车', applyNo: 'AP11', status: 'rejected', workCoverUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ/8AAAAASUVORK5CYII=' },
      '/api/v1/content/copyright/assets': { workId: 1, title: '归途列车', status: 'on_shelf' },
      '/api/v1/content/copyright/cert/list': { certId: 21, workId: 1, workName: '归途列车', certNo: 'CERT21', status: 'issued' },
      '/api/v1/trade/delivery/list': { deliveryId: 31, workId: 1, workTitle: '归途列车', deliveryNo: 'D31', sellerId: 7, status: 'pending_upload' }
    }
    await context.route('**/dev-api/api/v1/**', async (route, request) => {
      const path = new URL(request.url()).pathname.replace('/dev-api', '')
      const item = records[path]
      if (item) return route.fulfill({ json: { code: 200, data: { total: 1, list: [item] } } })
      const detail = {
        '/api/v1/content/copyright/application/11': records['/api/v1/content/copyright/application/list'],
        '/api/v1/content/copyright/assets/1': records['/api/v1/content/copyright/assets'],
        '/api/v1/content/copyright/cert/21': records['/api/v1/content/copyright/cert/list'],
        '/api/v1/trade/delivery/31': records['/api/v1/trade/delivery/list']
      }[path]
      if (detail) return route.fulfill({ json: { code: 200, data: detail } })
      return route.fallback()
    })
    await context.addInitScript(() => localStorage.setItem('PcUser-Token', 'browser-test-only'))
    const page = await context.newPage()
    await page.goto('http://127.0.0.1:3001/user/works')
    await page.getByRole('button', { name: '我的作品', exact: true }).waitFor()
    await page.getByRole('button', { name: '版权与收益', exact: true }).click()
    assert.equal(await page.getByRole('button', { name: '版权与收益', exact: true }).getAttribute('aria-pressed'), 'true')
    assert.equal(await page.locator('.workitem').count(), 0)
    assert.equal(await page.getByRole('tab', { name: '版权申请', exact: true }).count(), 1)
    assert.equal(await page.getByRole('dialog', { name: '版权与收益' }).count(), 0)
    assert.equal(await page.getByRole('complementary', { name: '工作台' }).count(), 1)
    await page.getByRole('button', { name: '发起申请', exact: true }).click()
    const application = page.getByRole('dialog', { name: '发起版权申请', exact: true })
    await application.waitFor()
    const bodyBox = await application.locator('.el-dialog__body').boundingBox()
    const formBox = await application.locator('.apply-form').boundingBox()
    const dialogBox = await application.locator('.el-dialog').boundingBox()
    assert.ok(dialogBox.width <= 702 && dialogBox.width <= viewport.width * 0.95 + 2, JSON.stringify({ dialogBox, viewport }))
    assert.ok(bodyBox.width - formBox.width <= 60, JSON.stringify({ bodyBox, formBox }))
    assert.ok(Math.abs((formBox.x - bodyBox.x) - (bodyBox.x + bodyBox.width - formBox.x - formBox.width)) < 2)
    await application.getByRole('button', { name: 'Close this dialog' }).click()
    for (const [tab, action, open, detail] of [['版权申请', '重新提交', '查看申请', '申请详情'], ['版权资产', '授权历史', '详情', '版权资产详情'], ['电子证书', '下载证书', '查看证书', '电子证书详情'], ['版权交割', '去交割', '去交割', '交割详情']]) {
      await page.getByRole('tab', { name: tab, exact: true }).click()
      const card = page.locator('.copyright-card')
      await card.waitFor()
      assert.equal(await card.getByRole('heading', { name: '归途列车', exact: true }).count(), 1)
      const cover = await card.locator('.cover').boundingBox(), cardBox = await card.boundingBox()
      assert.ok(Math.abs(cover.y - cardBox.y - 1) < 2 && Math.abs(cover.height - cardBox.height + 2) < 2)
      assert.ok(Math.abs(cover.width / cover.height - 210 / 297) < 0.02)
      if (tab === '版权申请') {
        assert.equal(await card.locator('.cover img').evaluate(el => getComputedStyle(el).objectFit), 'cover')
        assert.equal(await card.locator('p').filter({ hasText: '申请编号' }).count(), 1)
        assert.equal(await card.locator('p').filter({ hasText: '提交时间' }).count(), 1)
      }
      const trigger = card.getByRole('button', { name: '归途列车的操作' })
      await trigger.click()
      const menu = page.locator('.copyright-actions-popover:visible')
      await menu.waitFor()
      assert.equal(await menu.getByRole('button', { name: action, exact: true }).count(), 1)
      assert.equal(await menu.getByRole('button', { name: open, exact: true }).evaluate(el => getComputedStyle(el).borderTopWidth), '0px')
      const triggerBox = await trigger.boundingBox(), menuBox = await menu.boundingBox()
      assert.ok(Math.abs(menuBox.y - (triggerBox.y + triggerBox.height)) < 30 || Math.abs(menuBox.y + menuBox.height - triggerBox.y) < 30)
      assert.ok(menuBox.x < triggerBox.x + triggerBox.width && menuBox.x + menuBox.width > triggerBox.x)
      await menu.getByRole('button', { name: open, exact: true }).click()
      const details = page.getByRole('dialog', { name: detail, exact: true })
      await details.waitFor()
      await details.getByRole('heading', { name: '归途列车', exact: true }).waitFor()
      await details.getByRole('button', { name: 'Close this dialog' }).click()
    }
    await page.getByRole('tab', { name: '电子证书', exact: true }).click()
    assert.equal(await page.getByRole('tab', { name: '电子证书', exact: true }).getAttribute('aria-selected'), 'true')
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    await page.getByRole('button', { name: '我的作品', exact: true }).click()
    assert.equal(await page.locator('.workitem').count(), 5)
    await context.close()
  }
  console.log('工作台版权与作品切换检查通过')
} finally {
  await browser.close()
}
