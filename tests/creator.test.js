import test from 'node:test'
import assert from 'node:assert/strict'
import { safeRedirect, request, getToken } from '../src/auth.js'
import { portal } from '../src/portal.js'
import * as api from '../src/api/creator.js'
import { canEdit, validateWork, validateChapter, validateFile, wordCount, dateText, quotaTip, outlineToText, outlineChapters, matchOutlineChapter, planOutlineChapters } from '../src/utils/creator.js'
import { stripRepeatedTail, stripRepeatedHead, clampEpisodeText, castFromCharacters, chapterTail, splitOutlineSections, rosterFromCharacters, unknownNames, stateGuardBlock, auditEpisodeState } from '../src/utils/creatorAi.js'
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
test('repeated episode names still parse, duplicate numbers and mixed formats are rejected', () => {
  const repeated = outlineChapters('第2集：记者进寨\n她进寨采访。\n第11集：记者进寨\n她再次追问。')
  assert.deepEqual(repeated.map(x => x.title), ['第2集：记者进寨', '第11集：记者进寨'])
  assert.deepEqual(outlineChapters('第2集：记者进寨\n甲\n第2集：记者进寨\n乙'), [])
  assert.deepEqual(outlineChapters('第2集：记者进寨\n甲\n2. 主角到站\n乙'), [])
})
test('episode headings glued to the end of a paragraph are split out', () => {
  assert.deepEqual(outlineChapters('第1集：相遇\n剧情一。第2集：告别\n剧情二'), [
    { title: '第1集：相遇', summary: '剧情一。' },
    { title: '第2集：告别', summary: '剧情二' }
  ])
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
  await api.saveChapter(17, { chapterId: 8, chapterTitle: '取消试读', content: '原文', isFree: '0', summary: '第8集摘要' })
  assert.deepEqual(JSON.parse(calls[1].options.body), { chapterTitle: '新试读章', content: '正文', isFree: '1' })
  assert.deepEqual(JSON.parse(calls[2].options.body), { chapterTitle: '取消试读', content: '原文', isFree: '0', summary: '第8集摘要' })
  assert.equal(calls[2].options.method, 'PUT')
  assert.equal(calls[2].options.headers.Authorization, 'Bearer test-user-token')
})
test('work ledger reads and writes the shared content ledger endpoint', async t => {
  const calls = []
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, options })
    return { ok: true, json: async () => ({ code: 200, data: { workId: 17, characters: '顾守山' } }) }
  })
  const ledger = await api.getWorkLedger(17)
  assert.equal(ledger.characters, '顾守山')
  assert.ok(calls[0].url.endsWith('/api/v1/content/works/17/ledger'))
  await api.saveWorkLedger(17, { storySummary: '简介', characters: '顾守山', relations: '父子', foreshadow: '铜铃', timeline: '雨夜', items: '房梁', threads: '照片' })
  assert.equal(calls[1].options.method, 'PUT')
  assert.ok(calls[1].url.endsWith('/api/v1/content/works/17/ledger'))
  assert.deepEqual(JSON.parse(calls[1].options.body), { storySummary: '简介', characters: '顾守山', relations: '父子', foreshadow: '铜铃', timeline: '雨夜', items: '房梁', threads: '照片' })
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
test('work API no longer exposes the removed flat category endpoint', () => {
  assert.equal(api.listCategories, undefined)
})
test('work, chapter and import validation rejects blank or oversized input', () => {
  assert.equal(validateWork({ title: '故事' }), '')
  for (const form of [{ title: ' ' }, { title: 'a'.repeat(101) }]) assert.ok(validateWork(form))
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
  await api.createWork({ title: ' 故事 ', summary: '简介', scriptUrl: '/file/docx', scriptName: '故事.docx', scriptSize: 100 })
  assert.deepEqual(JSON.parse(calls[0].body), { title: '故事', description: '简介', scriptUrl: '/file/docx', scriptName: '故事.docx', scriptSize: 100 })
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
test('ai quota balance reads points balance with Bearer token and no client-side fallback', async () => {
  let called
  globalThis.fetch = async (url, options) => { called = { url, headers: options.headers }; return { ok: true, status: 200, json: async () => ({ code: 200, data: { balance: 80, totalEarned: 200 } }) } }
  const quota = await api.getAiQuota(106)
  assert.equal(called.url, '/dev-api/api/v1/welfare/points/balance?userId=106')
  assert.equal(called.headers.Authorization, 'Bearer test-user-token')
  assert.equal(quota.available, 80)
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ code: 200, data: { balance: 0 } }) })
  assert.equal((await api.getAiQuota(7)).available, 0)
  globalThis.fetch = async () => ({ ok: true, status: 503, json: async () => ({ code: 503, message: '积分服务暂不可用' }) })
  await assert.rejects(api.getAiQuota(7), /积分服务暂不可用/)
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
test('ai records read write-records uniformly; outline typed as outline, newest first', async () => {
  globalThis.fetch = async url => {
    if (url.includes('/write-records')) return { ok: true, status: 200, json: async () => ({ code: 200, data: { list: [{ recordId: 9, writeType: 'outline', title: '灵感：剑修', inputPrompt: '灵感：剑修', outputContent: '书名：冷剑藏春', tokensUsed: 500, status: 'success', createdAt: '2026-10-16 09:00:00' }, { recordId: 1, writeType: 'polish', title: '润色测试', inputPrompt: '原句', outputContent: '润色后', tokensUsed: 320, status: 'success', createdAt: '2026-10-15 10:00:00' }, { recordId: 2, writeType: 'write', title: '续写测试', inputPrompt: '提示词', outputContent: '正文', tokensUsed: 150, createdAt: '2026-10-14 09:00:00' }] } }) }
    throw new Error('unexpected url ' + url)
  }
  const records = await api.listAiRecords()
  assert.equal(records.length, 3)
  assert.equal(records[0].type, 'outline')
  assert.equal(records[0].tokens, 500)
  assert.equal(records[0].output, '书名：冷剑藏春')
  assert.equal(records[1].type, 'polish')
  assert.equal(records[1].input, '原句')
  assert.equal(records[1].output, '润色后')
  assert.equal(records[1].tokens, 320)
  assert.equal(records[2].type, 'write')
  assert.equal(records[2].tokens, 150)
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
      controller.enqueue(new TextEncoder().encode('event:message\ndata:{"done":true,"quotaUsed":850,"requestNo":"AIR20261021"}\n\n'))
      controller.close()
    },
  })
  globalThis.fetch = async () => ({ ok: true, status: 200, body: okStream })
  const result = await api.generateStream('outline', { inspiration: '都市' }, () => {})
  assert.ok(result.outline.includes('"title"'))
  assert.equal(result.quotaUsed, 850)
  assert.equal(result.requestNo, 'AIR20261021')

  const errStream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('event:error\ndata:{"code":400,"message":"积分不足，当前余额: 0 分"}\n\n'))
      controller.close()
    },
  })
  globalThis.fetch = async () => ({ ok: true, status: 200, body: errStream })
  await assert.rejects(api.generateStream('write', { prompt: 'x' }, () => {}), /积分不足/)
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

test('an episode that copies the previous chapter tail is trimmed back', () => {
  const stolen = '屋里静下来。\n顾守山已经跨出院门，头也不回。顾守山：二十年前就没有回头路了。敲！'
  const prev = '顾守山已经跨出院门，头也不回。顾守山：二十年前就没有回头路了。敲！'
  assert.equal(stripRepeatedTail(stolen, chapterTail(prev, 500)).trim(), '屋里静下来。')
  // 自然衔接的短句不能删
  assert.equal(stripRepeatedTail('阿月推门进来，把碗放下。', '他把碗推回灶台。'), '阿月推门进来，把碗放下。')
})

test('a continuation that reopens the existing text loses its repeated prefix', () => {
  const existing = '屋里静下来。他把锣挂在墙上。雷老幺抱着锣，手抖得厉害，半天没出声。'
  assert.equal(stripRepeatedHead('雷老幺抱着锣，手抖得厉害，半天没出声。锣声在寨子里滚开。', existing), '锣声在寨子里滚开。')
  assert.equal(stripRepeatedHead('全新的段落。', existing), '全新的段落。')
})

test('over-long episode text is cut back at a sentence boundary', () => {
  const body = '甲。'.repeat(1000)
  const out = clampEpisodeText(body, 1500)
  assert.ok(out.length <= 1500)
  assert.ok(out.endsWith('。'))
  assert.equal(clampEpisodeText('乙。', 1500), '乙。')
})

test('missing cast line is recovered from the character notes by name hit', () => {
  const characters = '顾守山（52岁/男）：族长｜守戏\n小满（19岁/女）：学徒\n周老板（45岁/男）：商人'
  const card = '第3集：三叔说项\n本集事件：顾守山在小满面前提到周老板。'
  assert.deepEqual(castFromCharacters(characters, card), ['顾守山', '小满', '周老板'])
  assert.deepEqual(castFromCharacters(characters, '第4集：无事\n本集事件：无关的人走过。'), [])
})

test('markdown or bracket headings still split the outline into settings and episode cards', () => {
  const raw = [
    '## 故事简介',
    '守夜人守住十二面面具，也守住一场大火。',
    '',
    '**主要人物**',
    '顾守山（52岁/男）：族长｜守戏',
    '',
    '『人物关系』',
    '顾守山 ↔ 小满：师徒，瞒着面具下落。',
    '',
    '## 第1集：夜半面具',
    '本集事件：面具少了一面。',
  ].join('\n')
  const parts = splitOutlineSections(raw)
  assert.equal(parts.summary, '守夜人守住十二面面具，也守住一场大火。')
  assert.ok(parts.characters.includes('顾守山（52岁/男）：族长｜守戏'))
  assert.ok(parts.characters.includes('顾守山 ↔ 小满：师徒，瞒着面具下落。'))
  assert.equal(parts.outline.startsWith('## 第1集：夜半面具'), true)
  assert.equal(parts.outline.includes('故事简介'), false)
})

test('character roster is read from the age-tagged character notes', () => {
  const characters = '主要人物\n顾守山（62岁/男）：地戏掌坛师｜背微驼\n雷老幺（48岁/男）：村民\n林小禾（26岁/女）：记者\n顾守山 ↔ 雷老幺：老邻居'
  assert.deepEqual(rosterFromCharacters(characters), ['顾守山', '雷老幺', '林小禾'])
  assert.deepEqual(rosterFromCharacters(['顾守山（62岁/男）：掌坛师']), ['顾守山'])
  assert.deepEqual(rosterFromCharacters(''), [])
})

test('names outside the roster are flagged but the roster itself is clean', () => {
  const roster = ['顾守山', '雷老幺', '林小禾', '赵金凤', '吴德贵', '顾长顺']
  const text = '顾守山把面具摆开。赵金凤在旁边骂。忽然顾长庚挤进来。'
  assert.deepEqual(unknownNames(text, roster), ['顾长庚'])
  assert.deepEqual(unknownNames('林小禾举着录音笔，顾守山蹲在门槛。', roster), [])
  // 家宅、院子一类不是人名
  assert.deepEqual(unknownNames('林家老宅院墙外头，雷家院子静下来。', roster), [])
})

test('the state guard block freezes people, items and events', () => {
  const block = stateGuardBlock({
    roster: ['顾守山', '雷老幺'],
    items: '十二面地戏面具全部锁在樟木柜，铜钥匙在顾守山贴身口袋。',
    timeline: '第1集：午后，面具齐全。第2集：夜里，柜门被撬未失窃。',
  })
  assert.ok(block.includes('人/事/物不得自造'))
  assert.ok(block.includes('顾守山、雷老幺'))
  assert.ok(block.includes('十二面地戏面具全部锁在樟木柜'))
  assert.ok(block.includes('柜门被撬未失窃'))
  assert.ok(block.includes('不得引用前文从未出现过的道具'))
  // 允许一次性临时配角烘托气氛，但禁止其承担主线或跨集复用
  assert.ok(block.includes('临时角色'))
  assert.ok(block.includes('不得推动主线'))
})

test('episode state audit catches missing cast, and flags strangers only when reused across episodes', () => {
  const roster = ['顾守山', '雷老幺', '林小禾']
  // 只在本集露面一次的陌生人物：视为临时配角，不报
  assert.deepEqual(auditEpisodeState({
    text: '顾守山锁了柜子，林小禾在门外录。顾长庚喊了句闲话就走了。',
    cast: ['顾守山', '林小禾'],
    roster,
    strangerUsage: new Map(),
  }), [])
  // 跨两集以上复用：已经挤进主线，必须提示
  const usage = new Map([['顾长庚', 2]])
  const issues = auditEpisodeState({
    text: '顾守山锁了柜子。顾长庚又来敲门。',
    cast: ['顾守山', '雷老幺'],
    roster,
    strangerUsage: usage,
  })
  assert.equal(issues.length, 2)
  assert.ok(issues[0].includes('雷老幺'))
  assert.ok(issues[1].includes('顾长庚'))
  assert.equal(usage.get('顾长庚'), 3)
  assert.deepEqual(auditEpisodeState({ text: '顾守山对雷老幺说完，林小禾点头。', cast: ['顾守山', '雷老幺'], roster }), [])
})
