<template>
  <PortalLayer v-model="visible" title="消息">
    <div class="drawer-tools"><button class="btn quiet sm" :disabled="reading || !messages.some(m => !m.isRead)" @click="readAll">{{ reading ? '处理中…' : '全部已读' }}</button></div>
    <PortalTabs v-model="tab" :items="tabs" drawer label="消息类型" />
    <div v-if="tab === 'notice'"><LoadState :pending="pending" :error="error" :retry="load" :empty="!pending && !error && !messages.length" empty-text="还没有新的通知" /><button v-for="message in messages" :key="message.messageId" class="msg" :data-unread="!message.isRead" @click="openMessage(message)"><span class="top"><b>{{ message.title }}</b><time>{{ dateText(message.createTime).slice(5) }}</time></span><p>{{ message.content }}</p></button></div>
    <div v-else class="chat-panel"><div class="chat-head"><span class="avatar">平</span><div><div class="who">平台运营</div><div class="cost">有问题，随时在这里与我们沟通</div></div><button class="text-button" :disabled="chatLoading" @click="loadChat">刷新</button></div><LoadState :pending="chatLoading" :error="chatError" :retry="loadChat" /><div v-if="!chatLoading && !chatError" ref="chatBody" class="chat-body"><div v-for="message in chat" :key="message.messageId || message.msgId" class="bubble" :class="Number(message.senderId) === Number(user.userId) ? 'me' : 'them'">{{ message.content }}<time>{{ dateText(message.createTime || message.createdAt).slice(5) }}</time></div><p v-if="!chat.length" class="cost">说说你遇到的问题，平台会为你跟进。</p></div><form class="chat-input" @submit.prevent="send"><input v-model="text" maxlength="2000" placeholder="输入消息…" aria-label="输入消息" :disabled="chatLoading || !!chatError" /><button class="btn" :disabled="sending || !text.trim() || !sessionId || !!chatError">{{ sending ? '发送中…' : '发送' }}</button></form></div>
    <PortalLayer v-model="detailVisible" :title="selected?.title || '通知详情'" modal><p class="cost">{{ dateText(selected?.createTime) }}</p><p class="notification-content">{{ selected?.content }}</p></PortalLayer>
  </PortalLayer>
</template>
<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { usePortal } from '../../utils/portal.js'
import { dateText } from '../../utils/creator.js'
import PortalLayer from '../../components/PortalLayer.vue'
import PortalTabs from '../../components/PortalTabs.vue'
import LoadState from '../../components/LoadState.vue'
const props = defineProps({ modelValue: Boolean, initialTab: String })
const emit = defineEmits(['update:modelValue'])
const { api, user, handleError, refreshUnread, goWork, openPanel } = usePortal()
const visible = computed({ get: () => props.modelValue, set: value => emit('update:modelValue', value) })
const tab = ref(props.initialTab || 'notice')
const messages = ref([])
const pending = ref(false)
const reading = ref(false)
const error = ref('')
const chat = ref([])
const chatLoading = ref(false)
const chatError = ref('')
const sessionId = ref(null)
const text = ref('')
const sending = ref(false)
const chatBody = ref(null)
const detailVisible = ref(false)
const selected = ref(null)
const tabs = computed(() => [{ value: 'notice', label: '通知', count: messages.value.filter(m => !m.isRead).length }, { value: 'talk', label: '与平台沟通' }])
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
async function loadChat() {
  if (chatLoading.value) return
  chatLoading.value = true; chatError.value = ''
  try { const session = await api.value.openChat(); if (!session?.sessionId) throw new Error('暂时无法建立会话，请重试'); sessionId.value = session.sessionId; chat.value = await api.value.listChat(sessionId.value) }
  catch (failure) { chatError.value = failure.message; await handleError(failure) }
  finally { chatLoading.value = false; await nextTick(); chatBody.value?.scrollTo({ top: chatBody.value.scrollHeight }) }
}
async function send() {
  if (sending.value || !text.value.trim() || !sessionId.value || chatError.value) return
  sending.value = true
  const content = text.value.trim()
  try { const message = await api.value.sendChat(sessionId.value, content); if (!message) throw new Error('发送响应不完整，请刷新会话确认'); chat.value.push(message); text.value = ''; await nextTick(); chatBody.value?.scrollTo({ top: chatBody.value.scrollHeight }) }
  catch (failure) { await handleError(failure) }
  finally { sending.value = false }
}
watch(tab, value => { if (value === 'talk') loadChat() })
watch(() => props.initialTab, value => { if (value) tab.value = value })
onMounted(() => { load(); if (tab.value === 'talk') loadChat() })
</script>
