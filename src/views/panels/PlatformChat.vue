<template>
  <section class="conversation-page platform-service" :data-open="modelValue ? 'true' : 'false'" role="dialog" aria-modal="true" aria-label="平台客服">
    <header class="workspace-page-head">
      <div class="page-head-copy">
        <h1>平台客服</h1>
        <p>向平台客服反馈问题与跟进处理进度（与作者的交易对话请在「我的合作」的会话中进行）</p>
      </div>
      <button class="workspace-page-close" type="button" @click="$emit('update:modelValue', false)">关闭</button>
    </header>
    <div class="workspace-page-body">
      <LoadState v-if="pending || error" :pending="pending" :error="error" :retry="load" />
      <!-- 没有会话时保留企业端的左右两栏结构，只在各自区域内给出空状态，不整体省略模块。 -->
      <div v-else class="conversation-layout">
        <aside class="conversation-sidebar">
          <div class="conversation-filter">
            <button type="button" class="btn light small" :disabled="starting" @click="startChat">{{ starting ? '发起中…' : '发起客服会话' }}</button>
            <button type="button" class="btn light small" :disabled="!unreadCount || marking" @click="markAllRead">全部标记为已读</button>
          </div>
          <div class="conversation-list">
            <button v-for="session in sessions" :key="session.sessionId" type="button" class="conversation-item"
                    :data-chat-session="session.sessionId" :data-active="String(session.sessionId === activeId)" data-hidden="false"
                    @click="select(session.sessionId)">
              <span class="conversation-item-main">
                <b>{{ session.peerName || '平台服务' }}</b>
                <i :style="{ display: session.unread ? 'inline-block' : 'none' }"></i>
              </span>
              <span class="conversation-item-preview">{{ session.businessName || session.lastMessage || '业务沟通' }}</span>
              <time>{{ relativeText(session.lastMessageTime || session.createdAt) }}</time>
            </button>
            <p v-if="!sessions.length" class="rights-note">还没有与平台客服的沟通记录，点击上方「发起客服会话」联系平台。</p>
          </div>
        </aside>

        <section class="conversation-main">
          <header class="conversation-head">
            <b>{{ active?.peerName || '平台客服' }}</b>
            <span>{{ active?.businessName || active?.sessionType || '业务沟通' }}</span>
            <span>{{ active ? (active.status === 2 ? '已结束' : '沟通中') + ' · 最后更新 ' + relativeText(active.lastMessageTime || active.createdAt) : '选择历史会话或直接输入发起新咨询' }}</span>
          </header>
          <div class="conversation-messages" ref="messagesBox">
            <div v-for="message in messages" :key="message.messageId || message.msgId" class="conversation-message" :class="Number(message.senderId) === Number(user?.userId) ? 'me' : 'other'">
              <div class="conversation-bubble">{{ message.content }}<time>{{ relativeText(message.createdAt || message.createTime).replace(/^.*\s/, '') }}</time></div>
            </div>
            <p v-if="!messages.length" class="rights-note">{{ active ? '还没有消息记录。' : sessions.length ? '请从左侧选择一个会话。' : '暂无会话，直接输入消息即可自动发起客服会话。' }}</p>
          </div>
          <form class="conversation-compose" @submit.prevent="send">
            <input v-model="draft" maxlength="500" placeholder="输入消息" :disabled="active?.status === 2">
            <button class="btn" type="submit" :disabled="sending || !draft.trim() || active?.status === 2">{{ sending ? '发送中…' : '发送' }}</button>
          </form>
        </section>
      </div>
    </div>
  </section>
</template>
<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { usePortal } from '../../utils/portal.js'
import LoadState from '../../components/LoadState.vue'
// 平台客服面板：1:1 复刻企业端 ConversationPage 的居中浮层与左右两栏形态。
// 只承载与平台管理员的 ADMIN 会话；与作者的 TRADE 会话在「我的合作 → 会话」。
const props = defineProps({ modelValue: Boolean })
const emit = defineEmits(['update:modelValue'])
const { api, user, handleError, refreshUnread } = usePortal()
const pending = ref(false)
const error = ref('')
const sessions = ref([])
const messages = ref([])
const activeId = ref(null)
const draft = ref('')
const sending = ref(false)
const marking = ref(false)
const starting = ref(false)
const messagesBox = ref(null)
let poll = null

const active = computed(() => sessions.value.find(s => String(s.sessionId) === String(activeId.value)) || null)
const unreadCount = computed(() => sessions.value.reduce((total, s) => total + (s.unread ? 1 : 0), 0))

// 时间口径与企业端 utils/enterprise.js 完全一致：今天 HH:mm / 昨天 HH:mm / MM-DD。
function dateText(value) {
  if (!value) return '—'
  const text = String(value)
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.replace('T', ' ').slice(0, 16)
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return text
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Hong_Kong', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date)
}
const dayText = value => { const text = dateText(value); return text.length > 10 ? text.slice(0, 10) : text }
function relativeText(value) {
  if (!value) return '—'
  const text = dateText(value)
  const time = text.length > 10 ? text.slice(11, 16) : ''
  const today = dayText(new Date().toISOString())
  const day = text.slice(0, 10)
  if (day === today) return time ? '今天 ' + time : '今天'
  const yesterday = dayText(new Date(Date.now() - 86400000).toISOString())
  if (day === yesterday) return time ? '昨天 ' + time : '昨天'
  return day.slice(5)
}

async function load() {
  if (pending.value) return
  pending.value = true
  error.value = ''
  try {
    // 只列与平台管理员的会话；api.listSessions 已按 sessionType=ADMIN 过滤。
    sessions.value = await api.value.listSessions()
    // 对齐企业端：没有显式指定时默认定位第一个会话。
    if (!sessions.value.some(s => String(s.sessionId) === String(activeId.value))) activeId.value = sessions.value[0]?.sessionId || null
    await loadMessages()
  } catch (failure) {
    // 与企业端一致：加载失败在页面内展示错误态，不另弹 toast。
    error.value = failure.message || '加载客服会话失败'
  } finally { pending.value = false }
}
async function loadMessages() {
  if (!activeId.value) { messages.value = []; return }
  try {
    messages.value = await api.value.listChat(activeId.value)
    await nextTick()
    if (messagesBox.value) messagesBox.value.scrollTop = messagesBox.value.scrollHeight
  } catch { messages.value = [] }
}
async function startChat() {
  if (starting.value) return
  starting.value = true
  try {
    const session = await api.value.openChat()
    await load()
    const target = session?.sessionId && sessions.value.find(s => String(s.sessionId) === String(session.sessionId))
    if (target) await select(target.sessionId)
  } catch (failure) { await handleError(failure) } finally { starting.value = false }
}
async function select(id) {
  activeId.value = id
  await loadMessages()
  const session = sessions.value.find(s => String(s.sessionId) === String(id))
  if (session?.unread) {
    try { await api.value.readChatSession(id); session.unread = 0; await refreshUnread() } catch { /* 已读失败不打断阅读 */ }
  }
}
async function send() {
  if (sending.value || !draft.value.trim() || active.value?.status === 2) return
  sending.value = true
  try {
    // 没有活跃会话时，发送前自动发起一个客服会话再投递，输入框常驻可用。
    if (!activeId.value) {
      const session = await api.value.openChat()
      await load()
      const target = session?.sessionId && sessions.value.find(s => String(s.sessionId) === String(session.sessionId))
      activeId.value = target?.sessionId || sessions.value[0]?.sessionId || null
      if (!activeId.value) { ElMessage.error('客服会话创建失败，请稍后重试'); return }
      await loadMessages()
    }
    await api.value.sendChat(activeId.value, draft.value.trim())
    draft.value = ''
    await loadMessages()
  } catch (failure) { await handleError(failure) } finally { sending.value = false }
}
async function markAllRead() {
  if (marking.value) return
  marking.value = true
  try {
    await Promise.all(sessions.value.filter(s => s.unread).map(s => api.value.readChatSession(s.sessionId).catch(() => null)))
    sessions.value.forEach(s => { s.unread = 0 })
    await refreshUnread()
  } finally { marking.value = false }
}
// 与企业端一致：面板打开期间 20s 轻量轮询保证新消息可见，关闭即停。
watch(() => props.modelValue, open => {
  if (open) { load(); poll = setInterval(() => { loadMessages() }, 20000) }
  else { clearInterval(poll); poll = null }
}, { immediate: true })
onBeforeUnmount(() => clearInterval(poll))
</script>
<style scoped>
/* 样式取自企业端 prototype.css + portal.css + workspace.css 三层叠加后的最终生效值（纸色主题），
   全部收敛在本组件作用域内：变量声明在根节点上，规则都带 .platform-service 前缀，不影响用户端其余页面。 */
.platform-service {
  --bg: #f6f4ef; --surface: #f6f4ef; --soft: #edeae2; --ink: #1b1a18; --muted: #716b61; --line: #dcd8ce;
  --brand: #2c4a52; --brand2: #4a6c74; --brandsoft: #e4ecec; --gold: #8a6228; --red: #b03a2e; --redsoft: #f5e6e3;
  --serif: "Source Han Serif SC", "Noto Serif SC", "Songti SC", serif;
  --sans: "PingFang SC", "Microsoft YaHei", "Noto Sans SC", Arial, sans-serif;
  position: fixed; inset: 0; z-index: 2000; display: none; background: #17252370;
  padding: 18px; align-items: center; justify-content: center; flex-direction: column; overflow: hidden;
  color: var(--ink); font-size: 15px; line-height: 1.7; letter-spacing: .01em;
}
.platform-service[data-open="true"] { display: flex; }
.platform-service :is(h1, h2, h3) { font-family: var(--serif); }
.platform-service :is(button, input) { font-family: var(--sans); }
.platform-service button { cursor: pointer; font: inherit; }
.platform-service button:disabled { cursor: not-allowed; opacity: .48; }

.platform-service .workspace-page-head { display: flex; align-items: center; gap: 18px; height: 64px; min-height: 64px; flex: none; padding: 15px 19px; background: var(--surface); border: 1px solid var(--line); border-bottom: 1px solid var(--line); border-radius: 0; position: relative; z-index: 1; }
.platform-service .workspace-page-head h1 { font-size: 20px; font-weight: 600; margin: 0; color: var(--ink); }
.platform-service .workspace-page-head p { margin: 4px 0 0; color: var(--muted); font-size: 11px; }
.platform-service .page-head-copy { flex: 1; min-width: 0; }
.platform-service .workspace-page-close { border: 1px solid var(--line); background: transparent; color: var(--brand); border-radius: 2px; padding: 7px 12px; font-size: 12px; white-space: nowrap; }
.platform-service .workspace-page-close:hover { background: var(--brandsoft); }
.platform-service .workspace-page-body { background: var(--surface); border: 1px solid var(--line); border-top: 0; border-radius: 0; padding: 14px; overflow: auto; box-shadow: 0 18px 50px #0003; }
.platform-service .workspace-page-head, .platform-service .workspace-page-body { width: min(860px, calc(100vw - 36px)); max-width: none; margin: 0; }
.platform-service .workspace-page-body { max-height: min(620px, calc(100vh - 100px)); }

.platform-service .conversation-layout { display: grid; grid-template-columns: 280px minmax(0, 1fr); grid-template-rows: minmax(0, 1fr); min-height: 480px; max-height: min(560px, calc(100vh - 112px)); border: 1px solid var(--line); border-radius: 0; overflow: hidden; background: var(--bg); }
.platform-service .conversation-sidebar { border-right: 1px solid var(--line); background: var(--soft); display: flex; flex-direction: column; min-height: 0; }
.platform-service .conversation-filter { padding: 10px; border-bottom: 1px solid var(--line); display: grid; gap: 8px; }
.platform-service .conversation-filter .btn { text-align: center; justify-content: center; }
.platform-service .conversation-list { overflow: auto; flex: 1; }
.platform-service .conversation-item { border: 0; border-bottom: 1px solid var(--line); background: transparent; width: 100%; padding: 11px 12px; text-align: left; color: var(--ink); }
.platform-service .conversation-item:hover { background: #fff; }
.platform-service .conversation-item[data-active="true"] { background: var(--bg); box-shadow: inset 2px 0 var(--brand); }
.platform-service .conversation-item-main { display: flex; justify-content: space-between; gap: 8px; }
.platform-service .conversation-item-main b { font-size: 13px; }
.platform-service .conversation-item-main i { width: 7px; height: 7px; border-radius: 50%; background: var(--red); display: inline-block; margin-top: 4px; }
.platform-service .conversation-item-preview, .platform-service .conversation-item time { display: block; color: var(--muted); font-size: 11px; margin-top: 5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.platform-service .conversation-main { display: flex; flex-direction: column; min-width: 0; min-height: 0; }
.platform-service .conversation-head { padding: 17px 20px; border-bottom: 1px solid var(--line); }
.platform-service .conversation-head b { display: block; font-size: 15px; }
.platform-service .conversation-head span { display: block; color: var(--muted); font-size: 11px; margin-top: 5px; }
.platform-service .conversation-messages { flex: 1; min-height: 300px; max-height: 360px; overflow: auto; padding: 16px; background: var(--bg); }
.platform-service .conversation-message { display: flex; margin: 9px 0; }
.platform-service .conversation-message.me { justify-content: flex-end; }
.platform-service .conversation-bubble { max-width: min(70%, 460px); border: 1px solid var(--line); border-radius: 2px; padding: 9px 11px; background: var(--soft); font-size: 12px; line-height: 1.65; white-space: pre-wrap; overflow-wrap: anywhere; }
.platform-service .conversation-message.me .conversation-bubble { background: var(--brandsoft); border-color: #c3d1cf; }
.platform-service .conversation-bubble time { display: block; color: var(--muted); font-size: 10px; margin-top: 4px; text-align: right; }
.platform-service .conversation-compose { display: flex; gap: 9px; padding: 10px 12px; border-top: 1px solid var(--line); background: var(--bg); }
.platform-service .conversation-compose input { min-width: 0; flex: 1; border: 1px solid var(--line); border-radius: 2px; padding: 10px; background: var(--bg); color: var(--ink); }
.platform-service .conversation-compose input:disabled { background: var(--soft); }
.platform-service .rights-note { font-size: 12px; color: var(--muted); line-height: 1.7; margin: 8px 12px; }

.platform-service .btn { border: 1px solid var(--brand); border-radius: 2px; background: var(--brand); color: #fff; padding: 9px 15px; }
.platform-service .btn:hover { background: #24434a; }
.platform-service .btn.light { background: var(--brandsoft); color: var(--brand); border-color: #c3d1cf; }
.platform-service .btn.ghost { background: transparent; color: var(--brand); border-color: var(--line); }
.platform-service .btn:is(.ghost, .light):hover { background: var(--brandsoft); }
.platform-service .btn.small { font-size: 12px; padding: 6px 10px; }

/* 企业端 portal.css 的放大层：宽屏下放宽宽高并让消息区撑满。 */
@media (min-width: 761px) {
  .platform-service .workspace-page-head, .platform-service .workspace-page-body { width: min(1180px, calc(100vw - 48px)); }
  .platform-service .workspace-page-body { max-height: min(940px, calc(100vh - 112px)); }
  .platform-service .conversation-layout { min-height: 0; height: min(860px, calc(100vh - 180px)); max-height: min(860px, calc(100vh - 180px)); }
  .platform-service .conversation-sidebar { width: auto; }
  .platform-service .conversation-messages { min-height: 0; max-height: none; }
}
@media (max-width: 760px) {
  .platform-service { padding: 10px; }
  .platform-service .workspace-page-head, .platform-service .workspace-page-body { width: calc(100vw - 20px); }
  .platform-service .workspace-page-body { max-height: calc(100vh - 82px); padding: 10px; }
  .platform-service .conversation-layout { grid-template-columns: 1fr; grid-template-rows: auto auto; max-height: none; min-height: 0; }
  .platform-service .conversation-sidebar { border-right: 0; border-bottom: 1px solid var(--line); width: auto; max-height: 210px; }
  .platform-service .conversation-messages { min-height: 260px; max-height: 42vh; }
}
</style>
