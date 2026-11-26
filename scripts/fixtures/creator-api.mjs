// 仅供 Playwright 拦截真实 API 路径；不会被应用或生产构建导入。
import { documentText, isFormattedDocument } from '../../src/utils/document.js'
import { wordCount } from '../../src/utils/creator.js'

// AI 剧本流返回可解析的分集大纲（PC 端「按大纲生成各章」和 AI 创作页都据此拆章）。
// 与 AiCreate.vue 的 AI_CREATE_MARK 一致：章节正文记录前缀，删除大纲时级联删除。
const AI_CREATE_MARK = '[AI创作]'
const OUTLINE_STREAM = '书名：深夜频率\n一句话简介：一位深夜电台主播在听众留言里听到了十年前的自己。\n第一集 · 深夜频率\n雨夜的咖啡馆，一次迟来的重逢。\n第二集 · 迟到的信\n一封没有寄出的信揭开旧事。'
const BLUEPRINT_STREAM = [
  '『故事简介』',
  '深夜电台主播沈岚收到来自未来的留言，留言准确描述第二天即将发生的事故。她试图改变结果，却发现留言越来越接近自己的过去。',
  '『主要人物』',
  '沈岚（32/女）：深夜电台主播｜克制敏锐｜习惯用专业判断掩饰恐惧｜阻止未来留言中的事故｜十年前旧电台事故与她父亲有关｜从试图控制每一个结果到接受承担选择',
  '周启（38/男）：录音设备维修师｜沉默细致｜对旧设备有执念｜修复旧收音机并弄清信号来源｜隐瞒了关键录音｜从旁观者到主动承担',
  '小满（22/女）：深夜听众｜直率执着｜相信声音能带路｜寻找失踪的哥哥｜第一条留言的接收者却假装不知情｜从盲目相信到学会质疑',
  '『人物关系』',
  '沈岚 ↔ 周启：旧识 · 互相隐瞒',
  '沈岚 ↔ 小满：主播与听众 · 信任',
  '周启 ↔ 小满：修理旧收音机结识',
  '『重要道具档案』',
  '旧磁带｜1盒｜沈岚｜在手｜沈岚父亲留下的录音带，里面有一段与未来留言相同的声音',
  '红色收音机｜1台｜周启｜修复中｜只有在凌晨 00:13 才能接收到特定频段',
  '留言纸｜1叠｜沈岚｜空白｜每次留言出现后都会留在录音室，背面逐渐出现新的时间线记录',
  '『写法基线』',
  '都市悬疑，现实质感，少旁白，多对白与声音线索',
  '保留悬疑感，弱化直接血腥描述，结尾保留可继续推进的悬念',
  '世界观：旧电台信号只在凌晨 00:13 出现，持续 13 秒，每条留言都会带来新的时间线分支。',
  '故事主线：12 集围绕未来留言、旧电台事故与时间线分支推进。',
  '第一幕（1–4 集）：发现留言与异常信号，建立规则。',
  '第二幕（5–8 集）：调查十年前的旧电台事故，人物关系反转。',
  '第三幕（9–12 集）：面对由自己造成的未来，做出取舍。',
  '结尾悬念：最后一条留言来自未来的沈岚自己，并预告了下一次事故。'
].join('\n')

export async function mockCreatorApi(context, apiPrefix = '/dev-api') {
  const user = { userId: 7, userType: '01', nickname: '接口测试用户', authorCapability: true }
  const categories = [{ categoryId: 1, categoryName: '都市悬疑' }, { categoryId: 2, categoryName: '都市情感' }]
  const works = [
    { workId: 1, title: '归途列车', status: 'revision', genreId: 1, summary: '列车上的悬疑故事。' },
    { workId: 2, title: '长夜将明', status: 'reviewing', genreId: 1, summary: '天亮前找出真相。' },
    { workId: 3, title: '第三次告白', status: 'draft', genreId: 2, summary: '电台主播的故事。' },
    { workId: 4, title: '山河故人', status: 'published', genreId: 2, summary: '父女的重逢。' }
  ]
  works.forEach(work => { work.price = 0 })
  const chapters = Object.fromEntries(works.map(work => [work.workId, ['雨夜的乘客', '无人认领的行李', '十二号车厢'].map((chapterTitle, index) => ({ chapterId: work.workId * 10 + index, chapterNo: index + 1, chapterTitle, content: '雨夜，列车驶入站台。', status: index === 2 ? 'revision' : '0', wordCount: 10 }))]))
  // v3 工作台读台账与分镜目录：按作品存真实形状，PUT/POST 可回写，便于浏览器验证。
  const ledger = {}
  const storyboards = Object.fromEntries(works.map(work => [work.workId, []]))
  const messages = [{ messageId: 1, title: '审核通知', read: false, summary: '请查看作品审核结果', createdAt: '2026-10-14 09:00' }]
  const profile = { nickname: user.nickname, avatar: '', bio: '', phoneMasked: '152****5578' }
  const feedback = [], records = [], chat = []
  const skills = [{ id: 1, skillName: '悬疑烧脑导演', fileName: '悬疑烧脑导演.skill.md' }, { id: 2, skillName: '甜宠爆款导演', fileName: '甜宠爆款导演.skill.md' }]
  const calls = []
  const chapterResponse = chapter => ({ ...chapter, content: documentText(chapter.content), formattedContent: isFormattedDocument(chapter.content) ? chapter.content : null })
  await context.route('**' + apiPrefix + '/**', async route => {
    const request = route.request(), method = request.method(), path = new URL(request.url()).pathname.slice(apiPrefix.length)
    const upload = path.endsWith('/upload') || path.endsWith('/avatar')
    const body = ['GET', 'HEAD'].includes(method) || upload ? null : request.postDataJSON()
    calls.push({ path, method, body })
    let result = { code: 200, data: null }
    const workMatch = path.match(/^\/api\/v1\/users\/me\/works\/(\d+)(.*)$/)
    if (path.endsWith('/captchaImage')) result = { code: 200, captchaEnabled: false }
    else if (path.endsWith('/auth/login')) result = { code: 200, token: 'browser-test-only', user }
    else if (path.endsWith('/auth/getInfo')) result = { code: 200, user: { ...user, ...profile }, roles: [], permissions: [] }
    else if (path.endsWith('/auth/logout')) result.data = null
    else if (path.endsWith('/categories')) result.data = categories
    else if (path === '/api/v1/welfare/points/balance') result.data = { balance: 80 }
    else if (upload) result.data = { url: '/profile/upload/test-script.txt', materialRef: 'test-material' }
    else if (path === '/api/v1/content/works' && method === 'POST') {
      const workId = Math.max(...works.map(work => work.workId), 0) + 1
      works.push({ workId, title: body.title, genreId: body.categoryId, summary: body.description, status: 'draft' }); chapters[workId] = []; result.data = { workId }
    } else if (path === '/api/v1/users/me/works') result.data = works
    else if (workMatch) {
      const workId = Number(workMatch[1]), action = workMatch[2], work = works.find(item => item.workId === workId), list = chapters[workId]
      if (!work) result = { code: 404, message: '作品不存在' }
      else if (!action) { if (method === 'PUT') Object.assign(work, body); else result.data = { work, chapters: list.map(chapterResponse), latestReview: null } }
      else if (action === '/review-records') result.data = []
      else if (action === '/submit') work.status = 'reviewing'
      else if (action === '/chapters' && method === 'POST') {
        const chapterNo = Number(body.chapterNo) || list.length + 1
        const chapter = { ...body, chapterId: Math.max(...list.map(item => item.chapterId), workId * 100) + 1, chapterNo, wordCount: wordCount(body.content), status: '0' }
        list.push(chapter); list.sort((a, b) => a.chapterNo - b.chapterNo); result.data = chapterResponse(chapter)
      } else if (action.startsWith('/chapters/')) {
        const index = list.findIndex(item => item.chapterId === Number(action.split('/').at(-1)))
        if (method === 'DELETE') list.splice(index, 1)
        else Object.assign(list[index], body, typeof body.content === 'string' ? { wordCount: wordCount(body.content) } : {})
      } else result = { code: 404, message: '未配置测试接口：' + path }
      if (work) { work.episodeCount = list.length; work.wordCount = list.reduce((sum, chapter) => sum + chapter.wordCount, 0) }
    } else if (/\/content\/works\/\d+\/storyboards$/.test(path)) {
      const workId = Number(path.match(/works\/(\d+)/)[1])
      if (method === 'POST') {
        const board = { storyboardId: (storyboards[workId].length + 1) + workId * 100, workId, chapterId: 0, chapterNo: 0, chapterTitle: body.title, title: body.title, content: body.content, source: body.source, status: 'ai_reviewing', readable: true, updateTime: '2026-10-14 09:00' }
        const index = storyboards[workId].findIndex(item => item.chapterTitle === body.title)
        if (index >= 0) storyboards[workId].splice(index, 1, { ...storyboards[workId][index], content: body.content })
        else storyboards[workId].push(board)
        result.data = index >= 0 ? storyboards[workId][index] : board
      } else result.data = storyboards[workId]
    } else if (/\/content\/works\/\d+\/(volumes|timeline)$/.test(path)) result.data = []
    else if (/\/content\/works\/\d+\/ledger$/.test(path)) {
      const workId = Number(path.match(/works\/(\d+)/)[1])
      if (method === 'PUT') ledger[workId] = { workId, ...body }
      result.data = ledger[workId] || null
    } else if (/\/content\/works\/\d+\/gen-jobs\/latest$/.test(path)) result.data = null
    else if (path.endsWith('/versions')) result.data = []
    else if (path.endsWith('/ai/skills')) result.data = skills
    else if (path.includes('/content/ai/') && path.endsWith('/stream')) {
      const type = path.split('/').at(-2)
      const wantsBlueprint = String(body?.style || '').includes('作品资料') || String(body?.prompt || '').includes('作品资料')
      const delta = type === 'storyboard' ? '镜1｜景别：特写' : type === 'outline' ? (wantsBlueprint ? BLUEPRINT_STREAM : OUTLINE_STREAM) : '第一集 · 深夜频率' + String.fromCharCode(10) + '雨夜的咖啡馆，一次迟来的重逢。'
      // 与后端 sys_ai_write_record 同形：writeType / inputPrompt / outputContent。
      // AI 创作页的章节正文记录打 [AI创作] 标记，删除时会被后端级联清掉。
      records.push(type === 'outline'
        ? { recordId: records.length + 1, writeType: 'outline', title: '深夜频率', inputPrompt: ['灵感：' + (body?.inspiration || ''), '类型：' + (body?.genre || ''), '风格：' + (body?.style || '')].join(String.fromCharCode(10)), outputContent: delta, tokensUsed: 1, createdAt: '2026-10-14 09:00' }
        : { recordId: records.length + 1, writeType: 'write', title: '深夜频率', inputPrompt: body?.prompt || '', outputContent: (String(body?.prompt || '').startsWith(AI_CREATE_MARK) ? AI_CREATE_MARK + ' ' : '') + delta, tokensUsed: 1, createdAt: '2026-10-14 09:00' })
      return route.fulfill({ contentType: 'text/event-stream', body: 'data: ' + JSON.stringify({ delta }) + String.fromCharCode(10, 10) + 'data: {"done":true,"quotaUsed":1}' + String.fromCharCode(10, 10) })
    }
    else if (path.includes('/content/ai/')) {
      const type = path.split('/').at(-1)
      if (type === 'write-records' && method === 'DELETE') {
        const ids = new Set((body?.recordIds || []).map(Number))
        const before = records.length
        records.splice(0, records.length, ...records.filter(record => !ids.has(Number(record.recordId))))
        result.data = before - records.length
      } else if (type === 'write-records') result.data = records
      else result.data = { content: '第一集 · 深夜频率' + String.fromCharCode(10) + '雨夜的咖啡馆，一次迟来的重逢。', quotaUsed: 1 }
    } else if (path.endsWith('/messages/unread-count')) result.data = { total: messages.filter(message => !message.read).length }
    else if (path.endsWith('/messages/read-all')) messages.forEach(message => { message.read = true })
    else if (path === '/api/v1/messages') result.data = { list: messages }
    else if (path.endsWith('/chat/sessions')) result.data = { sessionId: 91 }
    else if (path.endsWith('/chat/sessions/91/messages')) { if (method === 'POST') { const message = { messageId: chat.length + 1, content: body.content, senderType: 'USER', createdAt: '2026-10-14 09:00' }; chat.push(message); result.data = message } else result.data = chat }
    else if (path.endsWith('/real-name')) result.data = { status: 'NOT_SUBMITTED' }
    else if (path.endsWith('/profile')) { if (method === 'PUT') Object.assign(profile, body); result.data = profile }
    else if (path === '/api/v1/feedback') { if (method === 'POST') feedback.push({ ...body, feedbackId: feedback.length + 1, status: 'PENDING' }); result.data = feedback }
    else if (path === '/api/v1/trade/finance/income/overview') result.data = { totalIncome: 64000, pendingSettleAmount: 48000, availableAmount: 64000, withdrawnAmount: 0, frozenAmount: 0, pendingSettleCount: 1 }
    else if (path.startsWith('/api/v1/trade/finance/income/stats')) result.data = { period: 'month', periodStart: '2026-10-01', periodEnd: '2026-10-27', incomeAmount: 64000, withdrawAmount: 0 }
    else if (path.match(/^\/api\/v1\/trade\/finance\/income\/detail\/\d+$/)) result.data = { billId: 21, billNo: 'BILL21', billType: 'income', incomeSource: '订单收入', amount: 4800000, balanceAfter: 6400000, remark: '结算入账', createdAt: '2026-10-12 10:00:00', orderNo: 'SO20261012001', workTitle: '归途列车', totalAmount: 6000000, platformFee: 1200000, splitRate: 0.2, sellerAmount: 4800000 }
    else if (path.startsWith('/api/v1/trade/finance/income/detail')) result.data = { total: 1, rows: [{ billId: 21, billNo: 'BILL21', billType: 'income', incomeSource: '订单收入', amount: 4800000, orderNo: 'SO20261012001', workTitle: '归途列车', createdAt: '2026-10-12 10:00:00' }] }
    else if (path.match(/^\/api\/v1\/trade\/finance\/income\/settle\/\d+\/confirm$/) && method === 'POST') result.data = { settleId: 2, status: 'confirmed', sellerAmount: 4800000 }
    else if (path.match(/^\/api\/v1\/trade\/finance\/income\/settle\/\d+\/dispute$/) && method === 'POST') result.data = { settleId: 2, status: 'disputed', disputeReason: body?.reason }
    else if (path.match(/^\/api\/v1\/trade\/finance\/income\/settle\/\d+$/)) result.data = { settleId: 2, settleNo: 'JS20261012002', orderNo: 'SO20261012001', workTitle: '归途列车', totalAmount: 6000000, platformFee: 1200000, splitRate: 0.2, sellerAmount: 4800000, status: 'pending', createdAt: '2026-10-12 10:00:00' }
    else if (path.startsWith('/api/v1/trade/finance/income/settle/list')) result.data = { total: 1, rows: [{ settleId: 2, settleNo: 'JS20261012002', orderNo: 'SO20261012001', workTitle: '归途列车', totalAmount: 6000000, platformFee: 1200000, splitRate: 0.2, sellerAmount: 4800000, status: 'pending', createdAt: '2026-10-12 10:00:00' }] }
    else if (path === '/api/v1/trade/finance/withdraw/apply' && method === 'POST') result.data = { withdrawId: 9, withdrawNo: 'WD9', status: 'pending' }
    else if (path.startsWith('/api/v1/trade/finance/withdraw/list')) result.data = { total: 0, rows: [] }
    else result = { code: 404, message: '未配置测试接口：' + path }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(result) })
  })
  return { user, works, chapters, ledger, storyboards, calls, records }
}
