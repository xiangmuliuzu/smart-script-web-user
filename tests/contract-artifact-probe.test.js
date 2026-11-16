// 合同预览的签章可达性探测：srcdoc iframe 里的图片失败父页面看不到，
// 后端缺文件已改为真 404，这里锁定「缺几张」的计数口径。
import test from 'node:test'
import assert from 'node:assert/strict'

import { countUnreachableContractImages } from '../src/utils/avatarUrl.js'

const html = url => `<div class="sign"><img class="seal" src="${url}" /></div>`
const A = '/profile/upload/contract/2026/10/c13/stamp/buyer_seal_5f7eb1bc.png?exp=1&sig=a'
const B = '/profile/contract/23/seller_seal_1793599674572.png?exp=1&sig=b'

test('签章都能取到时不提示', async () => {
  const seen = []
  const fetchImpl = async url => { seen.push(url); return { ok: true } }
  assert.equal(await countUnreachableContractImages(html(A), [], fetchImpl), 0)
  assert.deepEqual(seen, ['/dev-api' + A])
})

test('缺文件的计数包含正文签章与上传件分页图', async () => {
  const page = '/profile/upload/contract/2026/10/c13/page_0.png'
  const broken = new Set(['/dev-api' + B, '/dev-api' + page])
  const fetchImpl = async url => ({ ok: !broken.has(url) })
  assert.equal(await countUnreachableContractImages(html(A) + html(B), [page], fetchImpl), 2)
})

test('请求发不出去（断网）同样算取不到', async () => {
  const fetchImpl = async () => { throw new Error('network') }
  assert.equal(await countUnreachableContractImages(html(B), [], fetchImpl), 1)
})

test('正文没有 /profile 图片时不发请求', async () => {
  let calls = 0
  const fetchImpl = async () => { calls++; return { ok: true } }
  assert.equal(await countUnreachableContractImages('<p>无图</p>', ['data:image/png;base64,AAA'], fetchImpl), 0)
  assert.equal(calls, 0)
})
