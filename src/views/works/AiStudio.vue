<template>
  <section class="sec" :class="{ 'ai-embedded': embedded }"><div v-if="embedded" class="ai-panel-head"><h2><span>✦</span> AI 创作助手</h2><span class="ai-quota" :class="{ 'ai-quota-empty': quota === 0 }">{{ quotaText }}</span></div><div v-else class="sub-head"><h3>AI 辅助创作</h3><span class="count">让灵感成为下一幕</span></div>
    <PortalTabs v-model="tab" :items="tabs" :drawer="embedded" label="AI 创作工具" />
    <div v-if="tab !== 'log'" class="compose">
      <form class="compose-form" @submit.prevent="generate"><h3>{{ tab === 'outline' ? '生成大纲' : tab === 'write' ? '生成正文' : '润色片段' }}</h3>
        <label v-if="!embedded" class="field">作品<select aria-label="作品" v-model="form.workId" :disabled="generating"><option value="">选择作品（选填）</option><option v-for="work in works" :key="work.workId" :value="work.workId" :disabled="work.status === 'reviewing'">{{ work.title }}（{{ stateOf(work.status).label }}）</option></select></label>
        <template v-if="tab === 'outline'"><div class="ai-outline-meta"><label class="field">题材<input v-model="form.genre" placeholder="例如：都市情感" /></label><label class="field">集数<input v-model="form.episodes" type="number" min="1" max="200" /></label></div><label class="field">你的要求<textarea v-model="form.prompt" placeholder="人物、故事线、希望埋下的反转…" /></label></template>
        <template v-else-if="tab === 'write'"><label class="field">章节标题<input v-model="form.chapterTitle" placeholder="例如：第一集 · 深夜频率" /></label><label class="field">场景要求<textarea v-model="form.prompt" placeholder="地点、时间、人物与剧情走向…" /></label></template>
        <template v-else><button v-if="embedded" class="text-button ai-read-current" type="button" :disabled="generating || !currentContent.trim()" @click="form.content = documentText(currentContent)">读取当前分集正文</button><label class="field">要润色的原文<textarea v-model="form.content" placeholder="粘贴需要润色的片段" /></label><label class="field">润色方向<select v-model="form.style"><option>增强画面感</option><option>精简啰嗦</option><option>加强情绪</option></select></label></template>
        <p v-if="error" class="note bad" role="alert">{{ error }}</p><button class="btn" :disabled="generating || !canCreate">{{ generating ? '正在生成…' : tab === 'outline' ? '生成大纲' : tab === 'write' ? '生成正文' : '开始润色' }}</button><p class="cost">生成结果和扣次信息以服务端返回为准</p>
      </form>
      <div class="compose-out"><h3>{{ tab === 'polish' ? '润色结果' : '生成结果' }}</h3><div v-if="result" class="prose ai-result">{{ result }}</div><LoadState v-else :pending="generating" :empty="!generating" empty-text="写下你的想法，故事将在这里展开。" /><div v-if="result" class="row top-gap"><button v-if="embedded" class="btn sm" :disabled="generating || insertDisabled" @click="$emit('insert', result)">插入正文</button><button v-else class="btn sm" :disabled="generating || copying" @click="adopt">{{ tab === 'outline' ? '采用' : '写入章节' }}</button><button class="btn quiet sm" :disabled="generating" @click="generate">重新生成</button><button v-if="embedded" class="btn quiet sm" :disabled="copying" @click="copyResult">复制</button><button v-else class="btn quiet sm" :disabled="generating" @click="results[tab] = ''">丢弃</button></div><p v-if="result && !form.workId && !embedded" class="cost">未选择作品时，采用会将内容复制到剪贴板。</p><p v-if="embedded && result" class="cost">插入会追加到当前分集，保留原文。</p></div>
    </div>
    <div v-else class="top-gap"><LoadState :pending="recordLoading" :error="recordError" :retry="loadRecords" :empty="!recordLoading && !recordError && !records.length" /><div v-if="embedded && records.length && !recordError" class="ai-records"><article v-for="record in records" :key="record.recordId" :class="{ open: expanded.has(record.recordId) }"><button class="ai-record-row" type="button" @click="toggleRecord(record.recordId)"><b>{{ typeLabels[record.type] || record.type || 'AI 创作' }}</b><span>{{ record.quotaUsed ?? '—' }} 次</span><p>{{ record.title || '独立创作' }}</p><small>{{ dateText(record.createdAt || record.createTime) }}</small></button><div v-if="expanded.has(record.recordId)" class="ai-record-detail"><div v-if="record.input"><h4>我的输入</h4><pre>{{ record.input }}</pre></div><div v-if="record.output"><h4>AI 输出</h4><pre>{{ record.output }}</pre></div><p v-else-if="record.type === 'outline'" class="note">大纲请求未留存内容，请生成后及时保存。</p></div></article></div><div v-else-if="records.length && !recordError" class="tbl"><table><thead><tr><th>时间</th><th>类型</th><th>作品 / 章节</th><th class="num">消耗</th></tr></thead><tbody><tr v-for="record in records" :key="record.recordId"><td>{{ dateText(record.createTime || record.createdAt) }}</td><td>{{ typeLabels[record.type] || record.type || 'AI 创作' }}</td><td>{{ record.workTitle || record.title || '—' }}</td><td>{{ record.quotaUsed ?? '—' }} 次</td></tr></tbody></table></div></div>
    <ChapterEditor v-if="editorVisible" v-model="editorVisible" :work-id="form.workId" :chapter-no="nextChapterNo" :initial-content="adopted" />
  </section>
</template>
<script setup>
import { computed, reactive, ref, toRef, watch, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { usePortal } from '../../utils/portal.js'
import { stateOf, dateText, quotaTip } from '../../utils/creator.js'
import { documentText } from '../../utils/document.js'
import PortalTabs from '../../components/PortalTabs.vue'
import LoadState from '../../components/LoadState.vue'
import ChapterEditor from '../../components/ChapterEditor.vue'
const props = defineProps({ works: Array, embedded: Boolean, workId: [Number, String], currentContent: { type: String, default: '' }, insertDisabled: Boolean, workspaceState: Object })
defineEmits(['insert'])
const { api, user, canCreate, handleError } = usePortal()
const quota = ref(null)
const quotaText = computed(() => quota.value === null ? '剩余次数 —' : quota.value > 0 ? `剩余 ${quota.value} 次` : '剩余 0 次，需到手机兑换')
async function loadQuota() {
  if (!api.value?.getAiQuota || !user.value?.userId) return
  try { quota.value = (await api.value.getAiQuota(user.value.userId)).available }
  catch (failure) { if (failure.message && failure.message.includes('次数不足')) { quota.value = 0 } else { await handleError(failure) } }
}
async function promptExchange() {
  try { await ElMessageBox.alert(quotaTip(0), 'AI 次数不足', { confirmButtonText: '知道了', type: 'warning' }) }
  catch { /* 用户关闭弹窗不阻塞 */ }
}
const tab = props.workspaceState ? toRef(props.workspaceState, 'tab') : ref('outline')
const tabs = [{ value: 'outline', label: 'AI 大纲' }, { value: 'write', label: props.embedded ? 'AI 续写' : 'AI 写正文' }, { value: 'polish', label: 'AI 润色' }, { value: 'log', label: '生成记录' }]
const typeLabels = { outline: 'AI 大纲', write: props.embedded ? 'AI 续写' : 'AI 写正文', polish: 'AI 润色' }
const form = props.workspaceState?.form || reactive({ workId: '', genre: '', episodes: 12, prompt: '', content: '', style: '增强画面感', chapterTitle: '' })
const results = props.workspaceState?.results || reactive({ outline: '', write: '', polish: '' })
const result = computed(() => results[tab.value] || '')
const generating = ref(false)
const copying = ref(false)
const error = ref('')
const records = ref([])
const recordLoading = ref(false)
const recordError = ref('')
const expanded = ref(new Set())
function toggleRecord(id) {
  const next = new Set(expanded.value)
  next.has(id) ? next.delete(id) : next.add(id)
  expanded.value = next
}
const editorVisible = ref(false)
const adopted = ref('')
const nextChapterNo = ref(1)
async function generate() {
  if (generating.value || !canCreate.value) return
  const type = tab.value
  error.value = ''
  if (quota.value !== null && quota.value <= 0) { await promptExchange(); return }
  if (!(type === 'polish' ? form.content : form.prompt).trim()) { error.value = type === 'polish' ? '请输入要润色的原文' : '请输入创作要求'; return }
  if (type === 'outline' && (!Number.isInteger(Number(form.episodes)) || Number(form.episodes) < 1 || Number(form.episodes) > 200)) { error.value = '集数需为 1–200 的整数'; return }
  generating.value = true
  try {
    const body = type === 'outline' ? { inspiration: form.prompt, genre: form.genre, style: `共 ${form.episodes} 集`, workId: form.workId || undefined } : type === 'polish' ? { content: documentText(form.content), style: form.style } : { prompt: `${form.chapterTitle}\n${props.embedded && props.currentContent ? '已有正文：\n' + documentText(props.currentContent) + '\n续写要求：\n' : ''}${form.prompt}`, workId: form.workId || undefined, type: 'script' }
    const output = await api.value.generate(type, body)
    const content = output.content || output.outline
    if (typeof content !== 'string' || !content.trim()) throw new Error('本次未返回生成内容，请重试')
    results[type] = content
  } catch (failure) { error.value = failure.message; if (failure.message && failure.message.includes('次数不足')) await promptExchange(); else await handleError(failure) }
  finally { generating.value = false; await loadQuota() }
}
async function adopt() {
  if (!result.value || copying.value) return
  copying.value = true
  try {
    if (!form.workId) { await navigator.clipboard.writeText(result.value); ElMessage.success('已复制生成内容') }
    else { const detail = await api.value.getWork(form.workId); if (detail.work.status === 'reviewing') throw new Error('作品正在审核中，暂不可编辑'); nextChapterNo.value = (detail.chapters || []).length + 1; adopted.value = result.value; editorVisible.value = true }
  } catch (failure) { await handleError(failure) }
  finally { copying.value = false }
}
async function copyResult() {
  if (!result.value || copying.value) return
  copying.value = true
  try { await navigator.clipboard.writeText(result.value); ElMessage.success('已复制生成内容') }
  catch (failure) { await handleError(failure) }
  finally { copying.value = false }
}
async function loadRecords() {
  recordLoading.value = true; recordError.value = ''
  try { records.value = await api.value.listAiRecords() }
  catch (failure) { recordError.value = failure.message; await handleError(failure) }
  finally { recordLoading.value = false }
}
watch(tab, value => { error.value = ''; if (value === 'log') loadRecords() })
watch(() => props.workId, value => { if (props.embedded) form.workId = value || '' }, { immediate: true })
watch(user, value => { if (value?.userId) loadQuota() }, { immediate: true })
onMounted(loadQuota)
</script>
