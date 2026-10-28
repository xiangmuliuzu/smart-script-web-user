import test from 'node:test'
import assert from 'node:assert/strict'
import { safeRedirect, request, getToken } from '../src/auth.js'
import { portal } from '../src/portal.js'
import * as api from '../src/api/creator.js'
import { canEdit, validateWork, validateChapter, validateFile, wordCount, dateText, quotaTip, outlineToText, outlineChapters, matchOutlineChapter, planOutlineChapters } from '../src/utils/creator.js'
const storage = new Map([[portal.tokenKey, 'test-user-token']])
test('chapter outlines are split by explicit episode headings without inventing chapters', () => {
  assert.deepEqual(outlineChapters('书名：故事\n第一集：相遇\n两人在车站相遇。\n第二集：告别\n两人分别。'), [
    { title: '第一集：相遇', summary: '两人在车站相遇。' },
    { title: '第二集：告别', summary: '两人分别。' }
  ])
  assert.deepEqual(outlineChapters('第一幕：相遇\n故事开始'), [])
  assert.deepEqual(outlineChapters('第一集：相遇\n内容\n第一集：相遇\n内容'), [])
})
test('outlines recognize common chapter numbers and matching avoids ambiguity', () => {
  const outline = '第１集（相遇）\n剧情一\n第贰章告别\n剧情二\n第3集 重逢\n剧情三\n第四回·终章\n剧情四'
  assert.deepEqual(outlineChapters(outline).map(x => x.title), ['第１集（相遇）', '第贰章告别', '第3集 重逢', '第四回·终章'])
  const chapter = { chapterTitle: '第一章：相遇', content: '' }
  assert.equal(matchOutlineChapter('第１集（相遇）', [chapter]).chapter, chapter)
  assert.equal(matchOutlineChapter('第2章：告别', [{ chapterTitle: '告别' }]).chapter.chapterTitle, '告别')
  assert.equal(matchOutlineChapter('第2章：告别', [{ chapterTitle: '第二集：重逢' }]).conflict, true)
  assert.equal(matchOutlineChapter('第2章：告别', [{ chapterTitle: '第二集' }, { chapterTitle: '第2章：告别' }]).conflict, true)
  assert.deepEqual(outlineChapters('第一集：相遇\n剧情\n第1章 相遇\n剧情'), [])
  assert.deepEqual(outlineChapters('第1集：相遇\n剧情\n第一章：告别\n剧情'), [])
  assert.equal(outlineChapters('一、相遇\n剧情\n二、告别\n剧情').length, 2)
  assert.equal(matchOutlineChapter('第两百零一集：相遇', [{ chapterTitle: '第２０１章相遇' }]).chapter.chapterTitle, '第２０１章相遇')
  assert.deepEqual(outlineChapters('第一集：相遇\n剧情\n2. 主角到站\n相遇'), [])
})
test('outline plan checks actual sequence, names, and safe append order', () => {
  const entries = outlineChapters('第一集：相遇\n剧情\n第二集：告别\n剧情\n第三集：重逢\n剧情\n第四集：终章\n剧情')
  const chapters = [{ chapterId: 1, chapterNo: 1, chapterTitle: '序幕', content: '' }, { chapterId: 2, chapterNo: 2, chapterTitle: '第2集：告别', content: '正文' }, { chapterId: 3, chapterNo: 4, chapterTitle: '第3集：重逢', content: '' }]
  const plan = planOutlineChapters(entries, chapters)
  assert.deepEqual(plan.map(x => x.action), ['conflict', 'skip', 'conflict', 'conflict'])
  const fresh = planOutlineChapters(outlineChapters('第二集：告别\n剧情'), [{ draftId: 'a', chapterTitle: '第 1 集', content: '' }])
  assert.equal(fresh[0].action, 'conflict')
  const ok = planOutlineChapters(outlineChapters('第一集：相遇\n剧情\n第二集：告别\n剧情'), [{ draftId: 'a', chapterTitle: '第 1 集', content: '' }])
  assert.deepEqual(ok.map(x => x.action), ['fill', 'create'])
  assert.equal(planOutlineChapters(outlineChapters('第二集：相遇\n剧情'), [{ chapterId: 1, chapterNo: 1, chapterTitle: '第一集：相遇', content: '' }])[0].action, 'conflict')
  assert.equal(planOutlineChapters(outlineChapters('第一集：相遇\n剧情'), [{ chapterId: 1, chapterNo: 2, chapterTitle: '第一集：相遇', content: '' }])[0].action, 'conflict')
  assert.equal(planOutlineChapters(outlineChapters('第一集：相遇\n剧情'), [{ chapterTitle: '自定义章节', content: '' }])[0].action, 'conflict')
})
globalThis.localStorage = { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) }

test('work deletion sends only the code and shares App endpoints with authenticated requests', async t => {
  const calls = []
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, options })
    return { ok: true, json: async () => ({ code: 200, data: { sent: true } }) }
  })
  await api.sendWorkDeletionCode(7)
  await api.deleteWork(7, '123456')
  assert.ok(calls[0].url.endsWith('/api/v1/content/works/7/delete-code'))
  assert.equal(calls[0].options.method, 'POST')
  assert.equal(calls[0].options.body, undefined)
  assert.ok(calls[1].url.endsWith('/api/v1/content/works/7'))
  assert.equal(calls[1].options.method, 'DELETE')
  assert.deepEqual(JSON.parse(calls[1].options.body), { code: '123456' })
  assert.equal(calls[1].options.headers.Authorization, 'Bearer test-user-token')
})

test('creator capability and review lock apply independently of user type', () => {
  for (const userType of ['01', '02', '03']) {
    assert.equal(canEdit({ userType, authorCapability: true }, { status: 'draft' }), true)
    assert.equal(canEdit({ userType, authorCapability: false }, { status: 'draft' }), false)
    assert.equal(canEdit({ userType, authorCapability: true }, { status: 'reviewing' }), false)
  }
  assert.equal(canEdit({ authorCapability: 'true' }, { status: 'draft' }), false)
  assert.equal(canEdit({ authorCapability: true }, { status: 'unknown' }), false)
})

test('chapter trial flags round-trip through authenticated saves without changing chapter status', async t => {
  const calls = []
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, options })
    return { ok: true, json: async () => ({ code: 200, data: { chapters: [{ chapterId: 8, isFree: 1, content: '原文' }, { chapterId: 9, content: '未设置' }] } }) }
  })
  const detail = await api.getWork(17)
  assert.equal(detail.chapters[0].isFree, '1')
  assert.equal(detail.chapters[1].isFree, '0')
  await api.saveChapter(17, { chapterTitle: ' 新试读章 ', content: '正文', isFree: '1' })
  await api.saveChapter(17, { chapterId: 8, chapterTitle: '取消试读', content: '原文', isFree: '0' })
  assert.deepEqual(JSON.parse(calls[1].options.body), { chapterTitle: '新试读章', content: '正文', isFree: '1' })
  assert.deepEqual(JSON.parse(calls[2].options.body), { chapterTitle: '取消试读', content: '原文', isFree: '0' })
  assert.equal(calls[2].options.method, 'PUT')
  assert.equal(calls[2].options.headers.Authorization, 'Bearer test-user-token')
})
test('publishing a chapter updates only its visibility status', async t => {
  let call
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    call = { url, options }
    return { ok: true, json: async () => ({ code: 200, data: {} }) }
  })
  await api.publishChapter(8)
  assert.ok(call.url.endsWith('/api/v1/content/chapters/8'))
  assert.equal(call.options.method, 'PUT')
  assert.deepEqual(JSON.parse(call.options.body), { status: '0' })
  assert.equal(call.options.headers.Authorization, 'Bearer test-user-token')
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
test('ai quota balance reads availableQuota with Bearer token and no client-side fallback', async () => {
  let called
  globalThis.fetch = async (url, options) => { called = { url, headers: options.headers }; return { ok: true, status: 200, json: async () => ({ code: 200, data: { availableQuota: 3, totalEarned: 5, records: [{ recordId: 1 }] } }) } }
  const quota = await api.getAiQuota(106)
  assert.equal(called.url, '/dev-api/api/v1/ai/quota/balance?userId=106')
  assert.equal(called.headers.Authorization, 'Bearer test-user-token')
  assert.equal(quota.available, 3)
  assert.equal(quota.records.length, 1)
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ code: 200, data: { availableQuota: 0 } }) })
  assert.equal((await api.getAiQuota(7)).available, 0)
  globalThis.fetch = async () => ({ ok: true, status: 503, json: async () => ({ code: 503, message: 'AI 服务暂不可用' }) })
  await assert.rejects(api.getAiQuota(7), /AI 服务暂不可用/)
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
test('quota tip only appears when balance hits zero and steers PC users to the phone app', () => {
  assert.equal(quotaTip(3), '')
  assert.equal(quotaTip(1), '')
  assert.ok(quotaTip(0).includes('手机 App'))
  assert.ok(quotaTip(-1).includes('福利中心'))
})
test('ai records merge write/polish and outline records, tagged by type and newest first', async () => {
  globalThis.fetch = async url => {
    if (url.includes('/write-records')) return { ok: true, status: 200, json: async () => ({ code: 200, data: { list: [{ recordId: 1, writeType: 'polish', title: '润色测试', inputPrompt: '原句', outputContent: '润色后', status: 'success', createdAt: '2026-10-15 10:00:00' }, { recordId: 2, writeType: 'write', title: '续写测试', inputPrompt: '提示词', outputContent: '正文', createdAt: '2026-10-14 09:00:00' }] } }) }
    if (url.includes('/outline-records')) return { ok: true, status: 200, json: async () => ({ code: 200, data: { list: [{ requestId: 9, quotaCost: 1, status: 'success', createdAt: '2026-10-16 09:00:00' }] } }) }
    throw new Error('unexpected url ' + url)
  }
  const records = await api.listAiRecords()
  assert.equal(records.length, 3)
  assert.equal(records[0].type, 'outline')
  assert.equal(records[0].quotaUsed, 1)
  assert.equal(records[0].output, '')
  assert.equal(records[1].type, 'polish')
  assert.equal(records[1].input, '原句')
  assert.equal(records[1].output, '润色后')
  assert.equal(records[2].type, 'write')
  assert.equal(records[2].quotaUsed, null)
})
test('outline object renders as readable labelled text, never raw JSON', () => {
  const outline = { title: '测试纪元', logline: '一句话故事', characters: [{ name: '林澈', role: '主角' }], acts: [{ name: '第一幕', summary: '开局', beats: ['觉醒', '反转'] }] }
  const text = outlineToText(outline)
  assert.ok(text.includes('书名：测试纪元'))
  assert.ok(text.includes('角色名：林澈'))
  assert.ok(text.includes('身份：主角'))
  assert.ok(text.includes('幕名：第一幕'))
  assert.ok(text.includes('关键情节觉醒、反转'))
  assert.ok(!text.includes('{'))
  assert.equal(outlineToText('直接是文本'), '直接是文本')
  assert.equal(outlineToText(null), '')
})
test('generateStream consumes SSE deltas and returns final content with done fields', async () => {
  const calls = []
  const chunks = [
    'event:message\ndata:{"delta":"夜色里，"}\n\n',
    'event:message\ndata:{"delta":"他推开了门。"}\n\n',
    'event:message\ndata:{"done":true,"recordId":55}\n\n',
  ]
  // 跨 chunk 切分：第二个块拆成两次 deliver，验证尾部多块切分正确。
  const bodyStream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(chunks[0]))
      controller.enqueue(new TextEncoder().encode(chunks[1].slice(0, 15)))
      controller.enqueue(new TextEncoder().encode(chunks[1].slice(15)))
      controller.enqueue(new TextEncoder().encode(chunks[2]))
      controller.close()
    },
  })
  globalThis.fetch = async (url, options) => {
    calls.push({ url, headers: options.headers, body: JSON.parse(options.body) })
    return { ok: true, status: 200, body: bodyStream }
  }
  const deltas = []
  const result = await api.generateStream('write', { prompt: '续写' }, d => deltas.push(d))
  assert.equal(calls[0].url, '/dev-api/api/v1/content/ai/write/stream')
  assert.equal(calls[0].headers.Authorization, 'Bearer test-user-token')
  assert.deepEqual(calls[0].body, { prompt: '续写' })
  assert.deepEqual(deltas, ['夜色里，', '他推开了门。'])
  assert.equal(result.content, '夜色里，他推开了门。')
  assert.equal(result.recordId, 55)
  assert.equal(result.done, true)
})
test('generateStream outline returns text delta and raises on error events without a record', async () => {
  const okStream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('event:message\ndata:{"delta":"{\\"title\\":\\"测试\\"}"}\n\n'))
      controller.enqueue(new TextEncoder().encode('event:message\ndata:{"done":true,"quotaUsed":1,"requestNo":"AIR20261021"}\n\n'))
      controller.close()
    },
  })
  globalThis.fetch = async () => ({ ok: true, status: 200, body: okStream })
  const result = await api.generateStream('outline', { inspiration: '都市' }, () => {})
  assert.ok(result.outline.includes('"title"'))
  assert.equal(result.quotaUsed, 1)
  assert.equal(result.requestNo, 'AIR20261021')

  const errStream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('event:error\ndata:{"code":400,"message":"AI次数不足，当前可用: 0 次"}\n\n'))
      controller.close()
    },
  })
  globalThis.fetch = async () => ({ ok: true, status: 200, body: errStream })
  await assert.rejects(api.generateStream('write', { prompt: 'x' }, () => {}), /AI次数不足/)
})
test('generateStream reports non-ok HTTP as an error before reading the stream', async () => {
  globalThis.fetch = async () => ({ ok: false, status: 503, json: async () => ({ code: 503, message: 'AI 服务暂不可用' }) })
  await assert.rejects(api.generateStream('write', { prompt: 'x' }, () => {}), /AI 服务暂不可用/)
})
test('generateStream treats an EOF aborted stream with received deltas as success (Tomcat SSE close)', async () => {
  // Tomcat 对 SseEmitter 完成时不发送 chunked 终止块直接关闭连接，
  // fetch 读到 EOF 抛 AbortError；已收到的 delta/done 仍应作为完整结果返回。
  const bodyStream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('event:message\ndata:{"delta":"夜色里，"}\n\n'))
      controller.enqueue(new TextEncoder().encode('event:message\ndata:{"done":true,"recordId":66}\n\n'))
      setTimeout(() => controller.error(new Error('BodyStreamBuffer was aborted')), 0)
    },
  })
  globalThis.fetch = async () => ({ ok: true, status: 200, body: bodyStream })
  const deltas = []
  const result = await api.generateStream('write', { prompt: '续写' }, d => deltas.push(d))
  assert.deepEqual(deltas, ['夜色里，'])
  assert.equal(result.content, '夜色里，')
  assert.equal(result.recordId, 66)
  assert.equal(result.done, true)
})
test('generateStream propagates an aborted stream with no content as an error', async () => {
  const bodyStream = new ReadableStream({
    start(controller) {
      setTimeout(() => controller.error(new Error('BodyStreamBuffer was aborted')), 0)
    },
  })
  globalThis.fetch = async () => ({ ok: true, status: 200, body: bodyStream })
  await assert.rejects(api.generateStream('write', { prompt: 'x' }, () => {}), /BodyStreamBuffer was aborted/)
})

test('generateStream displays CRLF deltas before completion and completes without waiting for EOF', async t => {
  let source, received
  const first = new Promise(resolve => { received = resolve })
  globalThis.fetch = async () => ({ ok: true, status: 200, body: new ReadableStream({ start(controller) { source = controller } }) })
  const deltas = []
  const output = api.generateStream('outline', { inspiration: '灵感' }, text => { deltas.push(text); received() })
  t.after(async () => { try { source?.close() } catch {} await output.catch(() => {}) })
  await new Promise(resolve => setTimeout(resolve, 0))
  source.enqueue(new TextEncoder().encode('data:{"delta":"书名：雨夜"}\r\n\r\n'))
  await Promise.race([first, new Promise((_, reject) => setTimeout(() => reject(new Error('delta was buffered')), 300))])
  assert.deepEqual(deltas, ['书名：雨夜'])
  source.enqueue(new TextEncoder().encode('data:{"done":true,"quotaUsed":1}\n\n'))
  assert.equal((await output).outline, '书名：雨夜')
})

test('income and withdraw APIs share App finance routes without admin paths', async () => {
  const calls = []
  globalThis.fetch = async (url, options) => {
    calls.push({ url, ...options })
    return { ok: true, status: 200, json: async () => ({ code: 200, data: { total: 0, rows: [] } }) }
  }
  await api.getIncomeOverview()
  await api.getIncomeStats('week')
  await api.listIncomeDetails({ billType: 'income', pageNum: 1, pageSize: 20 })
  await api.getIncomeBillDetail(21)
  await api.listIncomeSettles({ status: 'pending' })
  await api.getIncomeSettle(2)
  await api.confirmIncomeSettle(2)
  await api.disputeIncomeSettle(2, '金额不符')
  await api.applyWithdraw({ amount: 10.5, withdrawType: 'alipay', accountName: '江叙', accountNo: '13800000000', clientToken: 'wd_1' })
  await api.listWithdraws({ status: 'pending' })
  assert.equal(calls[0].url, '/dev-api/api/v1/trade/finance/income/overview')
  assert.ok(calls[1].url.includes('/api/v1/trade/finance/income/stats?period=week'))
  assert.ok(calls[2].url.includes('/api/v1/trade/finance/income/detail?'))
  assert.ok(calls[2].url.includes('billType=income'))
  assert.equal(calls[3].url, '/dev-api/api/v1/trade/finance/income/detail/21')
  assert.ok(calls[4].url.includes('/income/settle/list'))
  assert.equal(calls[5].url, '/dev-api/api/v1/trade/finance/income/settle/2')
  assert.equal(calls[6].url, '/dev-api/api/v1/trade/finance/income/settle/2/confirm')
  assert.equal(calls[6].method, 'POST')
  assert.equal(calls[7].method, 'POST')
  assert.deepEqual(JSON.parse(calls[7].body), { reason: '金额不符' })
  assert.equal(calls[8].url, '/dev-api/api/v1/trade/finance/withdraw/apply')
  assert.equal(JSON.parse(calls[8].body).amount, 10.5)
  assert.ok(calls[9].url.includes('/trade/finance/withdraw/list'))
  for (const call of calls) {
    assert.equal(call.headers.Authorization, 'Bearer test-user-token')
    assert.ok(!call.url.includes('/admin/'))
  }
})

test('generateStream rejects a truncated response without losing delivered text', async () => {
  globalThis.fetch = async () => ({ ok: true, status: 200, body: new ReadableStream({ start(controller) {
    controller.enqueue(new TextEncoder().encode('data:{"delta":"已经生成的内容"}\n\n'))
    controller.close()
  } }) })
  const deltas = []
  await assert.rejects(api.generateStream('write', { prompt: '故事' }, text => deltas.push(text)), /中断/)
  assert.deepEqual(deltas, ['已经生成的内容'])
})
