import test from 'node:test'
import assert from 'node:assert/strict'
import { safeRedirect, request, getToken } from '../src/auth.js'
import { portal } from '../src/portal.js'
import * as api from '../src/api/creator.js'
import { canEdit, validateWork, validateChapter, validateFile, wordCount, dateText } from '../src/utils/creator.js'
const storage = new Map([[portal.tokenKey, 'test-user-token']])
globalThis.localStorage = { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) }

test('creator capability and review lock apply independently of user type', () => {
  for (const userType of ['01', '02', '03']) {
    assert.equal(canEdit({ userType, authorCapability: true }, { status: 'draft' }), true)
    assert.equal(canEdit({ userType, authorCapability: false }, { status: 'draft' }), false)
    assert.equal(canEdit({ userType, authorCapability: true }, { status: 'reviewing' }), false)
  }
  assert.equal(canEdit({ authorCapability: 'true' }, { status: 'draft' }), false)
  assert.equal(canEdit({ authorCapability: true }, { status: 'unknown' }), false)
})
test('redirect permits implemented work routes and rejects path tricks', () => {
  for (const path of ['/works', '/works/create', '/works/12?tab=chapter#review']) assert.equal(safeRedirect(path), path)
  for (const path of ['//evil.test/works', '/works/../login', '/works/abc', '/works/0', '/works/%2f%2fevil.test', '/preview', '/works\\12']) assert.equal(safeRedirect(path), '/session')
})
test('work, chapter and import validation rejects blank or oversized input', () => {
  assert.equal(validateWork({ title: '故事', genreId: 1 }), '')
  for (const form of [{ title: ' ', genreId: 1 }, { title: 'a'.repeat(101), genreId: 1 }, { title: '故事', genreId: 0 }]) assert.ok(validateWork(form))
  assert.equal(validateChapter({ chapterTitle: '第一幕', content: '夜色里，她推开了门。' }), '')
  assert.ok(validateChapter({ chapterTitle: '第一幕', content: '  ' }))
  assert.equal(wordCount(' 雨 夜\n的 车 '), 4)
  assert.equal(validateFile({ name: 'draft.docx', size: 100 }, ['txt', 'docx']), '')
  assert.ok(validateFile({ name: 'script.exe', size: 100 }, ['txt', 'docx']))
  assert.ok(validateFile({ name: 'empty.txt', size: 0 }, ['txt']))
  assert.ok(validateFile({ name: 'huge.txt', size: 11 * 1024 * 1024 }, ['txt']))
})
test('business API uses current-user routes, mapped fields and the existing Bearer token', async () => {
  const calls = []
  globalThis.fetch = async (url, options) => { calls.push({ url, ...options }); return { ok: true, status: 200, json: async () => ({ code: 200, data: { workId: 17 } }) } }
  await api.createWork({ title: ' 故事 ', genreId: '3', summary: '简介', scriptUrl: '/file/docx', scriptName: '故事.docx', scriptSize: 100 })
  assert.deepEqual(JSON.parse(calls[0].body), { title: '故事', categoryId: 3, description: '简介', scriptUrl: '/file/docx', scriptName: '故事.docx', scriptSize: 100 })
  await api.saveChapter(17, { chapterTitle: ' 新章 ', content: '内容' })
  await api.saveChapter(17, { chapterId: 8, chapterTitle: ' 修改 ', content: '新内容' })
  await api.deleteChapter(17, 8)
  assert.equal(calls[1].url, '/dev-api/api/v1/users/me/works/17/chapters')
  assert.equal(calls[1].method, 'POST')
  assert.equal(calls[2].method, 'PUT')
  assert.equal(calls[3].method, 'DELETE')
  for (const call of calls) { assert.equal(call.headers.Authorization, 'Bearer test-user-token'); assert.ok(!call.url.includes('/admin/')) }
  assert.equal(getToken(), 'test-user-token')
})
test('multipart upload lets the browser set its boundary and sends no client user id', async () => {
  let sent
  globalThis.fetch = async (url, options) => { sent = { url, ...options }; return { ok: true, status: 200, json: async () => ({ code: 200, data: { url: '/uploads/a.txt' } }) } }
  const file = new File(['正文'], 'a.txt', { type: 'text/plain' })
  assert.equal((await api.upload(file)).url, '/uploads/a.txt')
  assert.equal(sent.headers['Content-Type'], undefined)
  assert.ok(sent.body instanceof FormData)
  assert.equal(sent.body.get('file').name, 'a.txt')
  assert.equal(sent.body.get('type'), 'script')
  assert.equal(sent.body.get('userId'), null)
  await api.upload(new File(['# 正文'], 'a.md', { type: 'text/markdown' }))
  assert.equal(sent.body.get('file').name, 'a.txt')
  assert.equal(await sent.body.get('file').text(), '# 正文')
})
test('message list maps server read, summary and createdAt fields without inventing data', async () => {
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ code: 200, data: { list: [{ messageId: 1, read: false, summary: '审核意见', createdAt: '2026-10-14' }] } }) })
  const [message] = await api.listMessages()
  assert.equal(message.isRead, false)
  assert.equal(message.content, '审核意见')
  assert.equal(message.createTime, '2026-10-14')
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ code: 503, message: 'AI 服务暂不可用' }) })
  await assert.rejects(api.generate('outline', {}), /AI 服务暂不可用/)
  assert.equal(getToken(), 'test-user-token')
})
test('requests preserve auth response envelope as well as business data', async () => {
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ code: 200, user: { userId: 7 }, roles: ['buyer'], data: null }) })
  assert.deepEqual((await request('/api/v1/auth/getInfo')).roles, ['buyer'])
})
test('timezone-qualified timestamps display in Hong Kong while server wall times remain intact', () => {
  assert.equal(dateText('2026-10-13T23:30:00Z'), '2026-10-14 07:30')
  assert.equal(dateText('2026-10-14 09:20:00'), '2026-10-14 09:20')
  assert.equal(dateText(null), '—')
})
