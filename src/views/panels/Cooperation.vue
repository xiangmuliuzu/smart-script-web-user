<template>
  <PortalLayer v-model="visible" title="我的合作" wide>
    <div class="drawer-tools"><button class="btn quiet sm" @click="contractsVisible = true">我的合同</button></div>
    <PortalTabs v-model="tab" :items="tabs" drawer label="合作类型" />
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
        <div v-for="inq in inquiries" :key="inq.inquiryId" class="inquiry-card" :class="{ expanded: expandedInquiryId === inq.inquiryId }">
          <div class="inquiry-header" @click="toggleInquiry(inq)">
            <span class="expand-icon">{{ expandedInquiryId === inq.inquiryId ? '▾' : '▸' }}</span>
            <span class="inq-title"><b>《{{ inq.workTitle || '作品#' + inq.workId }}》</b><span class="status-tag" :class="'tag-' + inq.status">{{ inquiryStatusLabel(inq.status) }}</span></span>
            <span class="inq-summary">{{ counterpartyOf(inq).role }}：{{ counterpartyOf(inq).name }} · {{ moneyFromFen(inq.budget) }}</span>
          </div>
          <div v-if="expandedInquiryId === inq.inquiryId" class="inquiry-body">
            <div class="detail-info">
              <p>询盘号：{{ inq.inquiryNo || '#' + inq.inquiryId }} · 状态：<span class="status-tag" :class="'tag-' + inq.status">{{ inquiryStatusLabel(inq.status) }}</span></p>
              <p>买方：{{ inq.buyerName || inq.buyerId }} · 卖方：{{ inq.sellerName || inq.sellerId }}</p>
              <p>预算：{{ moneyFromFen(inq.budget) }} · 授权：{{ licenseLabel(inq.licenseType) }}</p>
              <p v-if="inq.intendedUse">用途：{{ inq.intendedUse }}</p>
              <p v-if="inq.message">留言：{{ inq.message }}</p>
              <p class="cost">创建于 {{ dateText(inq.createdAt) }}</p>
            </div>
            <div class="action-bar">
              <button v-if="isSellerOf(inq) && inq.status === 'pending'" class="btn sm" @click="doAcceptInquiry(inq)">接受</button>
              <button v-if="isSellerOf(inq) && inq.status === 'pending'" class="btn sm ghost" @click="doRejectInquiry(inq)">拒绝</button>
              <button v-if="['quoted','deal'].includes(inq.status)" class="btn sm quiet" @click="openSessionForInquiry(inq)">{{ inq._hasSession ? '进入交易会话' : '创建交易会话' }}</button>
            </div>
          </div>
        </div>
        <div v-if="inquiryTotal > PAGE_SIZE" class="pagination-bar"><button class="btn sm ghost" :disabled="inquiryPageNum <= 1" @click="inquiryPageNum--; loadInquiries()">上一页</button><span class="cost">第 {{ inquiryPageNum }} 页 / 共 {{ Math.ceil(inquiryTotal / PAGE_SIZE) }} 页</span><button class="btn sm ghost" :disabled="inquiryPageNum * PAGE_SIZE >= inquiryTotal" @click="inquiryPageNum++; loadInquiries()">下一页</button></div>
      </template>

      <!-- ═══ 会话 Tab ═══ -->
      <template v-else-if="tab === 'session'">
        <div class="session-layout">
          <div class="session-list-panel">
            <LoadState :pending="sessionListPending" :error="sessionListError" :retry="loadTradeSessions" />
            <div v-if="!sessionListPending && !sessions.length" class="load-state"><p>暂无交易会话</p></div>
            <div v-for="s in sessions" :key="s.sessionId" class="session-item" :class="{ active: chatSessionId === s.sessionId }" @click="selectSession(s)">
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
              <div class="quote-input-card">
                <span class="yen-sign">¥</span>
                <input v-model="chatAmount" type="number" min="0" step="1" placeholder="报价金额" class="amount-input">
              </div>
              <form class="chat-input-row" @submit.prevent="doSendChat">
                <input v-model="chatText" maxlength="2000" placeholder="输入消息…" :disabled="chatSending">
                <button class="btn" type="submit" :disabled="chatSending || (!chatText.trim() && !chatAmountChanged)">{{ chatSending ? '发送中…' : '发送' }}</button>
              </form>
            </template>
            <div v-else class="load-state"><p>选择一个会话开始沟通</p></div>
          </div>
        </div>
      </template>

      <!-- ═══ 订单 Tab ═══ -->
      <template v-else-if="tab === 'order'">
        <div class="filter-bar">
          <select v-model="orderRole" class="filter-select" @change="orderPageNum = 1; loadOrders()"><option value="seller">我卖出的</option><option value="buyer">我买入的</option></select>
          <select v-model="orderStatus" class="filter-select" @change="orderPageNum = 1; loadOrders()"><option value="">全部状态</option><option value="confirmed">已确认</option><option value="cancelled">已取消</option><option value="escrow_pending">已托管</option><option value="delivering">交割中</option><option value="completed">已完成</option><option value="refunded">已退款</option></select>
        </div>
        <LoadState :pending="orderPending" :error="orderError" :retry="loadOrders" />
        <div v-if="!orderPending && !orderError && !orders.length" class="load-state"><p>暂无订单</p></div>
        <div v-for="o in orders" :key="o.orderId" class="order-card">
          <div class="order-cover">
            <img v-if="o.workCover" :src="o.workCover" alt="" />
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
              <button v-if="isSellerOf(o) && o.status === 'escrow_pending'" class="btn sm" @click="doDeliverOrder(o)">确认交割</button>
            </div>
          </div>
        </div>
        <div v-if="orderTotal > PAGE_SIZE" class="pagination-bar"><button class="btn sm ghost" :disabled="orderPageNum <= 1" @click="orderPageNum--; loadOrders()">上一页</button><span class="cost">第 {{ orderPageNum }} 页 / 共 {{ Math.ceil(orderTotal / PAGE_SIZE) }} 页</span><button class="btn sm ghost" :disabled="orderPageNum * PAGE_SIZE >= orderTotal" @click="orderPageNum++; loadOrders()">下一页</button></div>
      </template>
    </div>
    <PortalLayer v-model="contractsVisible" title="我的合同" modal><LoadState empty empty-text="合同服务暂未开放，开放后可在这里查看与签署。" /></PortalLayer>
  </PortalLayer>
</template>
<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import PortalLayer from '../../components/PortalLayer.vue'
import PortalTabs from '../../components/PortalTabs.vue'
import LoadState from '../../components/LoadState.vue'
import { usePortal } from '../../utils/portal.js'
import { dateText, money, asList } from '../../utils/creator.js'

const props = defineProps({ modelValue: Boolean, initialTab: String })
const emit = defineEmits(['update:modelValue'])
const { api, user, handleError } = usePortal()
const visible = computed({ get: () => props.modelValue, set: v => emit('update:modelValue', v) })
const tab = ref(props.initialTab || 'inquiry')
const tabs = [{ value: 'inquiry', label: '询盘' }, { value: 'session', label: '会话' }, { value: 'order', label: '订单' }]
const contractsVisible = ref(false)
const userId = computed(() => Number(user.value?.userId))

// ── 工具函数 ──
const moneyFromFen = fen => money(Number(fen || 0) / 100)
const licenseLabel = t => ({ exclusive: '独家授权', non_exclusive: '非独家授权', adaptation: '改编授权' })[t] || t || '未指定'
const inquiryStatusLabel = s => ({ pending: '待处理', quoted: '议价中', deal: '已达成', rejected: '已拒绝', closed: '已关闭' })[s] || s
const quoteStatusLabel = s => ({ pending: '待买方响应', pending_seller: '待卖方响应', accepted: '已接受', rejected: '已拒绝', expired: '已过期' })[s] || s
const orderStatusLabel = s => ({ confirmed: '已确认', cancelled: '已取消', escrow_pending: '已托管', delivering: '交割中', completed: '已完成', refunded: '已退款' })[s] || s
const isSellerOf = r => Number(r?.sellerId) === userId.value
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
const expandedInquiryId = ref(null)

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

function toggleInquiry(inq) {
  expandedInquiryId.value = expandedInquiryId.value === inq.inquiryId ? null : inq.inquiryId
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
const chatText = ref('')
const chatAmount = ref('')
const chatSending = ref(false)
const chatBodyEl = ref(null)
const latestQuote = ref(null)
let chatPollTimer = null
let lastSentAmountFen = null
let lastMsgId = 0

const chatAmountFen = computed(() => {
  const v = parseFloat(chatAmount.value)
  return isNaN(v) || v <= 0 ? null : Math.round(v * 100)
})
const chatAmountChanged = computed(() => chatAmountFen.value !== null && chatAmountFen.value !== lastSentAmountFen)
const negAmountYuan = computed(() => {
  if (latestQuote.value) return moneyFromFen(latestQuote.value.price)
  const inq = inquiries.value.find(i => i.inquiryId === activeSessionInquiryId.value)
  return moneyFromFen(inq?.budget || 0)
})
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

async function doSendChat() {
  if (chatSending.value || !chatSessionId.value) return
  const text = chatText.value.trim()
  const amountFen = chatAmountFen.value
  if (!text && !amountFen) return
  chatSending.value = true
  try {
    if (amountFen !== null && amountFen !== lastSentAmountFen) {
      const inqId = activeSessionInquiryId.value
      const inq = inquiries.value.find(i => i.inquiryId === inqId)
      const defaultLicense = inq?.licenseType || latestQuote.value?.licenseType || 'exclusive'
      if (!latestQuote.value) {
        await api.value.createQuote({ inquiryId: inqId, price: amountFen, licenseType: defaultLicense, description: text || undefined })
      } else {
        await api.value.modifyQuote(latestQuote.value.quoteId, { price: amountFen, licenseType: latestQuote.value.licenseType || defaultLicense, description: text || undefined })
      }
      lastSentAmountFen = amountFen
      await loadLatestQuote()
      // 报价/议价后刷新消息列表（后端会插入 [报价]/[议价] 系统消息）
      await loadChatMessages()
      // 金额变化且有文本时，同时发普通消息
      if (text) {
        const msg = await api.value.sendChat(chatSessionId.value, text)
        if (msg) { chatMessages.value.push(msg); const id = msg.messageId || msg.msgId; if (id > lastMsgId) lastMsgId = id }
      }
    } else if (text) {
      const msg = await api.value.sendChat(chatSessionId.value, text)
      if (msg) { chatMessages.value.push(msg); const id = msg.messageId || msg.msgId; if (id > lastMsgId) lastMsgId = id }
    }
    chatText.value = ''
    await nextTick()
    scrollChatBottom()
  } catch (e) { await handleError(e) }
  finally { chatSending.value = false }
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
const orderPageNum = ref(1)
const orderTotal = ref(0)

async function loadOrders() {
  orderPending.value = true; orderError.value = ''
  try {
    const params = { role: orderRole.value, pageNum: orderPageNum.value, pageSize: PAGE_SIZE }
    if (orderStatus.value) params.status = orderStatus.value
    const result = await api.value.listOrders(params)
    orders.value = asList(result)
    orderTotal.value = result?.total || 0
  } catch (e) { orderError.value = e.message; await handleError(e) }
  finally { orderPending.value = false }
}

async function doDeliverOrder(o) {
  try { await ElMessageBox.confirm('确认交割后买方将进入验收环节，请确保已完成作品授权交付。确定吗？', '确认交割', { type: 'warning' }); await api.value.deliverOrder(o.orderId); ElMessage.success('已确认交割'); o.status = 'delivering'; await loadOrders() } catch (e) { if (e !== 'cancel') await handleError(e) }
}

const orderProgressSteps = [{ key: 'confirmed', label: '已确认' }, { key: 'escrow_pending', label: '已托管' }, { key: 'delivering', label: '交割中' }, { key: 'completed', label: '已完成' }]
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
watch(expandedInquiryId, v => { if (!v) expandedInquiryId.value = null })
watch(tab, v => {
  if (v === 'inquiry') loadInquiries()
  else if (v === 'session') loadTradeSessions()
  else if (v === 'order') loadOrders()
})
watch(() => props.initialTab, v => { if (v) tab.value = v })
onMounted(() => { loadInquiries() })
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
.session-chat-panel .quote-input-card { margin: 0; border-radius: 0; border-left: 0; border-right: 0 }
.session-chat-panel .quote-input-card .yen-sign { font-size: 16px; font-weight: 600; color: #606266 }
.session-chat-panel .quote-input-card .amount-input::-webkit-inner-spin-button,
.session-chat-panel .quote-input-card .amount-input::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0 }
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
.order-foot { display: flex; align-items: center; justify-content: space-between; margin-top: auto; padding-top: 6px }
.order-foot .cost { font-size: 12px; color: #909399 }

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
.chat-input-row { display: flex; gap: 8px; margin-top: 4px }
.chat-input-row input { flex: 1; padding: 8px 12px; border: 1px solid #dcdfe6; border-radius: 4px; font-size: 13px }
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
