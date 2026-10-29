<template>
  <PortalLayer v-model="visible" title="消息">
    <div class="drawer-tools"><button class="btn quiet sm" :disabled="reading || !messages.some(m => !m.isRead)" @click="readAll">{{ reading ? '处理中…' : '全部已读' }}</button></div>
    <LoadState :pending="pending" :error="error" :retry="load" :empty="!pending && !error && !messages.length" empty-text="还没有新的通知" />
    <button v-for="message in messages" :key="message.messageId" class="msg" :data-unread="!message.isRead" @click="openMessage(message)"><span class="top"><b>{{ message.title }}</b><time>{{ dateText(message.createTime).slice(5) }}</time></span><p>{{ message.content }}</p></button>
    <PortalLayer v-model="detailVisible" :title="selected?.title || '通知详情'" modal><p class="cost">{{ dateText(selected?.createTime) }}</p><p class="notification-content">{{ selected?.content }}</p></PortalLayer>
  </PortalLayer>
</template>
<script setup>
import { computed, onMounted, ref } from 'vue'
import { usePortal } from '../../utils/portal.js'
import { dateText } from '../../utils/creator.js'
import PortalLayer from '../../components/PortalLayer.vue'
import LoadState from '../../components/LoadState.vue'
// 消息面板只承载系统通知；与平台的聊天会话已分离到「沟通」面板（PlatformChat.vue）。
const props = defineProps({ modelValue: Boolean })
const emit = defineEmits(['update:modelValue'])
const { api, handleError, refreshUnread, goWork, openPanel } = usePortal()
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
onMounted(load)
</script>
