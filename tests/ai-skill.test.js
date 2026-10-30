import test from 'node:test'
import assert from 'node:assert/strict'
import * as api from '../src/api/creator.js'

globalThis.localStorage = { getItem: () => 'skill-test-token', setItem: () => {}, removeItem: () => {} }

test('listAiSkills calls the shared skills endpoint and unwraps the list', async t => {
  const calls = []
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, options })
    return { ok: true, json: async () => ({ code: 200, data: [{ id: 1, skillName: '悬疑烧脑导演', fileName: '悬疑烧脑导演.skill.md' }, { id: 2, skillName: '甜宠爆款导演', fileName: '甜宠爆款导演.skill.md' }] }) }
  })
  const skills = await api.listAiSkills()
  assert.ok(calls[0].url.endsWith('/api/v1/content/ai/skills'))
  assert.equal(calls[0].options.method, 'GET')
  assert.equal(calls[0].options.headers.Authorization, 'Bearer skill-test-token')
  assert.deepEqual(skills.map(s => s.skillName), ['悬疑烧脑导演', '甜宠爆款导演'])
})

test('storyboard records are typed as storyboard in the merged AI records', async t => {
  t.mock.method(globalThis, 'fetch', async (url) => {
    const path = String(url)
    if (path.endsWith('/write-records')) {
      return { ok: true, json: async () => ({ code: 200, data: [{ recordId: 1, writeType: 'storyboard', title: '雨夜便利店分镜', inputPrompt: '第一幕', outputContent: '镜1｜景别', tokensUsed: 1263, status: '0', createdAt: '2026-10-30 10:50' }, { recordId: 2, writeType: 'polish', title: '润色', outputContent: 'x', tokensUsed: 100, createdAt: '2026-10-30 09:00' }] }) }
    }
    if (path.endsWith('/outline-records')) return { ok: true, json: async () => ({ code: 200, data: [] }) }
    return { ok: true, json: async () => ({ code: 200, data: [] }) }
  })
  const records = await api.listAiRecords()
  assert.equal(records.length, 2)
  assert.deepEqual(records.map(r => r.type), ['storyboard', 'polish'])
  assert.equal(records[0].output, '镜1｜景别')
  assert.equal(records[0].tokens, 1263)
})

test('generateStream keeps storyboard on the plain text path (content result, not outline)', async t => {
  const calls = []
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, options })
    const encoder = new TextEncoder()
    const body = 'data:' + JSON.stringify({ delta: '镜1｜景别：特写' }) + '\n\ndata:{"done":true,"quotaUsed":1}\n\n'
    return { ok: true, status: 200, body: new ReadableStream({ start(controller) { controller.enqueue(encoder.encode(body)); controller.close() } }) }
  })
  const result = await api.generateStream('storyboard', { script: '第一幕', style: '电影感', skillId: 1 }, () => {})
  assert.ok(calls[0].url.endsWith('/api/v1/content/ai/storyboard/stream'))
  assert.deepEqual(JSON.parse(calls[0].options.body), { script: '第一幕', style: '电影感', skillId: 1 })
  assert.equal(result.content, '镜1｜景别：特写')
  assert.equal(result.quotaUsed, 1)
})
