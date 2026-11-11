<template>
  <section class="creation-workspace" aria-label="创作上传">
    <h1 class="sr-only">创作上传</h1>
    <header class="creation-header">
      <button class="creation-back" aria-label="返回我的作品" @click="goWorks">← <span>返回</span></button>
      <input v-model="form.title" class="creation-title" aria-label="作品名称" maxlength="100" placeholder="未命名剧本（点击输入）" :disabled="busy || !editable" :readonly="readOnly" />
      <div class="creation-selectors">
        <select class="creation-work-select" aria-label="选择作品" :value="route.query.workId || createdId || ''" :disabled="busy || !!worksError" @change="switchWork"><option value="">新建作品</option><option v-if="createdId && !works.some(work => work.workId === createdId)" :value="createdId">{{ form.title || '未命名作品' }}</option><option v-for="work in works" :key="work.workId" :value="work.workId">{{ work.workId === createdId ? form.title || work.title : work.title }}</option></select>
      </div>
      <span class="creation-save-state" role="status" :class="{ bad: storageFailed }">{{ generatingChapters ? draftStatus : busy ? (importing ? '正在导入…' : '正在保存…') : draftStatus }}</span>
      <div class="creation-actions">
        <button class="btn quiet sm" :disabled="busy || !editable || readOnly" @click="settingsVisible = true"><el-icon><Setting /></el-icon> 作品设置</button>
        <button class="btn quiet sm" :disabled="busy || !editable || readOnly" @click="fileInput.click()"><el-icon><Upload /></el-icon> 导入剧本</button>
        <button class="btn ghost sm" :disabled="busy || !editable" @click="save(false)">保存草稿</button>
        <button class="btn sm" :disabled="busy || !editable || readOnly" @click="save(true)">提交审核</button>
      </div>
    </header>
    <div v-if="error" class="creation-error note bad" role="alert">{{ error }}</div>
    <div v-if="worksError" class="creation-error note bad" role="alert">{{ worksError }}<button class="text-button" @click="loadWorks">重新加载作品</button></div>
    <div v-if="loadedWork?.status === 'reviewing'" class="creation-error note info" role="status">作品正在审核中，暂不可编辑；你可以选择其他作品继续创作。</div>
    <div class="creation-mobile-tools"><button class="btn quiet sm" @click="directoryVisible = true">☰ 分集与资料</button><span>{{ chapters.length }} 集 · {{ totalWords.toLocaleString() }} 字</span><button class="btn quiet sm" @click="aiVisible = true">✦ AI 助手</button></div>
    <div class="creation-columns">
      <aside class="creation-directory" aria-label="分集与资料"><DirectoryContents /></aside>
      <div class="creation-editor">
        <div class="editor-location"><span>{{ section === 'summary' ? '作品资料 / 故事简介' : section === 'outline' ? '作品资料 / 剧本大纲' : section === 'characters' ? '作品资料 / 人物便签' : '正文分集 / 第 ' + (activeChapter + 1) + ' 集' }}</span><span>{{ wordCount(currentText).toLocaleString() }} 字</span><div class="view-mode" role="group" aria-label="创作模式"><button type="button" :aria-pressed="!readOnly" :disabled="busy" @click="readOnly = false">编辑</button><button type="button" :aria-pressed="readOnly" :disabled="busy" @click="readOnly = true">阅读</button></div></div>
        <div v-if="section === 'chapter'" class="chapter-trial-setting"><el-switch v-model="currentChapter.isFree" active-value="1" inactive-value="0" aria-label="设为试读章节（免费阅读）" :disabled="busy || !editable || readOnly" /><span>设为试读章节（免费阅读）</span><small>保存后请在作品详情发布章节，作品通过审核后读者可免费阅读</small></div>
        <ScriptEditor v-if="section === 'chapter'" ref="scriptEditor" :key="currentChapter.draftId" v-model="currentChapter.content" v-model:title="currentChapter.chapterTitle" :disabled="busy || !editable" :read-only="readOnly" />
        <div v-else class="script-paper notes-paper"><h2>{{ section === 'summary' ? '故事简介' : section === 'outline' ? '剧本大纲' : '人物便签' }}</h2><p class="notes-description">{{ section === 'summary' ? '用一段话讲清人物、冲突与故事走向，保存时同步至作品简介。' : section === 'outline' ? 'AI 剧本生成的每集事件卡会存到这里：可在此直接修改，再回到 AI 面板按这份大纲生成各章。大纲随保存草稿在本机存档。' : '记录人物关系、动机与成长线，保存时同步到作品台账（PC 与 App 共用）。' }}</p><textarea v-if="section === 'summary'" v-model="form.summary" aria-label="故事简介" :disabled="busy || !editable" :readonly="readOnly" placeholder="这个故事从谁开始，又将走向哪里？" /><textarea v-else-if="section === 'outline'" v-model="scriptOutline" class="outline-textarea" aria-label="剧本大纲" :disabled="busy || !editable" :readonly="readOnly" placeholder="AI 剧本生成的分集事件卡会出现在这里，也可以自己写一份骨架：第1集：事件名 / 本集事件 / 冲突与推进 / 结果或反转 / 结尾钩子" /><textarea v-else v-model="characters" aria-label="人物便签" :disabled="busy || !editable" :readonly="readOnly" placeholder="姓名 / 身份 / 性格 / 人物关系…" /><div v-if="section === 'characters'" class="ledger-block"><h3>创作台账（其余七类）</h3><p class="cost">台账存服务器、三端共用；续写与「按大纲生成各章」时自动注入。道具档案的件数与「已交付给谁」是全书唯一依据，写法基线一旦定下就不要改，否则读者会觉得换了写手。</p><label class="field">人物关系<textarea v-model="ledger.relations" :disabled="busy || !editable" :readonly="readOnly" placeholder="例如：顾守山—顾星宇：父子，因旧案生隙" /></label><label class="field">伏笔（埋在哪集/是否回收）<textarea v-model="ledger.foreshadow" :disabled="busy || !editable" :readonly="readOnly" placeholder="例如：第3集铜铃——第9集已回收" /></label><label class="field">时间线<textarea v-model="ledger.timeline" :disabled="busy || !editable" :readonly="readOnly" placeholder="例如：第1集 雨夜；第2集 次日清晨" /></label><label class="field">物品位置<textarea v-model="ledger.items" :disabled="busy || !editable" :readonly="readOnly" placeholder="例如：铜铃在顾星宇房梁上" /></label><label class="field">重要道具档案（名称｜件数｜持有人｜状态｜外观）<textarea v-model="ledger.props" :disabled="busy || !editable" :readonly="readOnly" placeholder="一行一件，例如：傩面具｜十二面｜顾守山｜在手｜明代木雕；铜钥匙｜1把｜雷老幺｜已交付给吴德贵｜黄铜" /></label><label class="field">写法基线（人称/句式/对白比例/禁用写法）<textarea v-model="ledger.styleGuide" :disabled="busy || !editable" :readonly="readOnly" placeholder="例如：第三人称限知；短句为主；对白占六成；不用全角括号补叙，不写场景头" /></label><label class="field">未解线索<textarea v-model="ledger.threads" :disabled="busy || !editable" :readonly="readOnly" placeholder="例如：老照片背面的人是谁" /></label></div><div v-if="section === 'outline'" class="row top-gap"><button class="btn ghost sm" :disabled="!scriptOutline.trim()" @click="copyOutline">复制大纲</button><button class="btn ghost sm" :disabled="busy || !editable || readOnly || !scriptOutline.trim()" @click="clearOutline">清空</button><button class="btn sm" style="margin-left:auto" :disabled="busy || !editable || readOnly || !scriptOutline.trim() || planningOutline || generatingChapters" @click="fillOutline(scriptOutline)">根据当前剧本大纲生成各章</button></div><button v-if="section === 'characters'" class="btn ghost sm" :disabled="!characters.trim()" @click="exportNotes()">导出人物便签</button><details v-if="section === 'characters' && noteBackups.length" class="notes-backups"><summary>已保存作品的便签存档</summary><button v-for="note in noteBackups" :key="note.title" @click="exportNotes(note.characters, note.title)">下载 · {{ note.title }}</button></details></div>
        <footer class="editor-footer"><span>{{ readOnly ? '阅读模式 · 内容不可编辑' : section === 'chapter' ? '格式随正文保存 · Ctrl+Z 撤销 · Ctrl+B 加粗' : '让故事的骨架更清晰' }}</span><span>共 {{ chapters.length }} 集 · {{ totalWords.toLocaleString() }} 字</span></footer>
      </div>
      <aside class="creation-ai" aria-label="AI 编剧助手"><AiStudio v-if="!compactAi" :key="workspaceRevision" embedded :workspace-state="aiState" :insert-disabled="busy || !editable || readOnly" :current-content="currentChapter.content" :outline="scriptOutline" :ledger="ledger" :volumes="volumes" :prev-chapter="prevChapterText" :prev-summaries="prevSummaries" :chapter-no="activeChapter + 1" :work-id="createdId" @insert="insertAi" @fill-outline="fillOutline" @create-outline="applyOutline" /></aside>
    </div>
    <input ref="fileInput" class="sr-only creation-file-input" type="file" accept=".docx,.txt,.md" :disabled="busy || !editable || readOnly" @change="importFile($event.target.files[0]); $event.target.value = ''" />
    <PortalLayer v-model="directoryVisible" title="分集与资料" size="min(300px, 92vw)"><div class="creation-directory directory-drawer"><DirectoryContents /></div></PortalLayer>
    <PortalLayer v-model="aiVisible" title="AI 编剧助手" size="min(370px, 96vw)"><div class="creation-ai ai-drawer"><AiStudio v-if="compactAi" :key="workspaceRevision" embedded :workspace-state="aiState" :insert-disabled="busy || !editable || readOnly" :current-content="currentChapter.content" :outline="scriptOutline" :ledger="ledger" :volumes="volumes" :prev-chapter="prevChapterText" :prev-summaries="prevSummaries" :chapter-no="activeChapter + 1" :work-id="createdId" @insert="insertAi" @fill-outline="fillOutline" @create-outline="applyOutline" /></div></PortalLayer>
    <PortalLayer v-model="settingsVisible" title="作品设置" size="min(480px, 96vw)"><div class="panel-content"><label class="field">书名<input v-model="form.title" maxlength="100" :disabled="busy" /></label><label class="field">简介<textarea v-model="form.summary" :disabled="busy" /></label><p class="cost">封面可在保存草稿后的作品详情中补充。提交审核后，作品将在审核期间锁定编辑。</p><button class="btn sm" @click="settingsVisible = false">完成设置</button></div></PortalLayer>
  </section>
</template>
<script setup>
import { computed, defineComponent, h, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Document, User, Upload, Setting, Plus, Notebook } from '@element-plus/icons-vue'
import { usePortal } from '../../utils/portal.js'
import { canEdit, validateWork, validateChapter, wordCount, outlineChapters, planOutlineChapters } from '../../utils/creator.js'
import { readDraft } from '../../utils/draft.js'
import { documentText } from '../../utils/document.js'
import {
  chapterTail, episodeCardFrom, chapterSummaryBlock, checkGenerationRules,
  ledgerPromptBlockByCast, volumeSnapshotBlock, episodeCastFrom, castFromCharacters,
  stripRepeatedTail, stripRepeatedHead, clampEpisodeText, EPISODE_TEXT_MAX, splitOutlineSections,
  rosterFromCharacters, stateGuardBlock, auditEpisodeState,
} from '../../utils/creatorAi.js'
import ScriptEditor from '../../components/ScriptEditor.vue'
import PortalLayer from '../../components/PortalLayer.vue'
import AiStudio from './AiStudio.vue'
import '../../assets/styles/creation.css'

const { api, user, canCreate, goWork, goWorks, handleError } = usePortal()
const route = useRoute()
const router = useRouter()
const form = reactive({ title: '', summary: '', scriptUrl: '', scriptName: '', scriptSize: 0 })
const newChapter = number => ({ draftId: crypto.randomUUID(), chapterTitle: `第 ${number} 集`, content: '', isFree: '0' })
const sameChapter = (a, b) => a && b && a.chapterTitle === b.chapterTitle && a.content === b.content && a.isFree === b.isFree
const chapters = ref([newChapter(1)])
const characters = ref('')
// 创作台账（跨端共享，落 sys_work_ledger）：故事简介 / 主要人物 / 人物关系 / 伏笔 / 时间线 / 物品位置 / 未解线索。
// 故事简介与人物走上面的编辑区，其余四类在本页「人物便签」下方的台账区直接编辑。
const ledger = reactive({ storySummary: '', characters: '', relations: '', foreshadow: '', timeline: '', items: '', props: '', styleGuide: '', threads: '' })
// 卷级状态快照（每 10 集一卷）：续写时注入「本卷 + 上卷」，替代整份台账。
const volumes = ref([])
// 批量成章后待验收的集数：保存成功后据此逐集跑验收与卷末快照。
const batchPendingReview = ref(0)
async function loadVolumes(id) {
  if (!id || !api.value?.listWorkVolumes) return
  try { volumes.value = (await api.value.listWorkVolumes(id)) || [] } catch { volumes.value = [] }
}
// 剧本大纲：AI 剧本生成的分集事件卡，与故事简介/人物便签并列，保存在本机并按作品区分。
const scriptOutline = ref('')
const noteBackups = ref([])
const newAiState = () => ({ tab: 'outline', outlineIncomplete: false, form: { workId: '', genre: '', episodes: 12, prompt: '', content: '', style: '增强画面感', chapterTitle: '', skillId: '', script: '', sbStyle: '电影感' }, results: { outline: '', write: '', polish: '', storyboard: '' } })
const aiState = reactive(newAiState())
const workspaceRevision = ref(0)
const activeChapter = ref(0)
const section = ref('chapter')
const readOnly = ref(false)
const currentChapter = computed(() => chapters.value[activeChapter.value])
const currentText = computed(() => section.value === 'summary' ? form.summary : section.value === 'outline' ? scriptOutline.value : section.value === 'characters' ? characters.value : currentChapter.value.content)
const totalWords = computed(() => chapters.value.reduce((count, chapter) => count + wordCount(chapter.content), 0))
const works = ref([])
const worksError = ref('')
const loadedWork = ref(null)
const workLoadFailed = ref(false)
const editable = computed(() => canCreate.value && !workLoadFailed.value && (!loadedWork.value || canEdit(user.value, loadedWork.value)))
const error = ref('')
const saving = ref(false)
const importing = ref(false)
const generatingChapters = ref(false)
const planningOutline = ref(false)
const initializing = ref(true)
const busy = computed(() => saving.value || importing.value || initializing.value || generatingChapters.value || planningOutline.value)
const fileInput = ref(null)
const scriptEditor = ref(null)
const directoryVisible = ref(false)
const aiVisible = ref(false)
const settingsVisible = ref(false)
const compactAi = ref(false)
const draftStatus = ref('草稿尚未保存')
const storageFailed = ref(false)
const createdId = ref(null)
const storage = localStorage
const draftBase = `PcUser-CreationDraft:${user.value.userId}`
let draftKey = draftBase
let savedSnapshot = ''
let originalWorkFields = ''
let originalChapters = new Map()
let completed = false
let timer
let media
let ready = false
let disposed = false
let normalizingRoute = false
const snapshot = () => JSON.stringify({ form, chapters: chapters.value, characters: characters.value, outline: scriptOutline.value, createdId: createdId.value })
const workFields = (value = form) => JSON.stringify({ title: value.title, summary: value.summary || '' })
const hasContent = () => Boolean(form.title || form.summary || characters.value || scriptOutline.value || totalWords.value || createdId.value || chapters.value.length > 1 || chapters.value.some(chapter => chapter.isFree === '1'))
function cacheDraft() {
  clearTimeout(timer)
  if (!ready || completed || !editable.value) return
  try {
    if (!hasContent() || snapshot() === savedSnapshot) { storage.removeItem(draftKey); draftStatus.value = createdId.value ? '作品已保存' : '草稿尚未保存'; return }
    const draft = JSON.parse(snapshot())
    storage.setItem(draftKey, JSON.stringify(draft)); storageFailed.value = false; draftStatus.value = '草稿已保存在本机'
  }
  catch { storageFailed.value = true; draftStatus.value = '本机保存失败，请保存草稿' }
}
watch([form, chapters, characters, scriptOutline, createdId], () => {
  if (!ready || completed) return
  draftStatus.value = '正在保存本机草稿…'
  clearTimeout(timer); timer = setTimeout(cacheDraft, 400)
}, { deep: true })

// 目录在桌面和抽屉中复用，业务状态仍由本页统一维护。
const DirectoryContents = defineComponent({ setup() { return () => h('div', { class: 'directory-content' }, [
  h('div', { class: 'directory-info' }, [
    ...[['summary', Document, '故事简介'], ['outline', Notebook, '剧本大纲'], ['characters', User, '人物便签']].map(([value, icon, label]) => h('button', { class: { selected: section.value === value }, onClick: () => selectSection(value) }, [h(icon, { class: 'directory-icon' }), label]))
  ]),
  h('div', { class: 'directory-heading' }, [h('h2', '正文分集'), h('button', { title: '新建分集', 'aria-label': '新建分集', disabled: busy.value || !editable.value || readOnly.value, onClick: addChapter }, [h(Plus, { class: 'directory-icon' }), '新建'])]),
  h('nav', { class: 'episode-list', 'aria-label': '正文分集' }, chapters.value.map((chapter, index) => h('div', { key: chapter.draftId, class: ['episode-card', { selected: section.value === 'chapter' && activeChapter.value === index }] }, [
    h('button', { class: 'episode-select', 'aria-current': section.value === 'chapter' && activeChapter.value === index ? 'page' : undefined, onClick: () => { activeChapter.value = index; selectSection('chapter') } }, [h('span', { class: 'episode-index' }, String(index + 1).padStart(2, '0')), h('span', { class: 'episode-name' }, chapter.chapterTitle || '未命名分集'), h('small', `${wordCount(chapter.content)} 字${chapter.isFree === '1' ? ' · 试读' : ''}`)]),
    h('button', { class: 'episode-delete', title: '删除分集', 'aria-label': `删除分集：${chapter.chapterTitle || '未命名分集'}`, disabled: busy.value || !editable.value || readOnly.value || chapters.value.length <= 1, onClick: () => removeChapter(index) }, '删除')
  ]))),
  h('div', { class: 'create-upload directory-upload' }, [h('button', { class: 'directory-drop', disabled: busy.value || !editable.value || readOnly.value, onClick: () => fileInput.value.click(), onDragover: event => event.preventDefault(), onDrop: event => { event.preventDefault(); importFile(event.dataTransfer.files[0]) } }, [h(Upload, { class: 'upload-icon' }), h('b', importing.value ? '正在读取剧本…' : '导入本地剧本'), h('span', '点击选择，或拖拽文件到这里'), h('small', '.docx / .txt / .md · 最大 10 MB')]), form.scriptName ? h('p', { class: 'import-file-name' }, form.scriptName) : null, form.scriptName ? h('p', { class: 'cost' }, `已读取 ${totalWords.value.toLocaleString()} 字 · 导入到当前分集`) : null])
]) } })
function selectSection(value) { section.value = value; directoryVisible.value = false }

// 当前分集的上一章末尾（续写注入锚点）。
const prevChapterText = computed(() => {
  const index = activeChapter.value
  return index > 0 ? (chapters.value[index - 1]?.content || '') : ''
})

// 当前集之前已落库的章节摘要（最多 4 章、合计 ≤1200 字），补上"前几章摘要"这一环。
const prevSummaries = computed(() => chapterSummaryBlock(chapters.value, activeChapter.value + 1))

// 该集事件卡 → 章节摘要（每集一条，≤500 字，落 sys_work_chapter.summary，供下一章续写注入）。
function summaryOfEpisode(title, no) {
  const card = episodeCardFrom(scriptOutline.value, title, no)
  if (!card) return ''
  const lines = card.split('\n')
    .filter(line => /本集事件|冲突|结果|钩子/.test(line))
    .map(line => line.replace(/^[^：:]*[：:]/, '').trim())
    .filter(Boolean)
  const text = (lines.length ? lines.join('；') : card.replace(/^第\s*\d+\s*集[：:]/, '')).trim()
  return text.length > 500 ? text.slice(0, 500) : text
}

// 读取作品台账：后端有值优先；本地为空时回填到编辑区，避免覆盖作者正在写的内容。
async function loadLedger(id) {
  if (!id || !api.value?.getWorkLedger) return
  try {
    const remote = await api.value.getWorkLedger(id)
    if (!remote) return
    ledger.storySummary = remote.storySummary || ''
    ledger.characters = remote.characters || ''
    ledger.relations = remote.relations || ''
    ledger.foreshadow = remote.foreshadow || ''
    ledger.timeline = remote.timeline || ''
    ledger.items = remote.items || ''
    ledger.props = remote.props || ''
    ledger.styleGuide = remote.styleGuide || ''
    ledger.threads = remote.threads || ''
    if (ledger.storySummary && !form.summary.trim()) form.summary = ledger.storySummary
    if (ledger.characters && !characters.value.trim()) characters.value = ledger.characters
  } catch { /* 台账读不到不阻塞创作；保存时会再写一次 */ }
}

// 保存台账：故事简介与人物取当前编辑区，关系/伏笔/时间线/物品/线索取台账区。
async function saveLedger() {
  if (!createdId.value || !api.value?.saveWorkLedger) return true
  try {
    await api.value.saveWorkLedger(createdId.value, {
      storySummary: form.summary,
      // 关系已单列在 relations；人物卡剥离「人物关系」段，避免注入时重复。
      characters: String(characters.value || '').replace(/人物关系\s*\n[\s\S]*$/, '').trim() || characters.value,
      relations: ledger.relations,
      foreshadow: ledger.foreshadow,
      timeline: ledger.timeline,
      items: ledger.items,
      props: ledger.props,
      styleGuide: ledger.styleGuide,
      threads: ledger.threads,
    })
    ledger.storySummary = form.summary
    ledger.characters = characters.value
    return true
  } catch (failure) { ElMessage.warning('台账保存失败：' + (failure.message || '请稍后重试')); return false }
}
function addChapter() { if (busy.value || !editable.value || readOnly.value) return; chapters.value.push(newChapter(chapters.value.length + 1)); activeChapter.value = chapters.value.length - 1; selectSection('chapter') }
async function removeChapter(index) {
  if (busy.value || !editable.value || readOnly.value || chapters.value.length <= 1) return
  saving.value = true
  try {
    try { await ElMessageBox.confirm(`删除「${chapters.value[index].chapterTitle || '未命名分集'}」？此操作不可撤销。`, '删除分集', { confirmButtonText: '删除', cancelButtonText: '保留' }) } catch { return }
    const chapter = chapters.value[index]
    if (chapter.chapterId) await api.value.deleteChapter(createdId.value, chapter.chapterId)
    chapters.value.splice(index, 1)
    chapters.value.forEach((item, position) => { if (!item.chapterId && /^第\s*\d+\s*集$/.test(item.chapterTitle)) item.chapterTitle = `第 ${position + 1} 集` })
    if (chapter.chapterId) originalChapters.delete(Number(chapter.chapterId))
    if (index < activeChapter.value) activeChapter.value--
    else if (index === activeChapter.value) activeChapter.value = Math.min(index, chapters.value.length - 1)
    cacheDraft()
  } catch (failure) { await handleError(failure) }
  finally { saving.value = false }
}
async function loadWorks() { worksError.value = ''; try { works.value = await api.value.listWorks() } catch (failure) { worksError.value = '作品列表加载失败，请重试'; await handleError(failure) } }
async function switchWork(event) {
  const target = event.target.value
  event.target.value = String(route.query.workId || createdId.value || '')
  if (busy.value) return
  await router.push({ path: '/works/create', query: target ? { workId: target } : {} })
}
async function pointToWork(id) {
  normalizingRoute = true
  try { await router.replace({ path: '/works/create', query: { workId: id } }); await nextTick() }
  finally { normalizingRoute = false }
}
async function importFile(file) {
  if (!file || busy.value || !editable.value || readOnly.value) return
  const target = currentChapter.value
  importing.value = true; error.value = ''
  try {
    const content = await readDraft(file)
    if (!content.trim()) throw new Error('草稿中没有可导入的正文')
    if (target.content.trim()) { try { await ElMessageBox.confirm('导入的内容将替换当前分集正文，其他分集不受影响。', '导入剧本', { confirmButtonText: '替换正文', cancelButtonText: '取消' }) } catch { return } }
    const uploaded = await api.value.upload(file, 'script')
    if (!uploaded?.url) throw new Error('上传响应缺少文件地址，请重试')
    target.content = content
    if (!form.title.trim()) form.title = file.name.replace(/\.[^.]+$/, '').slice(0, 100)
    form.scriptUrl = uploaded?.url || ''; form.scriptName = file.name; form.scriptSize = file.size
    selectSection('chapter'); cacheDraft(); ElMessage.success('已导入当前分集，可继续编辑')
  } catch (failure) { error.value = failure.message; await handleError(failure) }
  finally { importing.value = false }
}
async function insertAi(content) {
  if (busy.value || !editable.value || readOnly.value) return
  const target = currentChapter.value
  section.value = 'chapter'; await nextTick(); scriptEditor.value.appendText(content)
  aiVisible.value = false; ElMessage.success('已插入当前分集末尾')
  await syncChapterSummary(target)
}
// 方案 2：正文定稿后单独一次 AI 调用，产出本章摘要 + 台账更新，由后端落库；正文本身不做任何改动。
// 只有已保存过的章节（有 chapterId）才触发；新章先保存再插入时才生成摘要。
async function syncChapterSummary(chapter) {
  if (!createdId.value || !chapter?.chapterId || !api.value?.summarizeChapter) return
  const content = documentText(chapter.content || '')
  if (content.trim().length < 50) return
  // 这一步要读完正文再调一次模型，约半分钟；先挂个不自动关闭的提示，避免看起来卡住。
  const pending = ElMessage({ message: '正在生成本章摘要与创作台账，约半分钟…', type: 'info', duration: 0 })
  try {
    const result = await api.value.summarizeChapter(createdId.value, chapter.chapterId, content)
    pending.close()
    if (result?.summary) {
      // 回写到本地章节，下一章的 prevSummaries 才能立刻用上这条摘要（否则要重新加载作品才有）。
      chapter.summary = result.summary
      const base = originalChapters.get(Number(chapter.chapterId))
      if (base) base.summary = result.summary
      ElMessage.success('已更新本章摘要与创作台账')
    }
    // 摘要写完紧接着验收（5 项判定，≥4 项通过），不通过只提示、不改正文。
    await reviewAfterWrite(chapter, content)
    await snapshotAtVolumeEnd(chapter)
  } catch (failure) {
    pending.close()
    ElMessage.warning('摘要未更新：' + (failure.message || '请稍后重试'))
  }
}

// 每集验收：人物是否越界 / 是否接住上集钩子 / 时间地点道具是否连续 / 伏笔只增不减 / 是否收束且有钩子。
async function reviewAfterWrite(chapter, content) {
  if (!createdId.value || !chapter?.chapterId || !api.value?.reviewChapter) return
  const pending = ElMessage({ message: '正在验收本集连贯性（人物/因果/连续性/伏笔/结构）…', type: 'info', duration: 0 })
  try {
    const review = await api.value.reviewChapter(createdId.value, chapter.chapterId, content)
    pending.close()
    if (!review) return
    if (review.pass) ElMessage.success(`本集验收通过（${review.score}/5）`)
    else ElMessage.warning(`本集验收 ${review.score}/5，建议重写：${review.issues || '详见后端验收记录'}`)
  } catch (failure) {
    pending.close()
    ElMessage.warning('验收未完成：' + (failure.message || '稍后可在生成记录里重试'))
  }
}

// 批量成章后的「正文摘要 → 逐集验收 → 卷末快照」：批量路径此前完全不调用，50 集生成后
// 验收表与卷快照恒为 0；摘要也不能只靠事件卡拼，否则卷快照记的是计划而不是写出来的内容。
async function runBatchReview(count) {
  if (!createdId.value || !api.value?.reviewChapter) return
  const targets = chapters.value.filter(chapter => chapter.chapterId).slice(-Number(count || 0))
  if (!targets.length) return
  let done = 0
  let passed = 0
  const failed = []
  for (const chapter of targets) {
    done += 1
    const no = Number(chapter.chapterNo || chapters.value.indexOf(chapter) + 1)
    draftStatus.value = `正在补摘要并验收 ${done}/${targets.length}：${chapter.chapterTitle}`
    try {
      if (api.value.summarizeChapter && documentText(chapter.content).trim()) {
        await api.value.summarizeChapter(createdId.value, chapter.chapterId, chapter.content)
      }
    } catch { failed.push(`第${no}集摘要未生成`) }
    try {
      const review = await api.value.reviewChapter(createdId.value, chapter.chapterId, chapter.content)
      if (review?.pass) passed += 1
      else if (review) failed.push(`第${no}集 ${review.score}/5`)
    } catch { failed.push(`第${no}集验收未完成`) }
    if (no % 10 === 0 && api.value?.buildVolumeSnapshot) {
      try { await api.value.buildVolumeSnapshot(createdId.value, Math.ceil(no / 10)) } catch { failed.push(`第${no}集卷快照未生成`) }
    }
  }
  await loadVolumes(createdId.value)
  if (failed.length) ElMessage.warning(`逐集验收完成：${passed}/${targets.length} 通过；${failed.slice(0, 3).join('，')}${failed.length > 3 ? ' 等' : ''}`)
  else ElMessage.success(`逐集验收完成：${passed}/${targets.length} 通过，摘要与卷快照已补齐`)
}

// 卷末（第 10/20/30…集）自动生成卷级快照，下一卷续写改用「本卷 + 上卷」注入。
async function snapshotAtVolumeEnd(chapter) {
  const no = Number(chapter?.chapterNo || chapters.value.findIndex(item => item.draftId === chapter?.draftId) + 1)
  if (!no || no % 10 !== 0 || !createdId.value || !api.value?.buildVolumeSnapshot) return
  const volumeNo = Math.ceil(no / 10)
  try {
    await api.value.buildVolumeSnapshot(createdId.value, volumeNo)
    await loadVolumes(createdId.value)
    ElMessage.success(`已生成第${volumeNo}卷状态快照`)
  } catch (failure) {
    ElMessage.warning(`第${volumeNo}卷快照未生成：` + (failure.message || '请稍后重试'))
  }
}
// AI 剧本结果拆成三块：故事简介 / 人物便签（主要人物 + 人物关系）/ 分集事件卡。
// 解析规则集中在 splitOutlineSections（可单测），标题前缀兼容 Markdown 与书名号。
function splitAiOutline(content) {
  return splitOutlineSections(content)
}

// AI 剧本结果分三处落位：简介进「故事简介」、人物进「人物便签」、事件卡进「剧本大纲」。
async function applyOutline(content) {
  if (busy.value || !editable.value || readOnly.value) return
  const text = (content || '').trim()
  if (!text) return
  const parts = splitAiOutline(text)
  const hasSections = Boolean(parts.summary || parts.characters)
  const outlineText = parts.outline || (hasSections ? '' : text)
  const targets = []
  if (parts.summary) targets.push('故事简介')
  if (parts.characters) targets.push('人物便签')
  if (outlineText) targets.push('剧本大纲')
  if (!targets.length) { ElMessage.warning('AI 结果里没有可写入的内容'); return }
  const willOverwrite = (parts.summary && form.summary.trim()) || (parts.characters && characters.value.trim()) || (outlineText && scriptOutline.value.trim())
  if (willOverwrite) {
    try { await ElMessageBox.confirm(`本次 AI 结果将分别写入${targets.join('、')}，其中已有内容会被覆盖，继续吗？`, '写入创作资料', { confirmButtonText: '覆盖', cancelButtonText: '取消' }) } catch { return }
  }
  if (parts.summary) form.summary = parts.summary
  if (parts.characters) characters.value = parts.characters
  if (outlineText) scriptOutline.value = outlineText
  // 三块设定同步进台账：人物卡与关系状态分开存，续写时分别注入。
  if (parts.summary) ledger.storySummary = parts.summary
  const relationPart = (parts.characters.match(/人物关系\s*\n([\s\S]*?)(?:\n\n|$)/) || [])[1]
  if (relationPart?.trim()) ledger.relations = relationPart.trim()
  // 人物卡只存「主要人物」段，关系已在 relations 单列，避免注入时重复。
  if (parts.characters) ledger.characters = parts.characters.replace(/人物关系\s*\n[\s\S]*$/, '').trim() || parts.characters
  section.value = 'outline'
  aiVisible.value = false
  cacheDraft()
  await saveLedger()
  // 规则版生成后核查（模型档暂缓）：只提示，不阻断。
  const issues = checkGenerationRules({ outline: scriptOutline.value, chapters: [], ledger })
  if (issues.length) ElMessage.warning(`生成后核查：${issues.join('；')}`)
  ElMessage.success(`已分别写入${targets.join('、')}，大纲可直接修改后再生成各章`)
}
async function copyOutline() {
  try { await navigator.clipboard.writeText(scriptOutline.value); ElMessage.success('已复制剧本大纲') }
  catch { ElMessage.warning('复制失败，请手动选择文本复制') }
}
async function clearOutline() {
  if (busy.value || !editable.value || readOnly.value) return
  try { await ElMessageBox.confirm('清空剧本大纲？此操作不可撤销。', '清空剧本大纲', { confirmButtonText: '清空', cancelButtonText: '取消' }) } catch { return }
  scriptOutline.value = ''; cacheDraft()
}
async function fillOutline(outline) {
  if (busy.value || !editable.value || readOnly.value) return
  const items = outlineChapters(outline)
  if (!items.length) { ElMessage.warning('大纲章节不完整、编号重复或混有编号列表，请使用统一的分集标题格式重新生成'); return }
  planningOutline.value = true
  if (createdId.value) {
    try {
      const detail = await api.value.getWork(createdId.value)
      const remote = detail.chapters || []
      const saved = chapters.value.filter(chapter => chapter.chapterId)
      if (!canEdit(user.value, detail.work) || remote.length !== saved.length || saved.some(chapter => {
        const current = remote.find(row => Number(row.chapterId) === Number(chapter.chapterId))
        const original = originalChapters.get(Number(chapter.chapterId))
        return !current || !original || Number(current.chapterNo) !== Number(chapter.chapterNo) || !sameChapter(current, original)
      })) throw new Error('作品或章节已在其他页面变更，请刷新确认后再生成')
    } catch (failure) { planningOutline.value = false; error.value = failure.message || '无法核对作品章节，请重试'; await handleError(failure); return }
  }
  const plan = planOutlineChapters(items, chapters.value)
  const pending = plan.filter(item => item.action === 'fill' || item.action === 'create')
  const preview = h('div', { style: 'max-height: 45vh; overflow-y: auto; white-space: pre-wrap' }, [
    h('p', `请核对识别结果及章节序号。将生成 ${pending.length} 章，每章按实际 token 扣除积分；单章超出字数上限时可确认续写。生成后请检查并保存草稿。`),
    h('p', '纯编号格式可能与剧情列表混淆，请逐项核对。'),
    ...plan.map(item => h('p', `${item.title}：${item.action === 'conflict' ? '冲突，跳过' : item.action === 'skip' ? '跳过' : item.action === 'fill' ? '填充' : '新建'} — ${item.reason}`))
  ])
  if (!pending.length) { try { await ElMessageBox.alert(preview, '章节匹配结果', { confirmButtonText: '知道了' }) } catch { /* 关闭对话框 */ } finally { planningOutline.value = false }; return }
  try { await ElMessageBox.confirm(preview, '确认章节匹配结果', { confirmButtonText: '开始生成', cancelButtonText: '取消' }) } catch { planningOutline.value = false; return }
  generatingChapters.value = true
  planningOutline.value = false
  let completedCount = 0
  // 人物白名单与「人/事/物」铁律：清单在循环外算一次，每集都注入，生成后再核查。
  const rosterNames = rosterFromCharacters(characters.value || ledger.characters)
  const stateIssues = []
  // 名单外人物跨集计数：只在单集露面的临时配角允许存在，跨两集以上复用才算挤进主线。
  const strangerUsage = new Map()
  try {
    for (const item of pending) {
      draftStatus.value = `正在生成 ${completedCount + 1}/${pending.length}：${item.title}`
      // 本集事件卡与出场名单：只注入本集出场者的人物设定，避免模型自由改名换人。
      const episodeNo = Number((item.title.match(/第\s*(\d{1,3})\s*集/) || [])[1]) || completedCount + 1
      const card = episodeCardFrom(outline, item.title, episodeNo) || item.summary || ''
      const cast = episodeCastFrom(card)
      const castList = cast.length ? cast : castFromCharacters(characters.value || ledger.characters, card)
      const ledgerText = ledgerPromptBlockByCast(ledger, castList)
      const guardBlock = stateGuardBlock({ roster: rosterNames, items: ledger.items, props: ledger.props, timeline: ledger.timeline, styleGuide: ledger.styleGuide })
      // 卷级快照优先于整份台账，50 集量级下只注入本卷与上卷。
      const volumeText = volumeSnapshotBlock(volumes.value, episodeNo)
      // 上一章末尾是「本集开场要接着写的起点」，不是要避开的雷区：先给正面承接要求，再给三种允许换场的例外。
      const prevText = completedCount > 0 ? chapterTail(chapters.value[chapters.value.length - 1]?.content, 500) : ''
      const summaryBlock = chapterSummaryBlock(chapters.value, episodeNo)
      const settingBlock = String(characters.value || '').trim()
        ? `【人物设定（姓名与身份固定，不得改名，不得新增未设定的人物）】\n${chapterTail(characters.value, 900)}`
        : ''
      const prompt = `请把下面这集写成一集完整剧本：700-900 字（超过 1000 字即不合格），以动作和对白推进，对白用“角色：台词”；沿用台账里的写法基线（人称、句式、对白与叙述比例、标点一致），用叙述和动作补足信息，不要用全角括号补叙，不要写整段心理独白；开头一句自然交代地点和时间，不要写场景头、镜号、景别、运镜；结尾留一个具体钩子，且钩子必须是本集新发生的事。只写这一集。\n集名：${item.title}\n全剧事件卡：\n${outline}\n本集事件卡：\n${item.summary}`
        + (guardBlock ? '\n\n' + guardBlock : '')
        + (settingBlock ? '\n\n' + settingBlock : '')
        + (summaryBlock ? '\n\n' + summaryBlock : '')
        + (volumeText ? '\n\n' + volumeText : '')
        + (ledgerText ? '\n\n' + ledgerText : '')
        + (prevText ? `\n\n【上一章结尾（本集第一段从这里往下接着写）】\n${prevText}\n本集开场直接承接上面最后一个动作或悬念，用它的结果往下推；人物、事件、道具的状态只能通过情节自然过渡变化。只有三种情况可以直接换场：上一集事件已经收束、本集开启另一个过渡事件、本集切到另一视角继续同一事件。` : '')
      let output = await api.value.generateStream('write', { prompt, workId: createdId.value || undefined, type: 'script' }, () => {})
      if (disposed) return
      let chapter = item.chapter
      if (chapter && !chapter.chapterId && chapters.value.length === 1 && chapter.chapterTitle === '第 1 集' && !documentText(chapter.content).trim()) chapter.chapterTitle = item.title
      if (!chapter) {
        const placeholder = chapters.value.length === 1 && !chapters.value[0].chapterId && chapters.value[0].chapterTitle === '第 1 集' && !documentText(chapters.value[0].content).trim()
        chapter = placeholder ? chapters.value[0] : newChapter(chapters.value.length + 1)
        chapter.chapterTitle = item.title
        if (!placeholder) chapters.value.push(chapter)
      }
      let generated = output.content
      let continueRounds = 0
      while (true) {
        chapter.content = generated
        cacheDraft()
        if (storageFailed.value) throw new Error('本机草稿保存失败，请先保存已生成内容')
        if (!output.truncated) break
        // 最多续写 2 次：再多就是模型在扩写，字数必然失控（实测单集可到 5000 字）。
        if (continueRounds >= 2) break
        try {
          await ElMessageBox.confirm(`「${item.title}」达到单次生成长度上限，已有内容已保存在本机。续写会再按实际 token 扣一次积分，是否继续？`, '章节需要续写', { confirmButtonText: '续写本章', cancelButtonText: '暂时停止' })
        } catch {
          error.value = `「${item.title}」尚未写完，已保留已生成的内容；后续章节尚未生成。`
          return
        }
        continueRounds += 1
        draftStatus.value = `正在续写：${item.title}`
        const continuation = `请从已有正文末尾接着写完“${item.title}”这一集剧本，700-900 字，保持动作与对白推进，不要重复已有正文、不要写场景头或镜头术语。\n全剧事件卡：\n${outline}\n本集事件卡：\n${item.summary}\n已有正文末尾：\n${generated.slice(-3000)}`
          + (guardBlock ? '\n\n' + guardBlock : '')
          + (settingBlock ? '\n\n' + settingBlock : '')
          + (summaryBlock ? '\n\n' + summaryBlock : '')
          + (ledgerText ? '\n\n' + ledgerText : '')
        output = await api.value.generateStream('write', { prompt: continuation, workId: createdId.value || undefined, type: 'script' }, () => {})
        if (disposed) return
        // 续写常把已有正文末尾重写一遍，先去掉重复前缀再拼接。
        generated += stripRepeatedHead(output.content, generated)
      }
      // 跨章兜底：本集结尾若抄了上一章末尾，裁掉重复段；超长按句收到上限。
      generated = clampEpisodeText(stripRepeatedTail(generated, prevText), EPISODE_TEXT_MAX)
      chapter.content = generated
      auditEpisodeState({ text: generated, cast: castList, roster: rosterNames, props: ledger.props, strangerUsage })
        .forEach(issue => stateIssues.push(`${item.title}：${issue}`))
      // 每集一条摘要（≤500 字），随章节保存落库，供下一集续写注入。
      chapter.summary = summaryOfEpisode(item.title, episodeNo)
      completedCount++
    }
    batchPendingReview.value = completedCount
    if (stateIssues.length) {
      ElMessage.warning(`已生成 ${completedCount} 章；人/事/物核查发现 ${stateIssues.length} 处需复核：${stateIssues.slice(0, 3).join('；')}${stateIssues.length > 3 ? '…' : ''}`)
    } else {
      ElMessage.success(`已生成 ${completedCount} 章，请检查后保存草稿（保存时会逐集验收并补卷快照）`)
    }
  } catch (failure) {
    error.value = `已生成 ${completedCount} 章，后续生成中止，已保留收到的正文：${failure.message || '请稍后重试'}`
    await handleError(failure)
  } finally { generatingChapters.value = false; cacheDraft() }
}
function exportNotes(content = characters.value, title = form.title) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }))
  const link = document.createElement('a'); link.href = url; link.download = (title.trim() || '未命名剧本') + '-人物便签.txt'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
}
async function save(submit) {
  if (!editable.value || busy.value) return
  error.value = validateWork(form)
  if (!error.value) {
    for (let index = 0; index < chapters.value.length; index++) {
      const chapter = chapters.value[index]
      const original = originalChapters.get(Number(chapter.chapterId))
      if (!submit && sameChapter(original, chapter)) continue
      if (!documentText(chapter.content).trim() && !chapter.chapterId && chapters.value.length === 1 && !submit && chapter.isFree !== '1') continue
      const problem = validateChapter(chapter)
      if (problem) { error.value = `第 ${index + 1} 集：${problem}`; activeChapter.value = index; section.value = 'chapter'; break }
    }
  }
  if (error.value) { ElMessage.warning(error.value); return }
  saving.value = true
  try {
    if (submit) { try { await ElMessageBox.confirm('保存全部分集并提交内容审核。审核期间作品将锁定编辑，通过后才会发布。', '提交审核', { confirmButtonText: '保存并提交', cancelButtonText: '继续编辑' }) } catch { return } }
    if (!createdId.value) {
      const result = await api.value.createWork(form)
      if (!result?.workId) throw new Error('创建响应缺少作品编号')
      const previousDraftKey = draftKey
      createdId.value = Number(result.workId); draftKey = draftBase + ':work:' + createdId.value
      originalWorkFields = workFields(); cacheDraft()
      if (!storageFailed.value) storage.removeItem(previousDraftKey)
      // 创建已落库后立即把作品编号写入 URL，断线刷新仍能找到这部作品的草稿。
      await pointToWork(createdId.value)
    } else {
      // 请求中断时后端可能已经落库；先确认已保存分集再重试，避免重复新增。
      const detail = await api.value.getWork(createdId.value)
      if (!canEdit(user.value, detail.work)) throw new Error('作品当前不可编辑，请在作品列表查看')
      for (let index = 0; index < chapters.value.length; index++) {
        const chapter = chapters.value[index]
        const remote = detail.chapters?.[index]
        if (!chapter.chapterId && remote) {
          if (remote.chapterTitle !== chapter.chapterTitle || remote.content !== chapter.content) throw new Error('作品分集已发生变化，请先在作品详情确认内容')
          chapter.chapterId = remote.chapterId
        }
      }
      if (workFields() !== originalWorkFields) {
        if (workFields(detail.work) !== originalWorkFields && workFields(detail.work) !== workFields()) throw new Error('作品资料已在其他页面修改，请刷新确认后再保存')
        await api.value.updateWork(createdId.value, form)
        originalWorkFields = workFields()
      }
      for (const chapter of chapters.value) {
        const original = originalChapters.get(Number(chapter.chapterId))
        if (!original || sameChapter(original, chapter)) continue
        const remote = detail.chapters?.find(item => Number(item.chapterId) === Number(chapter.chapterId))
        if (!remote || (!sameChapter(remote, original) && !sameChapter(remote, chapter))) throw new Error('章节已在其他页面修改或删除，请刷新确认后再保存')
      }
    }
    for (const chapter of chapters.value) {
      if (!documentText(chapter.content).trim() && !chapter.chapterId) continue
      // 每集一条摘要：未生成时按事件卡补一条，随章节一起保存。
      if (!chapter.summary) chapter.summary = summaryOfEpisode(chapter.chapterTitle, chapters.value.indexOf(chapter) + 1)
      const original = originalChapters.get(Number(chapter.chapterId))
      if (sameChapter(original, chapter) && (original?.summary || '') === (chapter.summary || '')) continue
      const result = await api.value.saveChapter(createdId.value, chapter)
      if (!chapter.chapterId) {
        if (!result?.chapterId) throw new Error('分集保存响应缺少编号，请到作品详情确认保存状态')
        chapter.chapterId = result.chapterId; cacheDraft()
      }
      originalChapters.set(Number(chapter.chapterId), { chapterTitle: chapter.chapterTitle, content: chapter.content, isFree: chapter.isFree, summary: chapter.summary || '' })
    }
    if (submit) await api.value.submitWork(createdId.value)
    // 台账六类全部保存（跨端共享）；失败只提示，不阻断已完成的章节保存。
    await saveLedger()
    if (characters.value) {
      try { storage.setItem(draftBase + ':notes:' + createdId.value, JSON.stringify({ title: form.title, characters: characters.value })) }
      catch { cacheDraft(); storageFailed.value = true; ElMessage.warning('作品已保存，人物便签未能在本机存档，请先导出便签'); return }
    }
    try {
      if (scriptOutline.value) storage.setItem(draftBase + ':outline:' + createdId.value, scriptOutline.value)
      else storage.removeItem(draftBase + ':outline:' + createdId.value)
    } catch { cacheDraft(); storageFailed.value = true; ElMessage.warning('作品已保存，剧本大纲未能在本机存档，请先复制大纲'); return }
    savedSnapshot = snapshot(); cacheDraft(); draftStatus.value = '作品已保存'
    ElMessage.success(submit ? '已提交内容审核' : '草稿已保存至作品')
    // 批量生成的章节落库后才拿得到 chapterId，验收与卷快照必须在这之后补跑。
    if (batchPendingReview.value) {
      const count = batchPendingReview.value
      batchPendingReview.value = 0
      try {
        await ElMessageBox.confirm(`已保存 ${count} 集。现在逐集验收并生成卷末快照吗？每集一次 AI 判定，按实际 token 扣积分。`, '逐集验收', { confirmButtonText: '开始验收', cancelButtonText: '稍后再说' })
        await runBatchReview(count)
      } catch { ElMessage.info('已跳过逐集验收，可在单集「更新摘要」时单独验收') }
    }
    completed = true; storage.removeItem(draftKey); await goWork(createdId.value)
  } catch (failure) { error.value = '保存未完成，已保留内容，请重试。' + failure.message; cacheDraft(); await handleError(failure) }
  finally { saving.value = false }
}
function protectUnload(event) { cacheDraft(); if (busy.value || (storageFailed.value && hasContent())) { event.preventDefault(); event.returnValue = '' } }
async function allowNavigation(to, switchingWork = false) {
  cacheDraft()
  if (to.path === '/login' || completed) return true
  if (busy.value) return false
  if (workLoadFailed.value) return true
  if (!hasContent() || snapshot() === savedSnapshot) return true
  if (switchingWork && !storageFailed.value) {
    try { await ElMessageBox.confirm('当前修改尚未保存到服务器，将保留在这部作品的本机草稿中。是否切换作品？', '切换作品', { confirmButtonText: '保留并切换', cancelButtonText: '继续编辑' }); return true } catch { return false }
  }
  if (!storageFailed.value) return true
  try { await ElMessageBox.confirm('本机草稿保存失败，离开将丢失尚未保存的内容。', '未保存的内容', { confirmButtonText: '离开', cancelButtonText: '继续创作' }); return true } catch { return false }
}
onBeforeRouteLeave(to => allowNavigation(to))
onBeforeRouteUpdate((to, from) => normalizingRoute ? true : allowNavigation(to, to.query.workId !== from.query.workId))
function cachedDraft(key) {
  try {
    const draft = JSON.parse(storage.getItem(key) || 'null')
    return draft && typeof draft.form?.title === 'string' && Array.isArray(draft.chapters) && draft.chapters.length && draft.chapters.every(c => typeof c.chapterTitle === 'string' && typeof c.content === 'string') ? draft : null
  } catch { return null }
}
function restoreDraft(draft) {
  for (const key of Object.keys(form)) {
    if (typeof draft.form[key] === typeof form[key]) form[key] = draft.form[key]
  }
  chapters.value = draft.chapters.map((chapter, index) => ({ ...chapter, isFree: String(chapter.isFree ?? originalChapters.get(Number(chapter.chapterId))?.isFree ?? '0'), chapterTitle: !createdId.value && index === 0 && chapter.chapterTitle === '第一集' ? '第 1 集' : chapter.chapterTitle, draftId: crypto.randomUUID() }))
  characters.value = typeof draft.characters === 'string' ? draft.characters : ''
  scriptOutline.value = typeof draft.outline === 'string' ? draft.outline : ''
  draftStatus.value = '已恢复本机草稿'
}
async function loadWorkspace() {
  clearTimeout(timer); ready = false; initializing.value = true; completed = false; error.value = ''; workLoadFailed.value = false; storageFailed.value = false
  loadedWork.value = null; createdId.value = null; originalChapters = new Map(); activeChapter.value = 0; section.value = 'chapter'
  directoryVisible.value = false; aiVisible.value = false; settingsVisible.value = false
  Object.assign(form, { title: '', summary: '', scriptUrl: '', scriptName: '', scriptSize: 0 })
  chapters.value = [newChapter(1)]; characters.value = ''; scriptOutline.value = ''; Object.assign(ledger, { storySummary: '', characters: '', relations: '', foreshadow: '', timeline: '', items: '', props: '', styleGuide: '', threads: '' }); Object.assign(aiState, newAiState()); workspaceRevision.value++
  try {
    const legacy = !route.query.workId ? cachedDraft(draftBase) : null
    const rawId = route.query.workId || legacy?.createdId
    if (rawId && (!/^[1-9]\d*$/.test(String(rawId)) || !Number.isSafeInteger(Number(rawId)))) throw new Error('作品编号无效，请重新选择作品')
    const id = rawId ? Number(rawId) : null
    draftKey = id ? draftBase + ':work:' + id : draftBase
    createdId.value = id
    if (id) {
      const detail = await api.value.getWork(id)
      loadedWork.value = detail.work
      Object.assign(form, { title: detail.work.title || '', summary: detail.work.summary || '' })
      const remote = (detail.chapters || []).map(chapter => ({ chapterId: Number(chapter.chapterId), chapterNo: chapter.chapterNo, chapterTitle: chapter.chapterTitle || '', content: chapter.content || '', isFree: chapter.isFree, summary: chapter.summary || '', draftId: crypto.randomUUID() }))
      chapters.value = remote.length ? remote : [newChapter(1)]
      originalChapters = new Map(remote.map(chapter => [chapter.chapterId, { chapterTitle: chapter.chapterTitle, content: chapter.content, isFree: chapter.isFree, summary: chapter.summary || '' }]))
      try { characters.value = JSON.parse(storage.getItem(draftBase + ':notes:' + id) || 'null')?.characters || '' } catch { /* 损坏的便签不影响正文。 */ }
      try { scriptOutline.value = storage.getItem(draftBase + ':outline:' + id) || '' } catch { /* 损坏的大纲存档不影响正文。 */ }
      await loadLedger(id)
      await loadVolumes(id)
    }
    savedSnapshot = snapshot(); originalWorkFields = workFields(); draftStatus.value = id ? '作品已加载' : '草稿尚未保存'
    const draft = (legacy && Number(legacy.createdId) === id ? legacy : null) || cachedDraft(draftKey)
    if (draft && Number(draft.createdId || 0) === Number(id || 0) && editable.value) restoreDraft(draft)
    if (id && !route.query.workId) {
      await pointToWork(id)
      // 迁移旧版单一草稿槽，成功写入作品草稿后才清理旧槽。
      storage.setItem(draftKey, draft ? JSON.stringify(draft) : snapshot()); storage.removeItem(draftBase)
    }
    if (route.query.chapterId === 'new') {
      if (editable.value) {
        const index = chapters.value.findIndex(chapter => !chapter.chapterId)
        if (index < 0) chapters.value.push(newChapter(chapters.value.length + 1))
        activeChapter.value = index < 0 ? chapters.value.length - 1 : index
      }
    } else if (route.query.chapterId) {
      const index = chapters.value.findIndex(chapter => String(chapter.chapterId) === route.query.chapterId)
      if (index < 0) throw new Error('该章节不存在，请从作品详情重新选择章节')
      activeChapter.value = index
    }
  } catch (failure) { workLoadFailed.value = true; error.value = failure.message || '作品加载失败，请重新选择作品'; if (failure.code) await handleError(failure) }
  finally { if (!disposed) { ready = true; initializing.value = false } }
}
watch(() => [route.query.workId, route.query.chapterId], () => { if (ready && !normalizingRoute) loadWorkspace() })
function resizeAi() { compactAi.value = media.matches; if (!media.matches) aiVisible.value = false }
onMounted(async () => {
  try {
    for (let index = 0; index < storage.length; index++) {
      const key = storage.key(index)
      if (key?.startsWith(draftBase + ':notes:')) {
        try { const note = JSON.parse(storage.getItem(key)); if (typeof note.characters === 'string' && typeof note.title === 'string') noteBackups.value.push(note) } catch { /* 损坏的便签不影响新建作品。 */ }
      }
    }
  } catch (failure) { draftStatus.value = '无法恢复草稿，请检查作品列表'; if (failure.code) await handleError(failure) }
  media = window.matchMedia('(max-width: 899px)'); resizeAi(); media.addEventListener('change', resizeAi)
  window.addEventListener('beforeunload', protectUnload)
  await Promise.all([loadWorks(), loadWorkspace()])
})
onBeforeUnmount(() => { cacheDraft(); disposed = true; ready = false; clearTimeout(timer); media?.removeEventListener('change', resizeAi); window.removeEventListener('beforeunload', protectUnload) })
</script>
