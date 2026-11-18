import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

async function source(path) {
  return readFile(new URL(path, import.meta.url), 'utf8')
}

test('创作者端合同面板只请求并展示卖方视角', async () => {
  const panel = await source('../src/components/trade/ContractPanel.vue')
  assert.match(panel, /listContracts\(\{ role: 'seller'/)
  assert.match(panel, /我卖出的合同/)
  assert.match(panel, /我是卖方/)
  assert.ok(!panel.includes('v-model="role"'), '合同角色下拉应已移除')
  assert.ok(!panel.includes('isBuyerOf'), '按行判定买方身份的分支应已移除')
})

test('创作者端签署按钮只看卖方签章节点', async () => {
  const panel = await source('../src/components/trade/ContractPanel.vue')
  const canSign = panel.split('function canSign(c) {')[1].split('\n}')[0]
  assert.match(canSign, /sellerSignStatus/)
  assert.ok(!canSign.includes('buyerSignStatus'), '签署权限不得再按买方节点判断')
})

test('创作者端询盘与订单只请求卖方视角', async () => {
  const page = await source('../src/views/panels/Cooperation.vue')
  assert.match(page, /const params = \{ role: 'seller', pageNum: inquiryPageNum\.value/)
  assert.match(page, /const params = \{ role: 'seller', pageNum: orderPageNum\.value/)
  assert.match(page, /我收到的询盘/)
  assert.match(page, /我卖出的订单/)
  assert.ok(!page.includes('inquiryRole'), '询盘角色下拉应已移除')
  assert.ok(!page.includes('orderRole'), '订单角色下拉应已移除')
})
