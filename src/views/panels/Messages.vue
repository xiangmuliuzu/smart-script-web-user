<template>
  <PortalLayer v-model="visible" title="消息">
    <div class="drawer-tools"><button class="btn quiet sm" :disabled="reading || !messages.some(m => !m.isRead)" @click="readAll">{{ reading ? '处理中…' : '全部已读' }}</button></div>
    <LoadState :pending="pending" :error="error" :retry="load" :empty="!pending && !error && !messages.length" empty-text="还没有新的通知" />
    <div v-for="message in messages" :key="message.messageId" class="msg" role="button" tabindex="0" :data-unread="!message.isRead" @click="openMessage(message)" @keydown.enter.prevent="openMessage(message)"><span class="top"><b>{{ message.title }}</b><time>{{ dateText(message.createTime).slice(5) }}</time></span><p>{{ message.content }}</p><button v-if="tradeJumpOf(message)" class="msg-link" type="button" @click.stop="jumpTrade(message)">{{ tradeJumpOf(message).label }}</button></div>
    <PortalLayer v-model="detailVisible" :title="selected?.title || '通知详情'" modal><p class="cost">{{ dateText(selected?.createTime) }}</p><p class="notification-content">{{ selected?.content }}</p></PortalLayer>
  </PortalLayer>
</template>
<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { usePortal } from '../../utils/portal.js'
import { dateText } from '../../utils/creator.js'
import PortalLayer from '../../components/PortalLayer.vue'
import LoadState from '../../components/LoadState.vue'
// 消息面板只承载系统通知；与平台的聊天会话已分离到「沟通」面板（PlatformChat.vue）。
const props = defineProps({ modelValue: Boolean })
const emit = defineEmits(['update:modelValue'])
const { api, handleError, refreshUnread, goWork, openPanel } = usePortal()
const router = useRouter()
const visible = computed({ get: () => props.modelValue, set: value => emit('update:modelValue', value) })
const messages = ref([])
const pending = ref(false)
const reading = ref(false)
const error = ref('')
const detailVisible = ref(false)
const selected = ref(null)
async function load() { pending.value = true; error.value = ''; try { messages.value = await api.value.listMessages() } catch (failure) { error.value = failure.message; await handleError(failure) } finally { pending.value = false } }
async function readAll() {
  if (reading.value) return
  reading.value = true
  try { await api.value.readAllMessages(); messages.value.forEach(m => { m.isRead = true }); await refreshUnread() }
  catch (failure) { await handleError(failure) }
  finally { reading.value = false }
}
async function openMessage(message) {
  try {
    const detail = await api.value.getMessage(message.messageId)
    await api.value.readMessage(message.messageId); message.isRead = true; await refreshUnread()
    if (message.workId) { visible.value = false; await goWork(message.workId) }
    else if (message.panel) { visible.value = false; openPanel(message.panel, message.tab) }
    else { selected.value = { ...message, content: detail?.content || message.content }; detailVisible.value = true }
  } catch (failure) { await handleError(failure) }
}
// 交易域通知跳转：与企业端同一契约（businessType → 我的合作对应 Tab），
// 并从正文抽单号（INQ/ORD/CTC…）预填目标 Tab 的搜索框，直达具体记录。
const TRADE_JUMP = {
  INQUIRY: { tab: 'inquiry', label: '查看询盘 →' },
  ORDER: { tab: 'order', label: '查看订单 →' },
  CONTRACT: { tab: 'contract', label: '查看合同 →' },
  // 任务域通知跳顶级页签 /demand，不再进合作抽屉
  DEMAND: { demand: true, label: '查看任务 →' },
}
function tradeJumpOf(message) {
  return message && message.type === 'TRANSACTION' && message.businessId ? TRADE_JUMP[message.businessType] : null
}
function bizNoOf(message) {
  const m = `${message.title || ''} ${message.content || ''}`.match(/\b(?:INQ|ORD|CTC)[A-Za-z0-9-]+\b/)
  return m ? m[0] : ''
}
async function jumpTrade(message) {
  const jump = tradeJumpOf(message)
  if (!jump) return
  try { await api.value.readMessage(message.messageId); message.isRead = true; await refreshUnread() } catch { /* 标记失败不打断跳转 */ }
  visible.value = false
  if (jump.demand) {
    return router.push(`/demand/${encodeURIComponent(message.businessId)}`)
  }
  openPanel('cooperation', jump.tab, bizNoOf(message))
}
onMounted(load)
</script>
<style scoped>
/* div.msg 沿用全局 .msg 样式，补上可点击观感；跳转链按钮与企业端 notice-link 同构 */
.msg { cursor: pointer }
.msg-link { margin-top: 6px; padding: 0; border: 0; background: none; color: var(--link, #409eff); font-size: 12.5px; cursor: pointer }
.msg-link:hover { text-decoration: underline }
</style>
