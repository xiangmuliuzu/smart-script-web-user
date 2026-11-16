<template>
  <section class="sec" :class="{ 'ai-embedded': embedded }"><div v-if="embedded" class="ai-panel-head"><h2><span>✦</span> AI 编剧助手<button class="ai-recharge" type="button" @click="openRecharge">充值</button></h2><span class="ai-quota" :class="{ 'ai-quota-empty': quota === 0 }">{{ quotaText }}</span></div><div v-else class="sub-head"><h3>AI 辅助创作</h3><span class="count">让灵感成为下一幕</span></div>
    <PortalTabs v-model="tab" :items="tabs" :drawer="embedded" label="AI 创作工具" />
    <div v-if="tab !== 'log'" class="compose">
      <form class="compose-form" @submit.prevent="generate()"><h3>{{ tabHeading }}</h3>
        <label class="field">导演(skill)<select aria-label="导演(skill)" v-model="form.skillId" :disabled="generating"><option value="">默认导演</option><option v-for="skill in visibleSkills" :key="skill.id" :value="skill.id">{{ skill.skillName }}</option></select></label>
        <label class="field">模型<select aria-label="模型" v-model="form.model" :disabled="generating"><option value="">默认模型</option><option v-for="opt in modelOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option></select></label>
        <label v-if="!embedded" class="field">作品<select aria-label="作品" v-model="form.workId" :disabled="generating"><option value="">选择作品（选填）</option><option v-for="work in works" :key="work.workId" :value="work.workId" :disabled="work.status === 'reviewing'">{{ work.title }}（{{ stateOf(work.status).label }}）</option></select></label>
        <template v-if="tab === 'outline'"><div class="ai-outline-meta"><label class="field">题材<input v-model="form.genre" placeholder="例如：都市情感" /></label><label class="field">集数<input v-model="form.episodes" type="number" min="1" max="50" /></label><label class="field">一集时长<select aria-label="一集时长" v-model.number="form.episodeMinutes"><option :value="1">1 分钟</option><option :value="1.5">1.5 分钟</option><option :value="2">2 分钟</option></select></label></div><label class="field">故事灵感<textarea v-model="form.idea" placeholder="这个故事大体讲了什么：谁、在什么处境、要解决什么…" /></label><label class="field">你的要求<textarea v-model="form.prompt" placeholder="写法上的要求，例如：节奏必须紧凑，前三集埋一个反转…" /></label></template>
        <template v-else-if="tab === 'write'"><label class="field">章节标题<input v-model="form.chapterTitle" placeholder="例如：第一集 · 深夜频率" /></label><label class="field">场景要求<textarea v-model="form.prompt" placeholder="地点、时间、人物与剧情走向…" /></label></template>
        <template v-else-if="tab === 'storyboard'"><div v-if="hasGeneratedText" class="row top-gap"><button class="text-button" type="button" :disabled="generating" @click="fillScriptFromResult">一键带入：用刚才的{{ lastGeneratedLabel }}当剧本文本</button></div><label class="field">剧本文本<textarea aria-label="剧本文本" v-model="form.script" placeholder="粘贴或带入 AI 剧本/正文，AI 将拆解为可直接出售的分镜脚本…" /></label><label class="field">分镜风格<select aria-label="分镜风格" v-model="form.sbStyle"><option>电影感</option><option>短剧竖屏</option><option>动漫风</option></select></label></template>
        <template v-else><button v-if="embedded" class="text-button ai-read-current" type="button" :disabled="generating || !currentContent.trim()" @click="form.content = documentText(currentContent)">读取当前分集正文</button><label class="field">要润色的原文<textarea v-model="form.content" placeholder="粘贴需要润色的片段" /></label><label class="field">润色方向<select v-model="form.style"><option>增强画面感</option><option>精简啰嗦</option><option>加强情绪</option></select></label></template>
        <p v-if="error" class="note bad" role="alert">{{ error }}</p><button class="btn" :disabled="generating || !canCreate">{{ generating ? '正在生成…' : tab === 'outline' ? '生成剧本大纲' : tab === 'write' ? '生成正文' : tab === 'storyboard' ? '生成分镜' : '开始润色' }}</button><p class="cost">生成结果和积分消耗以服务端返回为准</p>
      </form>
      <div class="compose-out"><h3>{{ tab === 'polish' ? '润色结果' : '生成结果' }}</h3><div class="ai-scroll"><p v-if="generating && result" class="cost" role="status">正在生成，内容持续更新…</p><div v-if="result" class="prose ai-result">{{ displayResult }}</div><LoadState v-else :pending="generating" :empty="!generating" empty-text="写下你的想法，故事将在这里展开。" /><div v-if="result" class="row top-gap">
          <button v-if="embedded && tab === 'outline'" class="btn sm" :disabled="generating || insertDisabled || outlineIncomplete" @click="chooseFillOutline">根据大纲生成各章</button>
          <button v-if="embedded && tab === 'outline'" class="btn sm" :disabled="generating || insertDisabled" @click="$emit('create-outline', displayResult)">写入创作资料</button>
          <button v-else-if="embedded" class="btn sm" :disabled="generating || insertDisabled" @click="$emit('insert', displayResult)">插入正文</button>
          <button v-else class="btn sm" :disabled="generating || copying" @click="adopt">{{ tab === 'outline' ? '采用' : '写入章节' }}</button>
          <button class="btn quiet sm" :disabled="generating || insertDisabled" @click="regenerate">重新生成</button>
          <button v-if="embedded" class="btn quiet sm" :disabled="copying" @click="copyResult">复制</button>
          <button v-else class="btn quiet sm" :disabled="generating" @click="results[tab] = ''">丢弃</button>
        </div>
        <p v-if="result && !form.workId && !embedded" class="cost">未选择作品时，采用会将内容复制到剪贴板。</p>
        <p v-if="embedded && result && tab === 'outline'" class="cost">「写入创作资料」会把结果按标题拆开：故事简介进「故事简介」、主要人物与人物关系进「人物便签」、每集事件卡进「剧本大纲」，并补上道具档案与写法基线（只补空位，不覆盖手填）。改满意后点「根据大纲生成各章」，提交后台队列逐集写正文，关闭页面也不中断，失败可续跑，每集按实际 token 扣积分。</p>
        <p v-else-if="embedded && result" class="cost">插入会追加到当前分集，保留原文。重新生成可选择完整重写，或带着当前结果提意见再生成。</p></div></div>
    </div>
    <div v-else class="top-gap"><LoadState :pending="recordLoading" :error="recordError" :retry="loadRecords" :empty="!recordLoading && !recordError && !records.length" /><div v-if="embedded && records.length && !recordError" class="ai-records"><article v-for="record in records" :key="record.recordId" :class="{ open: expanded.has(record.recordId) }"><button class="ai-record-row" type="button" @click="toggleRecord(record.recordId)"><b>{{ typeLabels[record.type] || record.type || 'AI 创作' }}</b><span>{{ record.tokens ?? '—' }} token</span><p>{{ record.title || '独立创作' }}</p><small>{{ dateText(record.createdAt || record.createTime) }}</small></button><div v-if="expanded.has(record.recordId)" class="ai-record-detail"><div v-if="record.input"><h4>我的输入</h4><pre>{{ record.input }}</pre></div><div v-if="record.output"><h4>AI 输出</h4><pre>{{ record.output }}</pre></div><p v-else-if="record.type === 'outline'" class="note">大纲请求未留存内容，请生成后及时保存。</p></div></article></div><div v-else-if="records.length && !recordError" class="tbl"><table><thead><tr><th>时间</th><th>类型</th><th>作品 / 章节</th><th class="num">消耗</th></tr></thead><tbody><tr v-for="record in records" :key="record.recordId"><td>{{ dateText(record.createTime || record.createdAt) }}</td><td>{{ typeLabels[record.type] || record.type || 'AI 创作' }}</td><td>{{ record.workTitle || record.title || '—' }}</td><td>{{ record.tokens ?? '—' }} token</td></tr></tbody></table></div></div>
    <ChapterEditor v-if="editorVisible" v-model="editorVisible" :work-id="form.workId" :chapter-no="nextChapterNo" :initial-content="adopted" />
  </section>
</template>
<script setup>
import { computed, reactive, ref, toRef, watch, onMounted, onBeforeUnmount } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { usePortal } from '../../utils/portal.js'
import { stateOf, dateText, quotaTip, outlineToText } from '../../utils/creator.js'
import { continuationPrompt, checkGenerationRules } from '../../utils/creatorAi.js'
import { documentText } from '../../utils/document.js'
import PortalTabs from '../../components/PortalTabs.vue'
import LoadState from '../../components/LoadState.vue'
import ChapterEditor from '../../components/ChapterEditor.vue'
const props = defineProps({ works: Array, embedded: Boolean, workId: [Number, String], currentContent: { type: String, default: '' }, outline: { type: String, default: '' }, ledger: { type: Object, default: () => ({}) }, volumes: { type: Array, default: () => [] }, prevChapter: { type: String, default: '' }, prevSummaries: { type: String, default: '' }, chapterNo: { type: Number, default: 0 }, insertDisabled: Boolean, workspaceState: Object })
const emit = defineEmits(['insert', 'fill-outline', 'create-outline'])
const { api, user, canCreate, handleError, openPanel } = usePortal()
const quota = ref(null)
// 余额只展示真实积分数；不足时不再引导到手机端（PC 已提供充值入口）。
const quotaText = computed(() => quota.value === null ? '剩余积分 —' : `剩余 ${Number(quota.value) || 0} 积分`)
// 充值入口：打开积分充值面板（金额档位 / 自定义金额 / 换算 / 付费方式）。
function openRecharge() { openPanel?.('recharge') }
async function loadQuota() {
  if (!api.value?.getAiQuota || !user.value?.userId) return
  try { quota.value = (await api.value.getAiQuota(user.value.userId)).available }
  catch (failure) { if (failure.message && failure.message.includes('积分不足')) { quota.value = 0 } else { await handleError(failure) } }
}
async function promptExchange() {
  try { await ElMessageBox.alert(quotaTip(0), '积分不足', { confirmButtonText: '知道了', type: 'warning' }) }
  catch { /* 用户关闭弹窗不阻塞 */ }
}
const tab = props.workspaceState ? toRef(props.workspaceState, 'tab') : ref('outline')
const tabs = [{ value: 'outline', label: 'AI 剧本' }, { value: 'write', label: props.embedded ? 'AI 续写' : 'AI 写正文' }, { value: 'polish', label: 'AI 润色' }, { value: 'storyboard', label: 'AI 分镜' }, { value: 'log', label: '生成记录' }]
const typeLabels = { outline: 'AI 剧本', write: props.embedded ? 'AI 续写' : 'AI 写正文', polish: 'AI 润色', storyboard: 'AI 分镜' }
const tabHeading = computed(() => tab.value === 'outline' ? '生成剧本大纲' : tab.value === 'write' ? '生成正文' : tab.value === 'storyboard' ? '生成分镜' : '润色片段')
const form = props.workspaceState?.form || reactive({ workId: '', genre: '', episodes: 12, episodeMinutes: 1, idea: '', prompt: '', content: '', style: '增强画面感', chapterTitle: '', skillId: '', model: '', script: '', sbStyle: '电影感' })
const results = props.workspaceState?.results || reactive({ outline: '', write: '', polish: '', storyboard: '' })
const skills = ref([])
const skillError = ref('')
// 模型列表（渠道聚合）：[{channelId, channelName, provider, models:[], defaultModel}]
const modelChannels = ref([])
const modelError = ref('')
// 扁平模型下拉：同一模型可能出现在多个渠道，label 带渠道名前缀以便区分；value 为模型名。
const modelOptions = computed(() => {
  const options = []
  for (const channel of modelChannels.value || []) {
    for (const m of channel.models || []) {
      options.push({ value: m, label: `${channel.channelName} · ${m}${m === channel.defaultModel ? '（默认）' : ''}` })
    }
  }
  return options
})
// 导演(skill)按用途过滤：分镜 tab 只列 storyboard 类 skill，剧本/写作/润色只列 write 类。
const visibleSkills = computed(() => {
  const isStoryboard = tab.value === 'storyboard'
  return (skills.value || []).filter(s => isStoryboard
    ? s.skillType === 'storyboard'
    : s.skillType !== 'storyboard')
})
const lastGeneratedLabel = computed(() => {
  if (results.outline?.trim()) return 'AI 剧本大纲'
  if (results.write?.trim()) return 'AI 正文'
  return ''
})
const hasGeneratedText = computed(() => Boolean(lastGeneratedLabel.value))
function fillScriptFromResult() {
  form.script = (results.outline || results.write || '').trim()
}
async function loadSkills() {
  if (!api.value?.listAiSkills) return
  skillError.value = ''
  try { skills.value = await api.value.listAiSkills() }
  catch (failure) { skillError.value = failure.message; await handleError(failure) }
}
async function loadModels() {
  if (!api.value?.listAiModels) return
  modelError.value = ''
  try { modelChannels.value = await api.value.listAiModels() }
  catch (failure) { modelError.value = failure.message; await handleError(failure) }
}
const outlineIncomplete = props.workspaceState ? toRef(props.workspaceState, 'outlineIncomplete') : ref(false)
const result = computed(() => results[tab.value] || '')
// 展示用结果：AI 大纲为 JSON 流时，可完整解析则转「字段：值」可读文本；未完整（流式进行中）显示占位，避免暴露 JSON/代码结构。
const displayResult = computed(() => {
  const raw = results[tab.value]
  if (!raw || !raw.trim()) return raw
  if (tab.value === 'outline') {
    const t = raw.trim()
    if (t.startsWith('{') || t.startsWith('[')) {
      try {
        const parsed = JSON.parse(t)
        if (parsed && typeof parsed === 'object') return outlineToText(parsed)
      } catch { /* JSON 尚未拼完整 */ }
      // JSON 形态但未解析成功：流式中显示占位；中断/异常结束时也不暴露原始 JSON 结构。
      return generating.value ? '大纲生成中，请稍候…' : '大纲生成未完成，请点击重新生成。'
    }
  }
  return raw
})
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
async function generate(feedback = '') {
  if (generating.value || props.insertDisabled || !canCreate.value) return
  const type = tab.value
  error.value = ''
  // 去次数化：不再前端拦截次数，直接调用，积分是否足够由后端校验（不足返回积分不足提示）。
  const previous = (results[type] || '').trim()
  if (feedback && !previous) { error.value = '当前没有可修改的生成结果，请先完整生成一次'; return }
  const required = type === 'polish' ? form.content : type === 'storyboard' ? form.script : type === 'outline' ? (form.idea || form.prompt) : form.prompt
  if (!feedback && !(required || '').trim()) { error.value = type === 'polish' ? '请输入要润色的原文' : type === 'storyboard' ? '请输入剧本文本' : type === 'outline' ? '请填写故事灵感（或你的要求）' : '请输入创作要求'; return }
  if (type === 'outline' && (!Number.isInteger(Number(form.episodes)) || Number(form.episodes) < 1 || Number(form.episodes) > 50)) { error.value = '集数需为 1–50 的整数'; return }
  generating.value = true
  results[type] = ''
  if (type === 'outline') outlineIncomplete.value = true
  try {
    const skillId = form.skillId || undefined
    const model = form.model || undefined
    const minutes = Number(form.episodeMinutes) || 1
    const minuteText = `${minutes} 分钟`
    const episodeFormat = `请按下面格式写 ${form.episodes} 集分集事件卡，从第1集起连续编号：\n第1集：事件名\n本集事件：……\n冲突与推进：……\n结果或反转：……\n结尾钩子：……\n每集是一件完整的事（有开场、交锋、结果），结尾钩子要具体；不要写场景头、镜号、景别、运镜。\n每集按一集 ${minuteText} 的短剧容量写：一集只承载一个场景或一次交锋，不要塞进多天多地的内容。`
    let body
    if (type === 'outline') {
      // 故事灵感讲「讲什么」，你的要求讲「怎么写」：分开成段给模型，避免把写法要求当剧情。
      const ideaText = (form.idea || '').trim()
      const askText = (form.prompt || '').trim()
      const brief = [
        ideaText ? `故事灵感：\n${ideaText}` : '',
        askText ? `写法要求：\n${askText}` : ''
      ].filter(Boolean).join('\n')
      // 提意见重生成：带着上一版大纲和修改意见，让模型在原稿上改，而不是从零重写。
      const inspiration = feedback
        ? `${brief}\n上一版大纲（大体满意，请在保留整体结构与事件走向的前提下按修改意见调整）：\n${previous.slice(0, 12000)}\n修改意见：${feedback}\n${episodeFormat}`
        : `${brief}\n${episodeFormat}`
      body = { inspiration, genre: form.genre, style: `共 ${form.episodes} 集，每集 ${minuteText}`, workId: form.workId || undefined, skillId, model }
    } else if (type === 'polish') {
      const source = documentText(form.content) || previous
      body = feedback
        ? { content: `原文：\n${source}\n上一版润色结果：\n${previous}\n修改意见：${feedback}\n请在上一版基础上按修改意见继续调整，输出修改后的完整文本。`, style: form.style, skillId, model }
        : { content: source, style: form.style, skillId, model }
    } else if (type === 'storyboard') {
      const script = documentText(form.script)
      body = feedback
        ? { script: `剧本文本：\n${script}\n上一版分镜：\n${previous}\n修改意见：${feedback}\n请按修改意见重写分镜，保持场次与镜号结构，保留景别/运镜/时长/画面/台词/音效转场。`, style: form.sbStyle, workId: form.workId || undefined, skillId, model }
        : { script, style: form.sbStyle, workId: form.workId || undefined, skillId, model }
    } else {
      // 嵌入态（写稿页）续写：把该集事件卡 + 人物卡 + 关系状态 + 上一章末尾一并交给 AI，
      // 避免只给一句要求、正文与大纲脱节。
      const prompt = feedback
        ? `${form.chapterTitle}\n上一版正文：\n${previous}\n修改意见：${feedback}\n请在上一版基础上按修改意见改写，保持动作与对白推进、700-900 字，只写这一集，结尾留具体钩子。`
        : props.embedded
          ? continuationPrompt({ title: form.chapterTitle, chapterNo: props.chapterNo, outline: props.outline, ledger: props.ledger, volumes: props.volumes, prevChapter: props.prevChapter, prevSummaries: props.prevSummaries, currentContent: props.currentContent, requirement: form.prompt })
          : `${form.chapterTitle}\n${form.prompt}`
      body = { prompt, workId: form.workId || undefined, type: 'script', skillId, model }
    }
    // 流式生成：delta 逐块追加，实现打字机式实时输出。
    if (api.value.generateStream) {
      const response = await api.value.generateStream(type, body, delta => { results[type] += delta })
      if (type === 'outline') {
        outlineIncomplete.value = Boolean(response.truncated)
        if (response.truncated) error.value = '大纲达到生成长度上限，请减少集数后重新生成。'
      }
      // 大纲整体为 JSON 对象时转结构化大纲文本（对齐 App 端兜底解析）。
      if (type === 'outline' && results[type]?.trim()) {
        try {
          const parsed = JSON.parse(results[type])
          if (parsed && typeof parsed === 'object') results[type] = outlineToText(parsed)
        } catch { /* 非 JSON 文本直接保留流式结果 */ }
      }
    } else {
      const output = await api.value.generate(type, body)
      const raw = output.content || output.outline
      const content = raw && typeof raw === 'object' ? outlineToText(raw) : typeof raw === 'string' ? raw : ''
      if (typeof content !== 'string' || !content.trim()) throw new Error('本次未返回生成内容，请重试')
      results[type] = content
      if (type === 'outline') outlineIncomplete.value = Boolean(output.truncated)
    }
    // 规则版生成后核查（模型档暂缓）：正文过短、大纲缺事件卡时提示，不阻断。
    if (type === 'write' && props.embedded) {
      const issues = checkGenerationRules({ outline: props.outline, chapters: [{ content: results.write }], ledger: props.ledger })
      if (issues.length) ElMessage.warning(`生成后核查：${issues.join('；')}`)
    }
  } catch (failure) { error.value = failure.message; if (failure.message && failure.message.includes('积分不足')) await promptExchange(); else await handleError(failure) }
  finally { generating.value = false; await loadQuota() }
}
// 「重新生成」两个入口：完整重写，或带着当前结果提意见再生成。
async function regenerate() {
  if (generating.value || props.insertDisabled) return
  let feedbackMode = false
  try {
    await ElMessageBox.confirm('重新生成会覆盖当前结果。选择生成方式：', '重新生成', { confirmButtonText: '完整重新生成', cancelButtonText: '提意见重新生成', distinguishCancelAndClose: true })
  } catch (action) {
    if (action === 'cancel') feedbackMode = true
    else return
  }
  if (!feedbackMode) { await generate(); return }
  let feedback = ''
  try {
    const result = await ElMessageBox.prompt('写下修改意见，会和当前生成结果一起提交给 AI：', '提意见重新生成', { confirmButtonText: '按意见重新生成', cancelButtonText: '取消', inputType: 'textarea', inputPlaceholder: '例如：第 3 集冲突不够，人物动机要更明确…', inputValidator: value => (value || '').trim().length >= 2 || '请至少写 2 个字' })
    feedback = (result.value || '').trim()
  } catch { return }
  if (!feedback) return
  await generate(feedback)
}
// 「按大纲生成各章」两个来源：本次 AI 输出，或左侧保存并修改过的剧本大纲。
async function chooseFillOutline() {
  const saved = (props.outline || '').trim()
  if (!saved) { emit('fill-outline', displayResult.value); return }
  let source = displayResult.value
  try {
    await ElMessageBox.confirm('用哪一份大纲生成各章？「剧本大纲」是左侧保存、可修改的版本；「当前输出」是本次 AI 生成的结果。', '根据大纲生成各章', { confirmButtonText: '用当前输出', cancelButtonText: '用剧本大纲', distinguishCancelAndClose: true })
  } catch (action) {
    if (action === 'cancel') source = saved
    else return
  }
  emit('fill-outline', source)
}
async function adopt() {
  if (!result.value || copying.value) return
  copying.value = true
  try {
    if (!form.workId) { await navigator.clipboard.writeText(displayResult.value); ElMessage.success('已复制生成内容') }
    else { const detail = await api.value.getWork(form.workId); if (detail.work.status === 'reviewing') throw new Error('作品正在审核中，暂不可编辑'); nextChapterNo.value = (detail.chapters || []).length + 1; adopted.value = displayResult.value; editorVisible.value = true }
  } catch (failure) { await handleError(failure) }
  finally { copying.value = false }
}
async function copyResult() {
  if (!result.value || copying.value) return
  copying.value = true
  try { await navigator.clipboard.writeText(displayResult.value); ElMessage.success('已复制生成内容') }
  catch (failure) { await handleError(failure) }
  finally { copying.value = false }
}
async function loadRecords() {
  recordLoading.value = true; recordError.value = ''
  try { records.value = await api.value.listAiRecords() }
  catch (failure) { recordError.value = failure.message; await handleError(failure) }
  finally { recordLoading.value = false }
}
watch(tab, value => {
  error.value = ''
  loadQuota()
  if (value === 'log') loadRecords()
  else if (form.skillId && !visibleSkills.value.some(s => String(s.id) === String(form.skillId))) form.skillId = ''
})
watch(() => props.insertDisabled, (disabled, previous) => { if (previous && !disabled) loadQuota() })
watch(() => props.workId, value => { if (props.embedded) form.workId = value || '' }, { immediate: true })
watch(user, value => { if (value?.userId) loadQuota() }, { immediate: true })
// 积分余额实时刷新：组件常驻时 onMounted 只执行一次，补上页面切回/窗口聚焦时的重取。
function refreshQuotaWhenVisible() {
  if (document.visibilityState === 'visible') loadQuota()
}
// 充值成功后刷新余额（充值面板与 AI 面板是兄弟组件，用窗口事件解耦）。
function refreshAfterRecharge() { loadQuota() }
onMounted(() => {
  loadQuota()
  loadSkills()
  loadModels()
  document.addEventListener('visibilitychange', refreshQuotaWhenVisible)
  window.addEventListener('focus', refreshQuotaWhenVisible)
  window.addEventListener('recharge-success', refreshAfterRecharge)
})
onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', refreshQuotaWhenVisible)
  window.removeEventListener('focus', refreshQuotaWhenVisible)
  window.removeEventListener('recharge-success', refreshAfterRecharge)
})
</script>
