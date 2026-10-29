// 仅供 Playwright 拦截真实 API 路径；不会被应用或生产构建导入。
import { documentText, isFormattedDocument } from '../../src/utils/document.js'
import { wordCount } from '../../src/utils/creator.js'

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
  const messages = [{ messageId: 1, title: '审核通知', read: false, summary: '请查看作品审核结果', createdAt: '2026-10-14 09:00' }]
  const profile = { nickname: user.nickname, avatar: '', bio: '', phoneMasked: '152****5578' }
  const feedback = [], records = [], chat = []
  const calls = []
  const chapterResponse = chapter => ({ ...chapter, content: documentText(chapter.content), formattedContent: isFormattedDocument(chapter.content) ? chapter.content : null })
  await context.route('**' + apiPrefix + '/**', async route => {
    const request = route.request(), method = request.method(), path = new URL(request.url()).pathname.slice(apiPrefix.length)
    calls.push({ path, method })
    const upload = path.endsWith('/upload') || path.endsWith('/avatar')
    const body = ['GET', 'HEAD'].includes(method) || upload ? null : request.postDataJSON()
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
        const chapter = { ...body, chapterId: Math.max(...list.map(item => item.chapterId), workId * 100) + 1, chapterNo: list.length + 1, wordCount: wordCount(body.content), status: '0' }
        list.push(chapter); result.data = chapterResponse(chapter)
      } else if (action.startsWith('/chapters/')) {
        const index = list.findIndex(item => item.chapterId === Number(action.split('/').at(-1)))
        if (method === 'DELETE') list.splice(index, 1)
        else Object.assign(list[index], body, { wordCount: wordCount(body.content) })
      } else result = { code: 404, message: '未配置测试接口：' + path }
      if (work) { work.episodeCount = list.length; work.wordCount = list.reduce((sum, chapter) => sum + chapter.wordCount, 0) }
    } else if (path.endsWith('/versions')) result.data = []
    else if (path.includes('/content/ai/') && path.endsWith('/stream')) {
      return route.fulfill({ contentType: 'text/event-stream', body: 'data: ' + JSON.stringify({ delta: '第一集 · 深夜频率\n雨夜的咖啡馆，一次迟来的重逢。' }) + '\n\ndata: {"done":true,"quotaUsed":1}\n\n' })
    }
    else if (path.includes('/content/ai/')) {
      const type = path.split('/').at(-1)
      if (type === 'write-records') result.data = records
      else { result.data = { content: '第一集 · 深夜频率\n雨夜的咖啡馆，一次迟来的重逢。', quotaUsed: 1 }; records.push({ recordId: records.length + 1, type, quotaUsed: 1, createdAt: '2026-10-14 09:00' }) }
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
  return { user, works, chapters, calls }
}
