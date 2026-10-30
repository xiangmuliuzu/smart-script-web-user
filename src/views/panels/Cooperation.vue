<template>
  <PortalLayer v-model="visible" :title="panelTitle" wide>
    <div class="panel-content">
      <!-- ═══ 询盘 Tab ═══ -->
      <template v-if="tab === 'inquiry'">
        <div class="filter-bar">
          <select v-model="inquiryRole" class="filter-select" @change="loadInquiries"><option value="seller">我收到的</option><option value="buyer">我发起的</option></select>
          <select v-model="inquiryStatus" class="filter-select" @change="inquiryPageNum = 1; loadInquiries()"><option value="">全部状态</option><option value="pending">待处理</option><option value="quoted">议价中</option><option value="deal">已达成</option><option value="rejected">已拒绝</option><option value="closed">已关闭</option></select>
          <input v-model="inquiryKeyword" class="filter-input" placeholder="搜索作品/询盘号" @keyup.enter="inquiryPageNum = 1; loadInquiries()">
        </div>
        <LoadState :pending="inquiryPending" :error="inquiryError" :retry="loadInquiries" />
        <div v-if="!inquiryPending && !inquiryError && !inquiries.length" class="load-state"><p>暂无询盘记录</p></div>
        <div v-for="inq in inquiries" :key="inq.inquiryId" class="order-card">
          <div class="order-cover">
            <img v-if="inq.workCover" :src="coverUrl(inq.workCover)" alt="" />
            <span v-else class="glyph">{{ (inq.workTitle || '询').slice(0, 1) }}</span>
          </div>
          <div class="order-body">
            <div class="order-top">
              <b>《{{ inq.workTitle || '作品#' + inq.workId }}》</b>
              <span class="status-tag" :class="'tag-' + inq.status">{{ inquiryStatusLabel(inq.status) }}</span>
            </div>
            <p class="order-meta">询盘号：{{ inq.inquiryNo || '#' + inq.inquiryId }} · {{ counterpartyOf(inq).role }}：{{ counterpartyOf(inq).name }}</p>
            <p class="order-meta">预算：{{ moneyFromFen(inq.budget) }} · 授权：{{ licenseLabel(inq.licenseType) }}</p>
            <p v-if="inq.intendedUse" class="order-meta">用途：{{ inq.intendedUse }}</p>
            <p v-if="inq.message" class="order-meta">留言：{{ inq.message }}</p>
            <div class="order-foot">
              <span class="cost">创建于 {{ dateText(inq.createdAt) }}</span>
              <div class="foot-actions">
                <button v-if="isSellerOf(inq) && inq.status === 'pending'" class="btn sm" @click="doAcceptInquiry(inq)">接受</button>
                <button v-if="isSellerOf(inq) && inq.status === 'pending'" class="btn sm ghost" @click="doRejectInquiry(inq)">拒绝</button>
                <button v-if="['quoted','deal'].includes(inq.status)" class="btn sm quiet" @click="openSessionForInquiry(inq)">{{ inq._hasSession ? '进入交易会话' : '创建交易会话' }}</button>
              </div>
            </div>
          </div>
        </div>
        <div v-if="inquiryTotal > PAGE_SIZE" class="pagination-bar"><button class="btn sm ghost" :disabled="inquiryPageNum <= 1" @click="inquiryPageNum--; loadInquiries()">上一页</button><span class="cost">第 {{ inquiryPageNum }} 页 / 共 {{ Math.ceil(inquiryTotal / PAGE_SIZE) }} 页</span><button class="btn sm ghost" :disabled="inquiryPageNum * PAGE_SIZE >= inquiryTotal" @click="inquiryPageNum++; loadInquiries()">下一页</button></div>
      </template>

      <!-- ═══ 会话 Tab ═══ -->
      <template v-else-if="tab === 'session'">
        <div class="session-layout">
          <div class="session-list-panel">
            <div class="session-search"><input v-model="sessionKeyword" class="filter-input session-search-input" placeholder="搜索会话/对方/消息"></div>
            <LoadState :pending="sessionListPending" :error="sessionListError" :retry="loadTradeSessions" />
            <div v-if="!sessionListPending && !sessions.length" class="load-state"><p>暂无交易会话</p></div>
            <div v-else-if="!sessionListPending && sessions.length && !filteredSessions.length" class="load-state"><p>无匹配会话</p></div>
            <div v-for="s in filteredSessions" :key="s.sessionId" class="session-item" :class="{ active: chatSessionId === s.sessionId }" @click="selectSession(s)">
              <div class="session-top"><b>《{{ s.businessName || '会话#' + s.sessionId }}》</b><span v-if="s.unread" class="unread-badge">{{ s.unread }}</span></div>
              <p class="session-peer cost">{{ s.peerName || '用户' + s.peerId }}</p>
              <p v-if="s.lastMessage" class="session-last">{{ s.lastMessage }}</p>
            </div>
          </div>
          <div class="session-chat-panel">
            <template v-if="chatSessionId">
              <div class="negotiation-bar">
                <span class="neg-amount">{{ negAmountYuan }}</span>
                <span class="neg-source cost">{{ negSource }}</span>
                <button v-if="canAcceptLatest" class="btn sm" @click="doAcceptLatestQuote">接受</button>
                <span v-else-if="latestQuote && ['pending','pending_seller'].includes(latestQuote.status)" class="cost" style="font-size:12px">等待对方确认</span>
              </div>
              <div class="chat-messages" ref="chatBodyEl">
                <LoadState :pending="chatLoading" />
                <p v-if="chatError" class="cost">加载失败：{{ chatError }}</p>
                <template v-if="!chatLoading">
                  <p v-if="!chatMessages.length" class="cost" style="text-align:center">暂无消息，开始沟通吧</p>
                  <div v-for="msg in chatMessages" :key="msg.msgId || msg.messageId">
                    <div v-if="isQuoteSysMsg(msg)" class="quote-sys-msg" :class="'qsys-' + parseQuoteSysMsg(msg.content).tag">{{ parseQuoteSysMsg(msg.content).label }}</div>
                    <div v-else class="chat-bubble" :class="Number(msg.senderId) === userId ? 'me' : 'them'">
                      <div v-if="Number(msg.senderId) !== userId" class="bubble-name cost">{{ msg.senderName || '用户' + msg.senderId }}</div>
                      <div class="bubble-body">{{ msg.content }}<time>{{ dateText(msg.createTime || msg.createdAt).slice(5) }}</time></div>
                    </div>
                  </div>
                </template>
              </div>
              <TradeTemplatePanel v-model:visible="templateVisible" :session-id="chatSessionId" :inquiry-id="activeSessionInquiryId" :is-buyer="isCurrentBuyer" :license-type="currentLicenseType" @sent="onTemplateSent" />
              <div class="chat-input-row">
                <button type="button" class="template-toggle-btn" :class="{ active: templateVisible }" @click="templateVisible = !templateVisible">{{ templateVisible ? '收起定型文' : '定型文' }}</button>
                <textarea v-model="chatInput" class="chat-textarea" rows="1" placeholder="输入消息，Enter 发送 / Shift+Enter 换行" @keydown.enter.exact.prevent="sendFreeText"></textarea>
                <button type="button" class="send-btn" :disabled="chatSending || !chatInput.trim()" @click="sendFreeText">发送</button>
              </div>
            </template>
            <div v-else class="load-state"><p>选择一个会话开始沟通</p></div>
          </div>
        </div>
      </template>

      <!-- ═══ 合同 Tab ═══ -->
      <template v-else-if="tab === 'contract'">
        <ContractPanel ref="contractPanelRef" :user-id="userId" />
      </template>

      <!-- ═══ 订单 Tab ═══ -->
      <template v-else-if="tab === 'order'">
        <div class="filter-bar">
          <select v-model="orderRole" class="filter-select" @change="orderPageNum = 1; loadOrders()"><option value="seller">我卖出的</option><option value="buyer">我买入的</option></select>
          <select v-model="orderStatus" class="filter-select" @change="orderPageNum = 1; loadOrders()"><option value="">全部状态</option><option value="confirmed">待签署</option><option value="paying">付款中</option><option value="delivering">交割中</option><option value="completed">已完成</option></select>
          <input v-model="orderKeyword" class="filter-input" placeholder="搜索订单号/作品/对方" @keyup.enter="orderPageNum = 1; loadOrders()">
        </div>
        <LoadState :pending="orderPending" :error="orderError" :retry="loadOrders" />
        <div v-if="!orderPending && !orderError && !orders.length" class="load-state"><p>暂无订单</p></div>
        <div v-for="o in orders" :key="o.orderId" class="order-card">
          <div class="order-cover">
            <img v-if="o.workCover" :src="coverUrl(o.workCover)" alt="" />
            <span v-else class="glyph">{{ (o.workTitle || '订').slice(0, 1) }}</span>
          </div>
          <div class="order-body">
            <div class="order-top">
              <b>《{{ o.workTitle || '订单#' + o.orderId }}》</b>
              <span class="status-tag" :class="'tag-' + o.status">{{ orderStatusLabel(o.status) }}</span>
            </div>
            <p class="order-meta">订单号：{{ o.orderNo || '#' + o.orderId }} · 买方：{{ o.buyerName || o.buyerId }} · 卖方：{{ o.sellerName || o.sellerId }}</p>
            <p class="order-meta">金额：{{ moneyFromFen(o.amount) }} · 授权：{{ licenseLabel(o.licenseType) }}</p>
            <p v-if="o.cancelReason" class="order-meta">取消原因：{{ o.cancelReason }}</p>
            <div class="order-progress">
              <div v-for="(step, i) in orderProgressSteps" :key="step.key" class="progress-step" :class="{ active: getProgressIndex(o) >= i, current: getProgressIndex(o) === i, terminated: getTerminal(o) && getProgressIndex(o) < i }">
                <span class="progress-dot"></span>
                <span class="progress-label">{{ step.label }}</span>
              </div>
            </div>
            <div v-if="getTerminal(o)" class="terminal-bar">{{ getTerminalLabel(o) }}</div>
            <div class="order-foot">
              <span class="cost">创建于 {{ dateText(o.createdAt) }}</span>
              <div class="foot-actions">
                <button v-if="!isTerminalOrder(o)" class="btn sm quiet" @click="openOrderContract(o)">查看合同</button>
                <button v-if="o.status === 'confirmed'" class="btn sm ghost" @click="doCancelOrder(o)">取消订单</button>
                <button v-if="isBuyerOfOrder(o) && o.status === 'paying'" class="btn sm" @click="doPayOrder(o)">付款</button>
                <button v-if="isSellerOf(o) && o.status === 'delivering' && !isDeliveryUploaded(o)" class="btn sm" @click="goOrderDelivery(o)">去交割</button>
                <button v-if="isSellerOf(o) && o.status === 'delivering' && isDeliveryUploaded(o)" class="btn quiet sm" @click="goOrderDelivery(o)">等待买家收货</button>
                <button v-if="isBuyerOfOrder(o) && o.status === 'delivering' && isDeliveryUploaded(o)" class="btn sm" @click="goOrderDelivery(o)">去确认收货</button>
                <button v-if="isBuyerOfOrder(o) && o.status === 'delivering' && !isDeliveryUploaded(o)" class="btn quiet sm" @click="goOrderDelivery(o)">查看交割</button>
              </div>
            </div>
          </div>
        </div>
        <div v-if="orderTotal > PAGE_SIZE" class="pagination-bar"><button class="btn sm ghost" :disabled="orderPageNum <= 1" @click="orderPageNum--; loadOrders()">上一页</button><span class="cost">第 {{ orderPageNum }} 页 / 共 {{ Math.ceil(orderTotal / PAGE_SIZE) }} 页</span><button class="btn sm ghost" :disabled="orderPageNum * PAGE_SIZE >= orderTotal" @click="orderPageNum++; loadOrders()">下一页</button></div>
      </template>
    </div>
    <PortalLayer v-model="orderContractVisible" :title="orderContractTitle" modal big>
      <div v-loading="orderContractLoading" class="preview-wrap">
        <iframe v-if="orderContractContent" class="contract-frame" :srcdoc="orderContractContent" sandbox="allow-same-origin"></iframe>
        <div v-else class="load-state"><p>{{ orderContractLoading ? '合同加载中…' : '合同内容不可用' }}</p></div>
      </div>
      <div class="contract-modal-foot">
        <a v-if="(orderContract?.status === 'completed' || orderContract?.status === 'archived') && orderContract?.signedPdfUrl" class="btn sm ghost" :href="mediaUrl(orderContract.signedPdfUrl)" target="_blank" rel="noopener">下载 PDF</a>
        <button v-if="canSignOrderContract" class="btn sm" @click="orderSignVisible = true">签署合同</button>
      </div>
    </PortalLayer>
    <ContractSignDialog v-model="orderSignVisible" :contract="orderContract" :user-id="userId" @signed="reloadOrderContract" />
    <el-dialog v-model="paymentVisible" title="支付宝沙箱支付" width="360px" append-to-body>
      <div style="text-align:center">
        <p>测试支付，不会产生真实资金。请使用支付宝沙箱钱包扫码。</p>
        <img v-if="paymentQr" :src="paymentQr" alt="支付宝沙箱支付二维码" width="220" height="220" />
        <p v-if="paymentMessage">{{ paymentMessage }}</p>
        <button type="button" class="btn" :disabled="paymentChecking" @click="checkSandboxPayment">{{ paymentChecking ? '查询中…' : '查询支付结果' }}</button>
      </div>
    </el-dialog>
  </PortalLayer>
</template>
<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import QRCode from 'qrcode'
import PortalLayer from '../../components/PortalLayer.vue'
import LoadState from '../../components/LoadState.vue'
import ContractPanel from '../../components/trade/ContractPanel.vue'
import ContractSignDialog from '../../components/trade/ContractSignDialog.vue'
import TradeTemplatePanel from '../../components/trade/TradeTemplatePanel.vue'
import { usePortal } from '../../utils/portal.js'
import { avatarUrl, contractHtml } from '../../utils/avatarUrl.js'
import { dateText, money, asList } from '../../utils/creator.js'
import { orderStatusLabel } from '../../utils/orderTodo.js'

const props = defineProps({ modelValue: Boolean, initialTab: String, orderSearch: { type: String, default: '' } })
const emit = defineEmits(['update:modelValue'])
const { api, user, handleError, openDeliveryByOrder } = usePortal()
const visible = computed({ get: () => props.modelValue, set: v => emit('update:modelValue', v) })
const tab = ref(props.initialTab || 'inquiry')
const panelTitle = computed(() => ({ inquiry: '询盘', session: '会话', order: '订单', contract: '合同' })[tab.value] || '询盘')
const contractPanelRef = ref(null)
const userId = computed(() => Number(user.value?.userId))

// ── 工具函数 ──
const moneyFromFen = fen => money(Number(fen || 0) / 100)
const licenseLabel = t => ({ exclusive: '独家授权', non_exclusive: '非独家授权', adaptation: '改编授权' })[t] || t || '未指定'
const inquiryStatusLabel = s => ({ pending: '待处理', quoted: '议价中', deal: '已达成', rejected: '已拒绝', closed: '已关闭' })[s] || s
const quoteStatusLabel = s => ({ pending: '待买方响应', pending_seller: '待卖方响应', accepted: '已接受', rejected: '已拒绝', expired: '已过期' })[s] || s
const isSellerOf = r => Number(r?.sellerId) === userId.value
const isBuyerOfOrder = o => Number(o?.buyerId) === userId.value
const isTerminalOrder = o => ['cancelled', 'refunded'].includes(o?.status)
const mediaUrl = raw => avatarUrl(raw)
// 封面历史数据绝对与相对混存，统一经 avatarUrl 归一到当前 API 前缀
const coverUrl = raw => avatarUrl(raw) || raw
const counterpartyOf = r => {
  const isBuyer = Number(r?.buyerId) === userId.value
  const name = isBuyer ? (r.sellerName || '用户' + r.sellerId) : (r.buyerName || '用户' + r.buyerId)
  return { role: isBuyer ? '卖方' : '买方', name }
}

// ── 询盘 ──
const inquiries = ref([])
const inquiryPending = ref(false)
const inquiryError = ref('')
const inquiryRole = ref('seller')
const inquiryStatus = ref('')
const inquiryKeyword = ref('')
const inquiryPageNum = ref(1)
const inquiryTotal = ref(0)
const PAGE_SIZE = 10

async function loadInquiries() {
  inquiryPending.value = true; inquiryError.value = ''
  try {
    const params = { pageNum: inquiryPageNum.value, pageSize: PAGE_SIZE }
    if (inquiryRole.value) params.role = inquiryRole.value
    if (inquiryStatus.value) params.status = inquiryStatus.value
    if (inquiryKeyword.value.trim()) params.keyword = inquiryKeyword.value.trim()
    const result = await api.value.listInquiries(params)
    inquiries.value = asList(result)
    inquiryTotal.value = result?.total || 0
    syncSessionFlags()
  } catch (e) { inquiryError.value = e.message; await handleError(e) }
  finally { inquiryPending.value = false }
}

async function doAcceptInquiry(inq) {
  try { await ElMessageBox.confirm('接受询盘后进入议价阶段，确定吗？', '确认接受', { type: 'warning' }); await api.value.acceptInquiry(inq.inquiryId); ElMessage.success('已接受询盘'); inq.status = 'quoted' } catch (e) { if (e !== 'cancel') await handleError(e) }
}
async function doRejectInquiry(inq) {
  try { await ElMessageBox.confirm('拒绝后询盘将关闭，确定吗？', '确认拒绝', { type: 'warning' }); await api.value.rejectInquiry(inq.inquiryId); ElMessage.success('已拒绝询盘'); inq.status = 'rejected' } catch (e) { if (e !== 'cancel') await handleError(e) }
}

async function openSessionForInquiry(inq) {
  try {
    if (!inq._hasSession) {
      const session = await api.value.createTradeChat(inq.inquiryId)
      inq._hasSession = true
      inq._sessionId = session.sessionId
      syncSessionFlags()
    }
    tab.value = 'session'
    await loadTradeSessions()
    const s = sessions.value.find(s => s.inquiryId === inq.inquiryId)
    if (s) await selectSession(s)
  } catch (e) { await handleError(e) }
}



// ── 会话列表 ──
const sessions = ref([])
const sessionListPending = ref(false)
const sessionListError = ref('')
const activeSessionInquiryId = ref(null)
// 会话列表为全量返回（无分页），搜索走客户端过滤：按会话名/对方昵称/最后一条消息模糊匹配
const sessionKeyword = ref('')
const filteredSessions = computed(() => {
  const kw = sessionKeyword.value.trim().toLowerCase()
  if (!kw) return sessions.value
  return sessions.value.filter(s =>
    String(s.businessName || '').toLowerCase().includes(kw)
    || String(s.peerName || '').toLowerCase().includes(kw)
    || String(s.lastMessage || '').toLowerCase().includes(kw))
})

async function loadTradeSessions() {
  sessionListPending.value = true; sessionListError.value = ''
  try {
    const result = await api.value.listTradeSessions()
    sessions.value = asList(result)
    syncSessionFlags()
  } catch (e) { sessionListError.value = e.message }
  finally { sessionListPending.value = false }
}

function syncSessionFlags() {
  const sessionInquiryIds = new Set(sessions.value.map(s => s.inquiryId).filter(Boolean))
  for (const inq of inquiries.value) {
    if (sessionInquiryIds.has(inq.inquiryId)) inq._hasSession = true
  }
}

async function selectSession(s) {
  stopChatPoll()
  chatSessionId.value = s.sessionId
  activeSessionInquiryId.value = s.inquiryId || null
  sessionInquiry.value = null
  if (s.inquiryId) {
    try { sessionInquiry.value = await api.value.getInquiry(s.inquiryId) } catch { sessionInquiry.value = null }
  }
  await loadChatMessages()
  await loadLatestQuote()
  await nextTick()
  scrollChatBottom()
  startChatPoll()
}

// ── 交易会话聊天（报价议价在聊天中完成，对齐 APP 模式） ──
const chatSessionId = ref(null)
const chatSessionDetail = ref(null)
const chatMessages = ref([])
const chatLoading = ref(false)
const chatError = ref('')
const chatBodyEl = ref(null)
const latestQuote = ref(null)
// 当前会话关联的询盘：用于定型文角色过滤、授权类型与金额兜底（会话列表不携带询盘明细）
const sessionInquiry = ref(null)
const templateVisible = ref(true)
const chatInput = ref('')
const chatSending = ref(false)
let chatPollTimer = null
let lastMsgId = 0

const negAmountYuan = computed(() => {
  if (latestQuote.value) return moneyFromFen(latestQuote.value.price)
  const inq = sessionInquiry.value || inquiries.value.find(i => i.inquiryId === activeSessionInquiryId.value)
  return moneyFromFen(inq?.budget || 0)
})
const isCurrentBuyer = computed(() => Number(sessionInquiry.value?.buyerId) === userId.value)
const currentLicenseType = computed(() => sessionInquiry.value?.licenseType || latestQuote.value?.licenseType || 'exclusive')
const negSource = computed(() => {
  if (!latestQuote.value) return '预算金额'
  return latestQuote.value.quoterRole === 'seller' ? '卖方报价' : '买方议价'
})
const latestQuoteFromOther = computed(() => {
  if (!latestQuote.value) return false
  const isMine = Number(latestQuote.value.quoterId) === userId.value
  return !isMine && (latestQuote.value.status === 'pending' || latestQuote.value.status === 'pending_seller')
})
const canAcceptLatest = computed(() => latestQuoteFromOther.value)

function isQuoteSysMsg(msg) {
  if (!msg.isSystem && msg.msgType !== 'SYSTEM') return false
  const c = msg.content || ''
  return c.startsWith('[报价]') || c.startsWith('[议价]') || c.startsWith('[接受]') || c.startsWith('[拒绝]')
}
function parseQuoteSysMsg(content) {
  const bracketEnd = content.indexOf(']')
  if (bracketEnd < 0) return { tag: 'default', label: content }
  const tag = content.substring(1, bracketEnd)
  const detail = content.substring(bracketEnd + 1).trim()
  return { tag, label: `[${tag}] ${detail}` }
}

async function loadSessionDetail() {
  if (!chatSessionId.value) return
  try { chatSessionDetail.value = await api.value.getSessionDetail(chatSessionId.value) } catch { chatSessionDetail.value = null }
}
async function loadChatMessages() {
  if (!chatSessionId.value) return
  chatLoading.value = true; chatError.value = ''
  try {
    const msgs = await api.value.listChat(chatSessionId.value)
    chatMessages.value = msgs
    lastMsgId = msgs.length ? Math.max(...msgs.map(m => m.messageId || m.msgId || 0)) : 0
  } catch (e) { chatError.value = e.message }
  finally { chatLoading.value = false }
}
/** 增量拉取新消息（仅追加，不替换旧消息，避免闪烁） */
async function pollNewMessages() {
  if (!chatSessionId.value) return
  try {
    const msgs = await api.value.listChat(chatSessionId.value)
    const newMsgs = msgs.filter(m => (m.messageId || m.msgId || 0) > lastMsgId)
    if (newMsgs.length) {
      chatMessages.value.push(...newMsgs)
      lastMsgId = Math.max(...msgs.map(m => m.messageId || m.msgId || 0))
      // 仅当用户已在底部时才自动滚动，不打断用户翻看历史
      const el = chatBodyEl.value
      const atBottom = el ? (el.scrollHeight - el.scrollTop - el.clientHeight < 60) : true
      if (atBottom) await nextTick(), scrollChatBottom()
    }
  } catch { /* 轮询失败静默忽略 */ }
}
async function loadLatestQuote() {
  const inqId = activeSessionInquiryId.value
  if (!inqId) return
  try { latestQuote.value = await api.value.getLatestQuote(inqId) } catch { latestQuote.value = null }
}
function scrollChatBottom() {
  const el = chatBodyEl.value
  if (el) el.scrollTop = el.scrollHeight
}
function startChatPoll() {
  stopChatPoll()
  chatPollTimer = setInterval(() => { if (chatSessionId.value && tab.value === 'session') pollNewMessages() }, 5000)
}
function stopChatPoll() {
  if (chatPollTimer) { clearInterval(chatPollTimer); chatPollTimer = null }
}

/** 定型文已发出：追加消息并刷新最新报价。 */
async function onTemplateSent(msg) {
  if (msg) {
    chatMessages.value.push(msg)
    const id = msg.messageId || msg.msgId
    if (id > lastMsgId) lastMsgId = id
  }
  await loadLatestQuote()
  await nextTick()
  scrollChatBottom()
}

/** 自由打字发送：复用定型文发出后的追加与滚动逻辑。 */
async function sendFreeText() {
  const content = chatInput.value.trim()
  if (!content || chatSending.value || !chatSessionId.value) return
  chatSending.value = true
  try {
    const msg = await api.value.sendChat(chatSessionId.value, content)
    if (!msg) throw new Error('发送响应不完整，请刷新会话确认')
    chatInput.value = ''
    await onTemplateSent(msg)
  } catch (e) {
    ElMessage.error('发送失败：' + (e?.message || e))
  } finally {
    chatSending.value = false
  }
}

async function doAcceptLatestQuote() {
  if (!latestQuote.value) return
  try {
    await ElMessageBox.confirm('接受报价后将直接生成授权订单，确定吗？', '确认接受报价', { type: 'warning' })
    const r = await api.value.acceptQuote(latestQuote.value.quoteId)
    ElMessage.success('已接受报价' + (r?.orderId ? '，订单已生成' : ''))
    await loadLatestQuote()
    await loadChatMessages()
    await loadInquiries()
  } catch (e) { if (e !== 'cancel') await handleError(e) }
}

// ── 订单 ──
const orders = ref([])
const orderPending = ref(false)
const orderError = ref('')
const orderRole = ref('seller')
const orderStatus = ref('')
const orderKeyword = ref('')
const orderPageNum = ref(1)
const orderTotal = ref(0)

/** 交割单是否已提交材料（待确认 / 已完成），用于交割中订单按钮文案。 */
const isDeliveryUploaded = o => ['pending_confirm', 'completed'].includes(o?.deliveryStatus)

async function attachDeliveryStatus(rows) {
  const delivering = rows.filter(o => o?.status === 'delivering' && o?.orderId)
  if (!delivering.length) return rows
  await Promise.all(delivering.map(async o => {
    try {
      const delivery = await api.value.getDeliveryByOrder(o.orderId)
      o.deliveryStatus = delivery?.status || ''
    } catch {
      o.deliveryStatus = ''
    }
  }))
  return rows
}

async function loadOrders() {
  orderPending.value = true; orderError.value = ''
  try {
    const params = { role: orderRole.value, pageNum: orderPageNum.value, pageSize: PAGE_SIZE }
    if (orderStatus.value) params.status = orderStatus.value
    if (orderKeyword.value.trim()) params.keyword = orderKeyword.value.trim()
    const result = await api.value.listOrders(params)
    const rows = asList(result)
    await attachDeliveryStatus(rows)
    orders.value = rows
    orderTotal.value = result?.total || 0
  } catch (e) { orderError.value = e.message; await handleError(e) }
  finally { orderPending.value = false }
}

const paymentVisible = ref(false)
const paymentQr = ref('')
const paymentOrder = ref(null)
const paymentChecking = ref(false)
const paymentMessage = ref('')

/** 支付宝沙箱：取二维码扫码支付，再由服务端向支付宝查单确认（与 App / 企业端一致）。 */
async function doPayOrder(o) {
  try {
    const result = await api.value.payOrder(o.orderId)
    if (!result?.sandbox || !result.qrCode) throw new Error('获取沙箱支付二维码失败')
    paymentQr.value = await QRCode.toDataURL(result.qrCode, { width: 220, margin: 2 })
    paymentOrder.value = o
    paymentMessage.value = ''
    paymentVisible.value = true
  } catch (e) { await handleError(e) }
}

async function checkSandboxPayment() {
  if (paymentChecking.value || !paymentOrder.value) return
  paymentChecking.value = true
  try {
    const result = await api.value.confirmSandboxPayment(paymentOrder.value.orderId)
    if (result?.paid) { paymentVisible.value = false; ElMessage.success('沙箱支付已确认，订单进入交割'); await loadOrders() }
    else paymentMessage.value = '尚未查询到支付成功，请完成支付后重试'
  } catch (e) { paymentMessage.value = e.message || '查询失败，请稍后重试' }
  finally { paymentChecking.value = false }
}

/** 交割中：与 App 一致，进入交割详情（卖方上传 / 买方确认），不再直接调 completeOrder。 */
async function goOrderDelivery(o) {
  if (!o?.orderId || typeof openDeliveryByOrder !== 'function') {
    ElMessage.warning('暂时无法打开交割详情')
    return
  }
  try {
    await openDeliveryByOrder(o.orderId)
  } catch (e) {
    await handleError(e)
  }
}

// 取消订单：仅合同双方签署完成前（confirmed）可取消，买卖双方任一方均可发起
async function doCancelOrder(o) {
  let reason = ''
  try {
    const res = await ElMessageBox.prompt('确定取消该订单吗？合同双方签署完成后将不可取消。可填写取消原因（选填）。', '取消订单', { type: 'warning', inputPlaceholder: '取消原因（选填）', confirmButtonText: '确定取消', cancelButtonText: '再想想', inputValidator: v => (v && v.length > 200) ? '原因不超过200字' : true })
    reason = (res?.value || '').trim()
  } catch { return } // 用户关闭/取消
  try { await api.value.cancelOrder(o.orderId, reason); ElMessage.success('订单已取消'); await loadOrders() } catch (e) { await handleError(e) }
}

// ── 订单关联合同：预览 / 签署 / PDF ──
const orderContractVisible = ref(false)
const orderContractLoading = ref(false)
const orderContract = ref(null)
const orderContractContent = ref('')
const orderContractTitle = ref('合同预览')
const orderSignVisible = ref(false)
const canSignOrderContract = computed(() => {
  const c = orderContract.value
  if (!c || !['pending', 'partial_signed'].includes(c.status)) return false
  const mine = isBuyerOfOrder(c) ? c.buyerSignStatus : c.sellerSignStatus
  return Number(mine) !== 1
})

async function openOrderContract(o) {
  orderContractTitle.value = `合同预览 · ${o.workTitle || '订单#' + o.orderId}`
  orderContract.value = null
  orderContractContent.value = ''
  orderContractVisible.value = true
  await fetchOrderContract(o.orderId)
}

async function fetchOrderContract(orderId) {
  orderContractLoading.value = true
  try {
    const detail = await api.value.getContractByOrder(orderId)
    orderContract.value = detail
    orderContractContent.value = contractHtml(detail?.content)
  } catch (e) {
    await handleError(e)
  } finally {
    orderContractLoading.value = false
  }
}

/** 签署完成后刷新合同正文与订单列表。 */
async function reloadOrderContract() {
  if (orderContract.value?.orderId) await fetchOrderContract(orderContract.value.orderId)
  await loadOrders()
}

const orderProgressSteps = [{ key: 'confirmed', label: '待签署' }, { key: 'paying', label: '付款中' }, { key: 'delivering', label: '交割中' }, { key: 'completed', label: '已完成' }]
function getProgressIndex(o) {
  if (!o?.status) return -1
  return orderProgressSteps.findIndex(st => st.key === o.status)
}
function getTerminal(o) { return ['cancelled', 'refunded'].includes(o?.status) }
function getTerminalLabel(o) {
  if (o.status === 'cancelled') return '订单已取消' + (o.cancelReason ? '：' + o.cancelReason : '')
  if (o.status === 'refunded') return '订单已退款'
  return ''
}

// ── Tab 切换自动加载 ──
let inquirySearchTimer = null
watch(inquiryKeyword, () => { clearTimeout(inquirySearchTimer); inquirySearchTimer = setTimeout(() => { inquiryPageNum.value = 1; loadInquiries() }, 300) })
let orderSearchTimer = null
watch(orderKeyword, () => { clearTimeout(orderSearchTimer); orderSearchTimer = setTimeout(() => { orderPageNum.value = 1; loadOrders() }, 300) })
watch(tab, v => {
  // 定型文是会话唯一发送入口：进入会话默认展开，离开会话收起
  templateVisible.value = v === 'session'
  if (v === 'inquiry') loadInquiries()
  else if (v === 'session') loadTradeSessions()
  else if (v === 'contract') nextTick(() => contractPanelRef.value?.refresh())
  else if (v === 'order') loadOrders()
})
watch(() => props.initialTab, v => { if (v) tab.value = v })
function applyOrderSearch(value) {
  if (value) { orderRole.value = 'seller'; orderStatus.value = ''; orderPageNum.value = 1 }
  orderKeyword.value = value
}
watch(() => props.orderSearch, applyOrderSearch)
watch(() => props.modelValue, v => { if (v) { tab.value = props.initialTab || 'inquiry'; applyOrderSearch(props.orderSearch) } })
onMounted(() => {
  applyOrderSearch(props.orderSearch)
  if (tab.value === 'session') { templateVisible.value = true; loadTradeSessions() }
  else if (tab.value === 'order') loadOrders()
  else if (tab.value === 'inquiry') loadInquiries()
})
onUnmounted(() => { stopChatPoll() })
</script>
<style scoped>
/* ── 询盘手风琴 ── */
.inquiry-card { border: 1px solid #ebeef5; border-radius: 6px; margin-bottom: 8px; overflow: hidden; transition: box-shadow .15s }
.inquiry-card:hover { box-shadow: 0 1px 4px rgba(0,0,0,.06) }
.inquiry-card.expanded { border-color: #409eff }
.inquiry-header { display: flex; align-items: center; gap: 8px; padding: 10px 12px; cursor: pointer; transition: background .12s }
.inquiry-header:hover { background: #f5f7fa }
.expand-icon { font-size: 12px; color: #909399; width: 14px; flex-shrink: 0 }
.inq-title { display: flex; align-items: center; gap: 6px; flex-shrink: 0 }
.inq-summary { flex: 1; font-size: 13px; color: #909399; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.inquiry-body { padding: 12px 16px; border-top: 1px solid #ebeef5; background: #fafbfc }

/* ── 会话列表 ── */
.session-layout { display: flex; gap: 0; flex: 1; min-height: 0; height: auto; border: 1px solid #ebeef5; border-radius: 6px; overflow: hidden }
.session-list-panel { width: 220px; flex-shrink: 0; border-right: 1px solid #ebeef5; overflow-y: auto; background: #fafafa }
.session-search { position: sticky; top: 0; z-index: 1; padding: 8px; background: #fafafa; border-bottom: 1px solid #ebeef5 }
.session-search-input { width: 100%; box-sizing: border-box }
.session-item { padding: 10px 12px; cursor: pointer; border-bottom: 1px solid #f0f0f0; transition: background .12s }
.session-item:hover { background: #f0f2f5 }
.session-item.active { background: #ecf5ff; border-left: 3px solid #409eff }
.session-top { display: flex; align-items: center; justify-content: space-between; gap: 4px }
.session-top b { font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.unread-badge { background: #f56c6c; color: #fff; font-size: 10px; padding: 1px 5px; border-radius: 8px; min-width: 16px; text-align: center }
.session-peer { font-size: 12px; margin: 2px 0 }
.session-last { font-size: 12px; color: #909399; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin: 2px 0 0 }
.session-chat-panel { flex: 1; display: flex; flex-direction: column; padding: 0; overflow: hidden }
.session-chat-panel .chat-messages { flex: 1; margin: 0; border: none; border-radius: 0; height: auto }
.session-chat-panel .chat-input-row { margin: 0; padding: 8px; border-top: 1px solid #ebeef5 }

/* ── 原有样式 ── */
.msg { cursor: pointer; transition: background .15s }
.msg:hover { background: #f5f7fa }
.msg.active { background: #ecf5ff; border-left: 3px solid #409eff }

/* ── 订单平铺卡片：左封面右信息，常态展示全部内容 ── */
.order-card { display: flex; gap: 12px; border: 1px solid #ebeef5; border-radius: 6px; padding: 12px; margin-bottom: 10px; background: #fff; transition: box-shadow .15s }
.order-card:hover { box-shadow: 0 1px 4px rgba(0,0,0,.06) }
.order-cover { width: 108px; height: 146px; flex-shrink: 0; align-self: flex-start; border-radius: 4px; overflow: hidden; background: linear-gradient(160deg, #E9E5DA 0%, #DAD5C7 100%); display: grid; place-items: center; border: 1px solid #ebeef5 }
.order-cover img { width: 100%; height: 100%; object-fit: cover }
.order-cover .glyph { font-size: 32px; color: rgba(27,26,24,.18); font-weight: 600 }
.order-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px }
.order-top { display: flex; align-items: center; gap: 8px; flex-wrap: wrap }
.order-top b { font-size: 14px }
.order-meta { font-size: 12.5px; color: #606266; margin: 0 }
.order-body .order-progress { margin: 8px 0 0 }
.order-foot { display: flex; align-items: center; justify-content: space-between; margin-top: auto; padding-top: 6px; gap: 8px }
.order-foot .cost { font-size: 12px; color: #909399 }
.foot-actions { display: flex; gap: 8px; align-items: center }
.foot-actions a { text-decoration: none }

/* ── 订单合同预览弹窗 ── */
.preview-wrap { min-height: 200px }
.contract-frame { width: 100%; height: min(64vh, 680px); border: 0; display: block; background: #fff }
.contract-modal-foot { display: flex; justify-content: flex-end; gap: 8px; padding-top: 10px }
.contract-modal-foot a { text-decoration: none }

.order-progress { display: flex; align-items: center; gap: 0; margin: 16px 0 8px; padding: 0 4px }
.progress-step { display: flex; flex-direction: column; align-items: center; flex: 1; position: relative }
.progress-step:not(:last-child)::after { content: ''; position: absolute; top: 7px; left: 50%; width: 100%; height: 2px; background: #e4e7ed; z-index: 0 }
.progress-step.active:not(:last-child)::after { background: #409eff }
.progress-dot { width: 14px; height: 14px; border-radius: 50%; background: #e4e7ed; border: 2px solid #fff; z-index: 1; transition: background .2s }
.progress-step.active .progress-dot { background: #409eff }
.progress-step.current .progress-dot { background: #409eff; box-shadow: 0 0 0 3px rgba(64,158,255,.2) }
.progress-label { font-size: 12px; color: #909399; margin-top: 4px }
.progress-step.active .progress-label { color: #409eff; font-weight: 500 }

.filter-bar { display: flex; gap: 8px; align-items: center; margin-bottom: 12px; flex-wrap: wrap }
.filter-select { padding: 4px 8px; border: 1px solid #dcdfe6; border-radius: 4px; font-size: 13px; background: #fff }
.filter-input { padding: 4px 8px; border: 1px solid #dcdfe6; border-radius: 4px; font-size: 13px; background: #fff; width: 140px }
.pagination-bar { display: flex; gap: 8px; align-items: center; justify-content: center; padding: 8px 0; margin-top: 4px }

.detail-info { margin-bottom: 16px }
.detail-info p { margin: 4px 0; font-size: 14px; line-height: 1.6 }
.action-bar { display: flex; gap: 8px; margin: 12px 0; flex-wrap: wrap }
.section-title { font-size: 14px; font-weight: 600; margin: 16px 0 8px; color: #303133 }

.terminal-bar { background: #fef0f0; color: #f56c6c; border-radius: 4px; padding: 8px 12px; font-size: 13px; margin-top: 8px }
.progress-step.terminated .progress-dot { background: #e4e7ed }
.progress-step.terminated .progress-label { color: #c0c4cc; text-decoration: line-through }
.negotiation-bar { display: flex; align-items: center; gap: 10px; padding: 8px 12px; background: #f0f9eb; border-radius: 6px; margin: 8px 0 }
.neg-amount { font-size: 18px; font-weight: 700; color: #303133 }
.neg-source { flex: 1 }
.chat-messages { overflow-y: auto; border: 1px solid #ebeef5; border-radius: 6px; padding: 12px; margin: 8px 0; background: #fafafa; flex: 1 }
.chat-bubble { display: flex; flex-direction: column; margin-bottom: 10px; max-width: 75% }
.chat-bubble.me { margin-left: auto; align-items: flex-end }
.chat-bubble.them { margin-right: auto; align-items: flex-start }
.bubble-name { font-size: 11px; color: #909399; margin-bottom: 2px }
.bubble-body { display: inline-block; padding: 8px 12px; border-radius: 10px; font-size: 13px; line-height: 1.5; word-break: break-word }
.chat-bubble.me .bubble-body { background: #409eff; color: #fff; border-bottom-right-radius: 2px }
.chat-bubble.them .bubble-body { background: #fff; color: #303133; border: 1px solid #ebeef5; border-bottom-left-radius: 2px }
.bubble-body time { display: block; font-size: 10px; opacity: .5; margin-top: 4px }
.chat-bubble.me .bubble-body time { color: rgba(255,255,255,.7) }
.quote-sys-msg { text-align: center; padding: 6px 16px; margin: 6px auto; border-radius: 10px; font-size: 12px; max-width: 80%; line-height: 1.5 }
.qsys-报价 { background: #ecf5ff; color: #409eff }
.qsys-议价 { background: #fdf6ec; color: #e6a23c }
.qsys-接受 { background: #f0f9eb; color: #67c23a }
.qsys-拒绝 { background: #fef0f0; color: #f56c6c }
.quote-input-card { display: flex; align-items: center; justify-content: center; gap: 4px; padding: 8px 12px; background: #fff; border: 1px solid #ebeef5; border-radius: 6px; margin: 8px 0 }
.yen-sign { font-size: 16px; font-weight: 600; color: #606266 }
.amount-input { border: none; text-align: center; font-size: 16px; font-weight: 600; width: 120px; outline: none; background: transparent }
.amount-input::placeholder { color: #c0c4cc }

/* ── 全局细滚动条 ── */
::-webkit-scrollbar { width: 4px; height: 4px }
::-webkit-scrollbar-track { background: transparent }
::-webkit-scrollbar-thumb { background: #d0d0d0; border-radius: 2px }
::-webkit-scrollbar-thumb:hover { background: #b0b0b0 }
.chat-input-row { display: flex; gap: 8px; align-items: center; margin-top: 4px }
/* 左下角圆角"定型文"开关按钮 + 自由文本输入 + 圆角发送按钮 */
.template-toggle-btn { flex: none; align-self: flex-end; min-width: 84px; height: 38px; padding: 0 16px; border: 1px solid #dcdfe6; border-radius: 999px; background: #fff; color: #606266; font-size: 13px; cursor: pointer; transition: border-color .15s, color .15s, background .15s; user-select: none }
.template-toggle-btn:hover { border-color: #c0c4cc }
.template-toggle-btn.active { border-color: #409eff; color: #409eff; background: rgba(64, 158, 255, .08) }
.chat-textarea { flex: 1; min-height: 38px; max-height: 120px; padding: 8px 12px; border: 1px solid #dcdfe6; border-radius: 8px; font-size: 13px; font-family: inherit; line-height: 1.5; resize: none; outline: none; transition: border-color .15s, box-shadow .15s }
.chat-textarea:focus { border-color: #409eff; box-shadow: 0 0 0 2px rgba(64, 158, 255, .12) }
.send-btn { flex: none; align-self: flex-end; height: 38px; padding: 0 18px; border: none; border-radius: 999px; background: #409eff; color: #fff; font-size: 13px; cursor: pointer; transition: background .15s, opacity .15s }
.send-btn:hover { background: #66b1ff }
.send-btn:disabled { background: #a0cfff; cursor: not-allowed }
.status-tag { display: inline-block; padding: 1px 8px; border-radius: 10px; font-size: 12px; font-weight: 500 }
.tag-pending { background: #fdf6ec; color: #e6a23c }
.tag-pending_seller { background: #ecf5ff; color: #409eff }
.tag-accepted, .tag-completed { background: #f0f9eb; color: #67c23a }
.tag-rejected, .tag-cancelled { background: #fef0f0; color: #f56c6c }
.tag-closed { background: #f4f4f5; color: #909399 }
.tag-confirmed, .tag-deal { background: #ecf5ff; color: #409eff }
.tag-escrow_pending { background: #fdf6ec; color: #e6a23c }
.tag-quoted { background: #fdf6ec; color: #e6a23c }
.tag-delivering { background: #ecf5ff; color: #409eff }
.tag-refunded { background: #fef0f0; color: #f56c6c }
.tag-expired { background: #f4f4f5; color: #909399 }
</style>

<style>
/* ── 会话 Tab 撑满抽屉剩余高度（仅含会话布局的抽屉生效，不影响其他面板） ── */
.el-drawer:has(.session-layout) .el-drawer__body { display: flex; flex-direction: column; overflow: hidden }
.el-drawer:has(.session-layout) .drawer-tools { flex: none }
.el-drawer:has(.session-layout) .dtabs { flex: none }
.el-drawer:has(.session-layout) .panel-content { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden }
</style>
