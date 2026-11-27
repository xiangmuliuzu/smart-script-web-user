// 合同材料（签署 PDF / 分页图 / 印章）的鉴权链接：地址带 exp/sig 查询串。
//
// 回归点：mediaUrl 逐段 encode 时不能把查询串一起转义（? → %3F），
// 否则后端把整串当文件名，签名校验不过直接 403；下载也不能把地址直接当新页面打开。
import test from 'node:test'
import assert from 'node:assert/strict'

import { encodeMediaPath, mediaUrl } from '../src/utils/avatarUrl.js'
import { downloadProfileFile } from '../src/utils/copyright.js'

const SIGNED = '/profile/upload/contract/2026/11/3f9a.pdf?exp=1763000000&sig=AbC-_def'

test('签名查询串原样保留：相对地址与已带 API 前缀的地址都一样', () => {
  assert.equal(mediaUrl(SIGNED), '/dev-api' + SIGNED)
  assert.equal(mediaUrl('/dev-api' + SIGNED), '/dev-api' + SIGNED)
  assert.equal(mediaUrl(SIGNED, '/prod-api'), '/prod-api' + SIGNED)
})

test('路径段仍按原口径 encode，中文文件名不受影响', () => {
  assert.equal(
    mediaUrl('/profile/upload/contract/2026/11/合同 终版.pdf?exp=1&sig=a-b_c'),
    '/dev-api/profile/upload/contract/2026/11/' + encodeURIComponent('合同 终版.pdf') + '?exp=1&sig=a-b_c'
  )
  assert.equal(encodeMediaPath('/a/中文.pdf?x=1&y=2'), '/a/%E4%B8%AD%E6%96%87.pdf?x=1&y=2')
  assert.equal(encodeMediaPath('/a/b.pdf'), '/a/b.pdf')
})

/** 最小 DOM/BOM 打桩：只够 saveBlobFile 走完。 */
function stubBrowser() {
  const clicks = []
  const previousDocument = globalThis.document
  globalThis.document = {
    createElement: () => ({
      set download(value) { clicks.push(value) },
      click() {},
      remove() {},
    }),
    body: { appendChild() {} },
  }
  globalThis.URL.createObjectURL = () => 'blob:test'
  globalThis.URL.revokeObjectURL = () => {}
  return { clicks, restore: () => { globalThis.document = previousDocument } }
}

test('下载：403 提示链接过期，HTML 兜底页不当文件保存，PDF 字节流触发保存', async () => {
  const originalFetch = globalThis.fetch
  const browser = stubBrowser()
  try {
    globalThis.fetch = async () => new Response('', { status: 403 })
    await assert.rejects(() => downloadProfileFile(SIGNED, '合同.pdf'), /已过期/)

    globalThis.fetch = async () => new Response('<!doctype html><html></html>', {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
    await assert.rejects(() => downloadProfileFile(SIGNED, '合同.pdf'), /文件不可用/)

    let requested = ''
    globalThis.fetch = async url => {
      requested = url
      return new Response('%PDF-1.4 test', { status: 200, headers: { 'Content-Type': 'application/pdf' } })
    }
    await downloadProfileFile(SIGNED, '合同_C1.pdf')
    assert.equal(requested, '/dev-api' + SIGNED, '请求要带签名查询串')
    assert.deepEqual(browser.clicks, ['合同_C1.pdf'])
  } finally {
    globalThis.fetch = originalFetch
    browser.restore()
  }
})
