import { request, getToken } from '../auth.js'
import { asList } from '../utils/creator.js'

// 沿用若依 request，认证响应保持顶层结构，业务接口在这里读取 data。
const data = async (path, options) => (await request(path, options)).data
const workPath = id => '/api/v1/users/me/works/' + encodeURIComponent(id)
export const listWorks = async () => asList(await data('/api/v1/users/me/works'))
export const getWork = async id => {
  const detail = await data(workPath(id))
  if (detail?.chapters) detail.chapters = detail.chapters.map(chapter => ({ ...chapter, isFree: String(chapter.isFree ?? '0'), content: chapter.formattedContent || chapter.content || '' }))
  return detail
}
export const listReviews = async id => asList(await data(workPath(id) + '/review-records'))
export const listVersions = async id => asList(await data(`/api/v1/content/works/${encodeURIComponent(id)}/versions`))
export const listCategories = async () => asList(await data('/api/v1/content/categories'))
export const createWork = form => data('/api/v1/content/works', { method: 'POST', body: { title: form.title.trim(), categoryId: Number(form.genreId), description: form.summary, scriptUrl: form.scriptUrl, scriptName: form.scriptName, scriptSize: form.scriptSize } })
export const updateWork = (id, form) => data(workPath(id), { method: 'PUT', body: { title: form.title.trim(), genreId: Number(form.genreId), summary: form.summary, cover: form.cover, price: form.price, tradeType: form.tradeType } })
export const sendWorkDeletionCode = id => data(`/api/v1/content/works/${encodeURIComponent(id)}/delete-code`, { method: 'POST' })
export const deleteWork = (id, code) => data(`/api/v1/content/works/${encodeURIComponent(id)}`, { method: 'DELETE', body: { code } })
export const submitWork = id => data(workPath(id) + '/submit', { method: 'POST' })
export const saveChapter = (id, chapter) => data(workPath(id) + '/chapters' + (chapter.chapterId ? '/' + encodeURIComponent(chapter.chapterId) : ''), { method: chapter.chapterId ? 'PUT' : 'POST', body: { chapterTitle: chapter.chapterTitle.trim(), content: chapter.content, isFree: chapter.isFree } })
export const publishChapter = chapterId => data('/api/v1/content/chapters/' + encodeURIComponent(chapterId), { method: 'PUT', body: { status: '0' } })
export const deleteChapter = (id, chapterId) => data(workPath(id) + '/chapters/' + encodeURIComponent(chapterId), { method: 'DELETE' })
export async function upload(file, purpose = 'script') {
  const body = new FormData()
  // 后端剧本上传白名单包含 txt/docx，Markdown 保留文本内容并按 txt 上传。
  const uploaded = purpose === 'script' && /\.md$/i.test(file.name) ? new File([file], file.name.replace(/\.md$/i, '.txt'), { type: 'text/plain' }) : file
  body.append('file', uploaded)
  const path = purpose === 'avatar' ? '/api/v1/users/me/avatar' : '/api/v1/content/upload'
  if (purpose === 'script' || purpose === 'cover') body.append('type', purpose)
  // 印章图/审核材料与 App 一致：走 content/upload，type=material。
  if (purpose === 'seal') body.append('type', 'material')
  // 版权申请材料与 App 一致：type=copyright_material。
  if (purpose === 'copyright') body.append('type', 'copyright_material')
  return data(path, { method: 'POST', body })
}

// ──── 版权申请 / 电子证书（与 App 共用 /api/v1/content/copyright，同用户数据同步） ────
const copyrightBase = '/api/v1/content/copyright'
const qs = params => {
  const entries = Object.entries(params || {}).filter(([, v]) => v != null && v !== '')
  return entries.length ? '?' + new URLSearchParams(entries).toString() : ''
}
export const listCopyrightApplications = (params = {}) =>
  data(copyrightBase + '/application/list' + qs({ pageNum: 1, pageSize: 50, ...params }))
export const getCopyrightApplication = id =>
  data(copyrightBase + '/application/' + encodeURIComponent(id))
export const submitCopyrightApplication = form =>
  data(copyrightBase + '/application/apply', { method: 'POST', body: form })
export const resubmitCopyrightApplication = form =>
  data(copyrightBase + '/application/resubmit', { method: 'POST', body: form })
export const deleteCopyrightApplication = id =>
  data(copyrightBase + '/application/' + encodeURIComponent(id), { method: 'DELETE' })
export const listCopyrightCerts = (params = {}) =>
  data(copyrightBase + '/cert/list' + qs({ pageNum: 1, pageSize: 50, ...params }))
export const getCopyrightCert = id =>
  data(copyrightBase + '/cert/' + encodeURIComponent(id))
export const downloadCopyrightCert = id =>
  data(copyrightBase + '/cert/' + encodeURIComponent(id) + '/download')
export const listCopyrightCenters = async () => asList(await data(copyrightBase + '/config/active'))

// ──── 版权资产（创作者侧 /api/v1/content/copyright/assets，字段与 Admin 对齐，仅本人已发布作品） ────
const assetsBase = copyrightBase + '/assets'
export const listCopyrightAssets = (params = {}) =>
  data(assetsBase + qs({ pageNum: 1, pageSize: 20, ...params }))
export const getCopyrightAsset = workId =>
  data(assetsBase + '/' + encodeURIComponent(workId))
export const updateCopyrightAssetStatus = (workId, status) =>
  data(assetsBase + '/' + encodeURIComponent(workId) + '/status', { method: 'PUT', body: { status } })
export const listCopyrightAuthorizationHistory = (workId, params = {}) =>
  data(assetsBase + '/' + encodeURIComponent(workId) + '/authorization-history' + qs({ pageNum: 1, pageSize: 10, ...params }))

// ──── 版权印章（与 App 共用 /api/v1/content/copyright-seals，同用户数据同步） ────
const sealPath = id => '/api/v1/content/copyright-seals/' + encodeURIComponent(id)
export const listSeals = async () => asList(await data('/api/v1/content/copyright-seals'))
export const getSeal = id => data(sealPath(id))
export const createSeal = form => data('/api/v1/content/copyright-seals', { method: 'POST', body: { sealName: form.sealName, sealImageUrl: form.sealImageUrl, materialUrls: form.materialUrls || '' } })
export const updateSeal = (id, form) => data(sealPath(id), { method: 'PUT', body: form })
export const disableSeal = id => data(sealPath(id) + '/disable', { method: 'PUT' })
export const deleteSeal = id => data(sealPath(id), { method: 'DELETE' })
// AI 生成耗时可能超过默认 30s（大纲尤甚，需等待模型完整输出），单独放长到 120s。
export const generate = (type, form) => data('/api/v1/content/ai/' + type, { method: 'POST', body: form, timeout: 120000 })

// ──── AI 流式生成（SSE，逐块回调 delta）────
// 协议与后端 AppAiController 一致：data:{"delta":"..."} 逐块下发，
// data:{"done":true,...} 结束；event:error + data:{"code","message"} 失败。
// 流成功结束才由服务端落记录、扣次数；失败不落库不扣次。
const STREAM_BASE = import.meta.env?.VITE_APP_BASE_API || '/dev-api'
export async function generateStream(type, form, onDelta) {
  const token = getToken()
  const headers = { Accept: 'text/event-stream' }
  if (form !== undefined) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = 'Bearer ' + token
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 120000)
  try {
    const response = await fetch(STREAM_BASE + '/api/v1/content/ai/' + type + '/stream', {
      method: 'POST',
      headers,
      body: JSON.stringify(form),
      signal: controller.signal,
    })
    if (!response.ok || !response.body) {
      const result = await response.json().catch(() => null)
      const error = new Error(result?.msg || result?.message || `生成失败（HTTP ${response.status}）`)
      error.status = response.status
      error.code = result?.code
      throw error
    }
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = '', delta = '', done = null
    const consume = block => {
      const event = parseSseBlock(block)
      if (event.delta) { delta += event.delta; onDelta(event.delta) }
      if (event.done) done = event.done
    }
    try {
      while (!done) {
        const { value, done: finished } = await reader.read()
        buffer += finished ? decoder.decode() : decoder.decode(value, { stream: true })
        let boundary
        while ((boundary = /\r?\n\r?\n/.exec(buffer))) {
          consume(buffer.slice(0, boundary.index))
          buffer = buffer.slice(boundary.index + boundary[0].length)
          if (done) break
        }
        if (finished) {
          if (!done && buffer.trim()) consume(buffer)
          break
        }
      }
    } catch (failure) {
      if (!delta.trim() || failure.code != null || failure.status != null) throw failure
      throw new Error('生成中断，已保留收到的内容，请重试', { cause: failure })
    } finally {
      await reader.cancel().catch(() => {})
      reader.releaseLock()
    }
    if (!done) throw new Error('生成中断，已保留收到的内容，请重试')
    if (!delta.trim()) throw new Error('本次未返回生成内容，请重试')
    return type === 'outline' ? { outline: delta, ...done } : { content: delta, ...done }
  } finally {
    clearTimeout(timer)
  }
}

/** 解析单个 SSE 事件块，返回 {delta|done|error}；空块返回 {}。 */
function parseSseBlock(block) {
  const dataLines = []
  for (const line of block.split(/\r?\n/)) {
    if (line.startsWith('data:')) dataLines.push(line.slice(5).trim())
  }
  if (!dataLines.length) return {}
  let payload
  try { payload = JSON.parse(dataLines.join('\n')) } catch { return {} }
  if (payload.error || (typeof payload.code === 'number' && payload.message)) {
    const error = new Error(payload.message || (typeof payload.error === 'string' ? payload.error : 'AI 生成失败，请稍后重试'))
    error.code = payload.code
    throw error
  }
  return {
    delta: typeof payload.delta === 'string' ? payload.delta : undefined,
    done: payload.done === true ? payload : undefined,
  }
}
const listWriteRecords = async () => asList(await data('/api/v1/content/ai/write-records'))
const listOutlineRecords = async () => asList(await data('/api/v1/content/ai/outline-records'))
// 生成记录 = 写作/润色 + 大纲记录合并，按时间倒序；write/polish 带输入输出，outline 仅请求元信息。
// 【去次数化】消耗统一为实际 token：写作记录取 tokens_used，大纲记录取 quota_cost（后端已存真实 token）。
export const listAiRecords = async () => {
  const [writes, outlines] = await Promise.all([listWriteRecords(), listOutlineRecords()])
  const items = []
  for (const w of writes) items.push({ recordId: w.recordId, type: w.writeType === 'polish' ? 'polish' : 'write', title: w.title || '独立创作', input: w.inputPrompt || '', output: w.outputContent || '', tokens: w.tokensUsed ?? null, status: w.status, createdAt: w.createdAt })
  for (const o of outlines) items.push({ recordId: o.requestId, type: 'outline', title: 'AI 大纲请求', input: '', output: '', tokens: o.quotaCost ?? null, status: o.status, createdAt: o.createdAt })
  return items.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
}
// 积分余额（AI 创作按 token 消耗直接扣积分，前端展示剩余积分）。
export const getAiQuota = async userId => {
  const result = await data(`/api/v1/welfare/points/balance?userId=${encodeURIComponent(userId)}`)
  return { available: Number(result.balance) || 0 }
}
// 创作者端=卖方门户：交易通知只取 SELLER/BOTH（及无受众的通用通知），买方视角通知（如询盘已被接受）不进此端。
export const listMessages = async () => asList(await data('/api/v1/messages' + qs({ pageSize: 100, portalRole: 'SELLER' }))).map(item => ({ ...item, isRead: item.read, content: item.summary, createTime: item.createdAt }))
export const getMessage = id => data(`/api/v1/messages/${encodeURIComponent(id)}`)
export const unreadCount = async () => (await data('/api/v1/messages/unread-count')).total
export const readMessage = id => data(`/api/v1/messages/${encodeURIComponent(id)}/read`, { method: 'PUT' })
export const readAllMessages = () => data('/api/v1/messages/read-all', { method: 'PUT' })
export const openChat = () => data('/api/v1/users/me/chat/sessions', { method: 'POST', body: { businessType: 'GENERAL', businessName: '平台沟通' } })
export const getSessionDetail = id => data(`/api/v1/users/me/chat/sessions/${encodeURIComponent(id)}`)
// 「与平台沟通」只列与管理员/平台的会话（sessionType=ADMIN，后端含 ADMIN/CHAT），过滤掉与交易对手的个人会话（TRADE）。
export const listSessions = async () => asList(await data('/api/v1/users/me/chat/sessions' + qs({ sessionType: 'ADMIN' })))
export const listTradeSessions = () => data('/api/v1/users/me/chat/sessions?sessionType=TRADE')
export const listChat = async id => asList(await data(`/api/v1/users/me/chat/sessions/${encodeURIComponent(id)}/messages`))
export const sendChat = (id, content) => data(`/api/v1/users/me/chat/sessions/${encodeURIComponent(id)}/messages`, { method: 'POST', body: { msgType: 'TEXT', content } })
export const readChatSession = id => data(`/api/v1/users/me/chat/sessions/${encodeURIComponent(id)}/read`, { method: 'PUT' })
// 聊天未读总数（顶栏「沟通」徽标）；后端不区分会话类型，含交易会话的未读。
export const chatUnreadCount = async () => Number((await data('/api/v1/users/me/chat/unread-count'))?.chatUnread || 0)
export const getProfile = () => data('/api/v1/users/me/profile')
export const saveProfile = form => data('/api/v1/users/me/profile', { method: 'PUT', body: { nickname: form.nickname, avatar: form.avatar, bio: form.bio } })
export const getRealName = () => data('/api/v1/users/me/real-name')
export const submitRealName = (form, resubmit = false) => { const body = new FormData(); for (const key of ['realName', 'idNumber', 'front', 'back']) body.append(key, form[key]); return data('/api/v1/users/me/real-name' + (resubmit ? '/resubmit' : ''), { method: 'POST', body }) }
export const changePassword = form => data('/api/v1/auth/password/change', { method: 'POST', body: form })
export const phoneChange = (step, body) => data('/api/v1/users/me/phone/change/' + step, { method: 'POST', body })
export const listFeedback = async () => asList(await data('/api/v1/feedback'))
export const sendFeedback = form => data('/api/v1/feedback', { method: 'POST', body: { category: form.category, content: form.content, attachmentRef: form.attachmentRef } })

// ──── C 交易域：询盘 / 报价 / 订单（后端金额单位：分） ────
// 询盘
export const listInquiries = (params) => data('/api/v1/trade/inquiry/list' + (params ? '?' + new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ''))).toString() : ''))
export const acceptInquiry = id => data(`/api/v1/trade/inquiry/${encodeURIComponent(id)}/accept`, { method: 'PUT' })
export const rejectInquiry = id => data(`/api/v1/trade/inquiry/${encodeURIComponent(id)}/reject`, { method: 'PUT' })
export const createTradeChat = inquiryId => data('/api/v1/trade/inquiry/chat/sessions?' + new URLSearchParams({ inquiryId }).toString(), { method: 'POST' })
// 报价
export const getLatestQuote = inquiryId => data('/api/v1/trade/quote/latest?' + new URLSearchParams({ inquiryId }).toString())
export const createQuote = form => data('/api/v1/trade/quote', { method: 'POST', body: form })
export const counterOffer = form => data('/api/v1/trade/quote/counter-offer', { method: 'POST', body: form })
export const modifyQuote = (id, form) => data(`/api/v1/trade/quote/${encodeURIComponent(id)}`, { method: 'PUT', body: form })
export const acceptQuote = id => data(`/api/v1/trade/quote/${encodeURIComponent(id)}/accept`, { method: 'PUT' })
// 订单
export const listOrders = params => data('/api/v1/trade/order/list?' + new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ''))).toString())
export const payOrder = id => data(`/api/v1/trade/order/${encodeURIComponent(id)}/pay`, { method: 'POST' })
export const completeOrder = id => data(`/api/v1/trade/order/${encodeURIComponent(id)}/complete`, { method: 'POST' })
// 取消订单（仅 confirmed 可取消）；reason 选填，走 query 参数
export const cancelOrder = (id, reason) => data(`/api/v1/trade/order/${encodeURIComponent(id)}/cancel${reason ? '?' + new URLSearchParams({ reason }).toString() : ''}`, { method: 'POST' })

// ──── C 交易域：合同（签署前置实名认证由后端校验） ────
export const listContracts = params => data('/api/v1/trade/contracts/list?' + new URLSearchParams(Object.fromEntries(Object.entries(params || {}).filter(([, v]) => v != null && v !== ''))).toString())
export const getContractByOrder = orderId => data(`/api/v1/trade/contracts/${encodeURIComponent(orderId)}`)
export const signContract = (contractId, formData) => data(`/api/v1/trade/contracts/${encodeURIComponent(contractId)}/sign`, { method: 'POST', body: formData })
// 合同模板目录（传 contractId 时按该合同生成贴合默认条款）与正文条款编辑（进入签署即锁定）
export const listContractTemplates = async contractId => asList(await data('/api/v1/trade/contracts/templates' + (contractId ? '?' + new URLSearchParams({ contractId }).toString() : '')))
export const updateContractContent = (contractId, payload) => data(`/api/v1/trade/contracts/${encodeURIComponent(contractId)}/content`, { method: 'PUT', body: payload })
// 上传 PDF 替换模板（multipart：file）与从上传件切回平台模板（body：{ templateId }）；均在进入签署后锁定
export const uploadContractSourcePdf = (contractId, file) => {
  const body = new FormData()
  body.append('file', file, file.name || 'contract.pdf')
  return data(`/api/v1/trade/contracts/${encodeURIComponent(contractId)}/source-pdf`, { method: 'POST', body })
}
export const switchContractToTemplate = (contractId, templateId) => data(`/api/v1/trade/contracts/${encodeURIComponent(contractId)}/source-pdf/off`, { method: 'PUT', body: { templateId } })

// ──── 交易会话定型文（与 APP 同源：/users/me/chat/trade-templates） ────
export const listTradeTemplates = async () => asList(await data('/api/v1/users/me/chat/trade-templates'))

// ──── 印章：签约时可选已审核通过的印章 ────
export const listMySeals = async () => asList(await data('/api/v1/content/copyright-seals'))

// ──── 收益 / 结算 / 提现（与 App 共用 /api/v1/trade/finance） ────
const financeBase = '/api/v1/trade/finance'
export const getIncomeOverview = () => data(financeBase + '/income/overview')
export const getIncomeStats = (period = 'month') => data(financeBase + '/income/stats' + qs({ period }))
export const listIncomeDetails = (params = {}) =>
  data(financeBase + '/income/detail' + qs({ pageNum: 1, pageSize: 20, ...params }))
export const getIncomeBillDetail = id =>
  data(financeBase + '/income/detail/' + encodeURIComponent(id))
export const listIncomeSettles = (params = {}) =>
  data(financeBase + '/income/settle/list' + qs({ pageNum: 1, pageSize: 20, ...params }))
export const getIncomeSettle = id =>
  data(financeBase + '/income/settle/' + encodeURIComponent(id))
export const confirmIncomeSettle = id =>
  data(financeBase + '/income/settle/' + encodeURIComponent(id) + '/confirm', { method: 'POST' })
export const disputeIncomeSettle = (id, reason) =>
  data(financeBase + '/income/settle/' + encodeURIComponent(id) + '/dispute', { method: 'POST', body: { reason } })
export const applyWithdraw = form => data(financeBase + '/withdraw/apply', { method: 'POST', body: form })
export const listWithdraws = (params = {}) =>
  data(financeBase + '/withdraw/list' + qs({ pageNum: 1, pageSize: 20, ...params }))

