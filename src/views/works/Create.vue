<template>
  <section class="creation-workspace" aria-label="创作上传">
    <h1 class="sr-only">创作上传</h1>
    <header class="creation-header">
      <button class="creation-back" aria-label="返回工作台" @click="goWorks">← <span>返回工作台</span></button>
      <input v-model="form.title" class="creation-title" aria-label="作品名称" maxlength="100" placeholder="未命名剧本（点击输入）" :disabled="busy || !editable" :readonly="readOnly" />
      <div class="creation-selectors">
        <select class="creation-work-select" aria-label="选择作品" :value="route.query.workId || createdId || ''" :disabled="busy || !!worksError" @change="switchWork"><option value="">新建作品</option><option v-if="createdId && !works.some(work => work.workId === createdId)" :value="createdId">{{ form.title || '未命名作品' }}</option><option v-for="work in works" :key="work.workId" :value="work.workId">{{ work.workId === createdId ? form.title || work.title : work.title }}</option></select>
      </div>
      <span class="creation-save-state" role="status" :class="{ bad: storageFailed }">{{ busy ? (importing ? '正在导入…' : '正在保存…') : draftStatus }}</span>
      <div class="creation-actions">
        <button class="btn quiet sm" :disabled="busy || !editable || readOnly" @click="settingsVisible = true"><el-icon><Setting /></el-icon> 作品设置</button>
        <button class="btn quiet sm" :disabled="busy || !editable || readOnly" @click="fileInput.click()"><el-icon><Upload /></el-icon> 导入剧本</button>
        <button class="btn ghost sm" :disabled="busy || !editable" @click="save(false)">保存草稿</button>
        <button class="btn sm" :disabled="busy || !editable || readOnly" @click="save(true)">提交审核</button>
      </div>
    </header>
    <div v-if="genJob" class="creation-job-bar" :class="{ done: genJob.status === 'succeeded' }" role="status">
      后台生成：{{ genStatusText }} · 已完成 {{ genJob.doneCount }}/{{ genJob.total }} 集<span v-if="genJob.currentNo">（正在写第 {{ genJob.currentNo }} 集：{{ genJob.currentTitle }}）</span><span v-if="genJob.lastError"> · {{ genJob.lastError }}</span>
      <button v-if="genJob.status === 'paused' || genJob.status === 'cancelled'" class="text-button" @click="resumeGenJob">续跑</button>
      <button v-if="genJobRunning" class="text-button" @click="refreshGenJob()">刷新进度</button>
      <button v-if="genJobRunning" class="text-button" @click="cancelGenJob">取消</button>
      <button v-if="!genJobRunning" class="text-button" @click="syncChaptersFromJob">同步章节</button>
      <button v-if="genJob.status === 'succeeded'" class="text-button" @click="closeGenJob">关闭</button>
    </div>
    <div v-if="error" class="creation-error note bad" role="alert">{{ error }}</div>
    <div v-if="worksError" class="creation-error note bad" role="alert">{{ worksError }}<button class="text-button" @click="loadWorks">重新加载作品</button></div>
    <div v-if="loadedWork?.status === 'reviewing'" class="creation-error note info" role="status">作品正在审核中，暂不可编辑；你可以选择其他作品继续创作。</div>
    <div class="creation-mobile-tools"><button class="btn quiet sm" @click="directoryVisible = true">☰ 分集与资料</button><span>{{ chapters.length }} 集 · {{ totalWords.toLocaleString() }} 字</span><button class="btn quiet sm" @click="aiVisible = true">✦ AI 助手</button></div>
    <div class="creation-columns">
      <aside class="creation-directory" aria-label="分集与资料"><DirectoryContents /></aside>
      <div class="creation-editor">
        <div class="editor-location"><span>{{ section === 'summary' ? '作品资料 / 故事简介' : section === 'outline' ? '作品资料 / 剧本大纲' : section === 'characters' ? '作品资料 / 人物便签' : section === 'storyboard' ? '分镜目录 / 分镜成果' : '正文分集 / 第 ' + (activeChapter + 1) + ' 集' }}</span><span>{{ wordCount(currentText).toLocaleString() }} 字</span><div class="view-mode" role="group" aria-label="创作模式"><button type="button" :aria-pressed="!readOnly" :disabled="busy" @click="readOnly = false">编辑</button><button type="button" :aria-pressed="readOnly" :disabled="busy" @click="readOnly = true">阅读</button></div></div>
        <div v-if="section === 'chapter'" class="chapter-trial-setting">
          <span class="tag" :class="currentChapterState.tone">{{ currentChapterState.label }}</span>
          <template v-if="trialAllowed(currentChapter)">
            <el-switch :model-value="currentChapter.isFree === '1'" aria-label="开启章节试读" :disabled="busy || !editable || readOnly || trialSaving" @change="value => setTrial(currentChapter, value)" />
            <span>开启试读</span><small>设置立即保存，作品上架后读者可见。</small>
          </template>
          <small v-else>章节审核通过后可开启试读。</small>
        </div>
        <ScriptEditor v-if="section === 'chapter'" ref="scriptEditor" :key="currentChapter.draftId" v-model="currentChapter.content" v-model:title="currentChapter.chapterTitle" :disabled="busy || !editable" :read-only="readOnly" />
        <div v-else-if="section === 'storyboard'" class="script-paper notes-paper storyboard-editor"><h2>分镜成果</h2><p class="notes-description">分镜与章节是同级目录。分镜标题必须关联当前作品已有章节，试读权限跟随关联章节设置；章节开启试读后，审核通过的分镜会同步对读者开放。</p><label class="field">关联章节<select v-model="storyboardDraft.title" :disabled="busy || !editable || readOnly"><option value="">请选择章节目录标题</option><option v-for="chapter in chapters" :key="chapter.draftId" :value="chapter.chapterTitle">{{ chapter.chapterTitle || `第 ${chapter.chapterNo} 集` }}</option></select></label><div class="storyboard-trial-setting"><el-switch v-if="trialAllowed(selectedStoryboardChapter)" :model-value="selectedStoryboardChapter.isFree === '1'" :active-value="true" :inactive-value="false" aria-label="开放分镜试读" :disabled="busy || !editable || readOnly || !selectedStoryboardChapter?.chapterId || trialSaving" @change="setStoryboardTrial" /><div><strong>{{ storyboardTrialEnabled ? '已开启分镜试读' : '未开启分镜试读' }}</strong><small>{{ trialAllowed(selectedStoryboardChapter) ? '开关同步修改关联章节的试读设置。' : '关联章节审核通过后可设置试读。' }}</small></div></div><textarea v-model="storyboardDraft.content" aria-label="分镜内容" :disabled="busy || !editable || readOnly" placeholder="场次 / 镜号 / 景别 / 运镜 / 画面 / 台词 / 音效与转场…" /><div class="row top-gap"><button class="btn" :disabled="busy || !editable || readOnly || !storyboardDraft.content.trim() || storyboardSaving" @click="saveStoryboard">{{ storyboardSaving ? '保存中…' : '保存到分镜目录' }}</button><span class="cost">保存后会进入当前作品的分镜审核流程，审核通过且关联章节开放试读后，读者才能看到分镜正文</span></div></div><div v-else class="script-paper notes-paper"><h2>{{ section === 'summary' ? '故事简介' : section === 'outline' ? '剧本大纲' : '人物便签' }}</h2><p class="notes-description">{{ section === 'summary' ? '用一段话讲清人物、冲突与故事走向，保存时同步至作品简介。' : section === 'outline' ? 'AI 剧本生成的每集事件卡会存到这里：可在此直接修改，再点「根据大纲生成各章」把正文写出来。大纲随保存草稿在本机存档。' : '记录人物关系、动机与成长线，保存时同步到作品台账（PC 与 App 共用）。' }}</p><textarea v-if="section === 'summary'" v-model="form.summary" aria-label="故事简介" :disabled="busy || !editable" :readonly="readOnly" placeholder="这个故事从谁开始，又将走向哪里？" /><textarea v-else-if="section === 'outline'" v-model="scriptOutline" class="outline-textarea" aria-label="剧本大纲" :disabled="busy || !editable" :readonly="readOnly" placeholder="AI 剧本生成的分集事件卡会出现在这里，也可以自己写一份骨架：第1集：事件名 / 开场承接 / 本集事件 / 冲突与推进 / 结果或反转 / 结尾钩子" /><textarea v-else v-model="characters" aria-label="人物便签" :disabled="busy || !editable" :readonly="readOnly" placeholder="姓名 / 身份 / 性格 / 人物关系…" /><div v-if="section === 'characters'" class="ledger-block"><h3>创作台账（其余七类）</h3><p class="cost">台账存服务器、三端共用；续写与「根据大纲生成各章」时自动注入。道具档案的件数与「已交付给谁」是全书唯一依据，写法基线一旦定下就不要改，否则读者会觉得换了写手。</p><label class="field">人物关系<textarea v-model="ledger.relations" :disabled="busy || !editable" :readonly="readOnly" placeholder="例如：顾守山—顾星宇：父子，因旧案生隙" /></label><label class="field">伏笔（埋在哪集/是否回收）<textarea v-model="ledger.foreshadow" :disabled="busy || !editable" :readonly="readOnly" placeholder="例如：第3集铜铃——第9集已回收" /></label><label class="field">时间线<textarea v-model="ledger.timeline" :disabled="busy || !editable" :readonly="readOnly" placeholder="例如：第1集 雨夜；第2集 次日清晨" /></label><label class="field">物品位置<textarea v-model="ledger.items" :disabled="busy || !editable" :readonly="readOnly" placeholder="例如：铜铃在顾星宇房梁上" /></label><label class="field">重要道具档案（名称｜件数｜持有人｜状态｜外观）<textarea v-model="ledger.props" :disabled="busy || !editable" :readonly="readOnly" placeholder="一行一件，例如：傩面具｜十二面｜顾守山｜在手｜明代木雕；铜钥匙｜1把｜雷老幺｜已交付给吴德贵｜黄铜" /></label><label class="field">写法基线（人称/句式/对白比例/禁用写法）<textarea v-model="ledger.styleGuide" :disabled="busy || !editable" :readonly="readOnly" placeholder="例如：第三人称限知；短句为主；对白占六成；不用全角括号补叙，不写场景头" /></label><label class="field">未解线索<textarea v-model="ledger.threads" :disabled="busy || !editable" :readonly="readOnly" placeholder="例如：老照片背面的人是谁" /></label><div class="timeline-block"><h3>时间线（自动记录，只追加）</h3><p class="cost">每集写完由摘要一并记录约定、伏笔、道具转移等；过去不可改，后文填坑按集号回查。未兑现 {{ timelineStatus.open }} 条 · 已兑现 {{ timelineStatus.done }} 条 · 已失效 {{ timelineStatus.void }} 条。</p><p v-if="!timelineEvents.length" class="cost">还没有事件：生成完一集正文后自动出现。</p><ul v-else class="timeline-list"><li v-for="event in timelineEvents" :key="event.eventId"><span class="tl-no">第{{ event.chapterNo }}集</span><span class="tl-type">{{ event.eventType }}</span><span class="tl-fact">{{ event.fact }}</span><span class="tl-status" :class="'is-' + (event.status === '未兑现' ? 'open' : event.status === '已兑现' ? 'done' : 'void')">{{ event.status }}</span><span v-if="event.deadlineNo && event.status === '未兑现'" class="tl-deadline">应在第{{ event.deadlineNo }}集兑现</span></li></ul></div></div><div v-if="section === 'outline'" class="row top-gap"><button class="btn ghost sm" :disabled="!scriptOutline.trim()" @click="copyOutline">复制大纲</button><button class="btn ghost sm" :disabled="busy || !editable || readOnly || !scriptOutline.trim()" @click="clearOutline">清空</button><button class="btn sm" style="margin-left:auto" :disabled="busy || !editable || readOnly || !scriptOutline.trim() || genJobRunning" title="把当前大纲逐集写成正文：提交后台队列，关闭页面也不中断，失败可续跑" @click="openChapterPicker()">{{ genJobRunning ? '正在生成…' : '根据大纲生成各章' }}</button></div><button v-if="section === 'characters'" class="btn ghost sm" :disabled="!characters.trim()" @click="exportNotes()">导出人物便签</button><details v-if="section === 'characters' && noteBackups.length" class="notes-backups"><summary>已保存作品的便签存档</summary><button v-for="note in noteBackups" :key="note.title" @click="exportNotes(note.characters, note.title)">下载 · {{ note.title }}</button></details></div>
        <footer class="editor-footer"><span>{{ readOnly ? '阅读模式 · 内容不可编辑' : section === 'chapter' ? '格式随正文保存 · Ctrl+Z 撤销 · Ctrl+B 加粗' : section === 'storyboard' ? '分镜目录独立保存 · 可由 AI 生成后继续修改' : '让故事的骨架更清晰' }}</span><span>共 {{ chapters.length }} 集 · {{ totalWords.toLocaleString() }} 字</span></footer>
      </div>
      <aside class="creation-ai" aria-label="AI 编剧助手"><AiStudio v-if="!compactAi" :key="workspaceRevision" embedded :workspace-state="aiState" :insert-disabled="busy || !editable || readOnly" :current-content="currentText" :outline="scriptOutline" :ledger="ledger" :volumes="volumes" :prev-chapter="prevChapterText" :prev-summaries="prevSummaries" :chapter-no="activeChapter + 1" :chapters="chapters" :work-id="createdId" @insert="insertAi" @fill-outline="openChapterPicker" @create-outline="applyOutline" /></aside>
    </div>
    <input ref="fileInput" class="sr-only creation-file-input" type="file" accept=".docx,.txt,.md" :disabled="busy || !editable || readOnly" @change="importFile($event.target.files[0]); $event.target.value = ''" />
    <PortalLayer v-model="directoryVisible" title="分集与资料" size="min(300px, 92vw)"><div class="creation-directory directory-drawer"><DirectoryContents /></div></PortalLayer>
    <PortalLayer v-model="aiVisible" title="AI 编剧助手" size="min(370px, 96vw)"><div class="creation-ai ai-drawer"><AiStudio v-if="compactAi" :key="workspaceRevision" embedded :workspace-state="aiState" :insert-disabled="busy || !editable || readOnly" :current-content="currentText" :outline="scriptOutline" :ledger="ledger" :volumes="volumes" :prev-chapter="prevChapterText" :prev-summaries="prevSummaries" :chapter-no="activeChapter + 1" :chapters="chapters" :work-id="createdId" @insert="insertAi" @fill-outline="openChapterPicker" @create-outline="applyOutline" /></div></PortalLayer>
    <PortalLayer v-model="settingsVisible" title="作品设置" size="min(480px, 96vw)"><div class="panel-content"><label class="field">书名<input v-model="form.title" maxlength="100" :disabled="busy" /></label><label class="field">简介<textarea v-model="form.summary" :disabled="busy" /></label><p class="cost">封面可在保存草稿后的作品详情中补充。提交审核后，作品将在审核期间锁定编辑。</p><button class="btn sm" @click="settingsVisible = false">完成设置</button></div></PortalLayer>
    <PortalLayer v-model="pickerVisible" title="选择要生成正文的分集" size="min(560px, 96vw)">
      <div class="panel-content chapter-picker">
        <p class="cost">勾选要写正文的分集；前面还没正文的集会先建成空分集占位，之后再选时会直接填进去。</p>
        <div class="chapter-picker-head"><button class="btn quiet sm" type="button" @click="togglePickAll">{{ pickerChecked.size === pickerItems.length ? '取消全选' : '全选' }}</button><span>已选 {{ pickerChecked.size }} / {{ pickerItems.length }} 集</span></div>
        <ul class="chapter-picker-list">
          <li v-for="item in pickerItems" :key="item.key">
            <label><el-checkbox :model-value="pickerChecked.has(item.key)" @change="togglePick(item.key)" /><b>第 {{ item.no }} 集</b><span>{{ item.title.replace(/^第\s*\d+\s*[集章]\s*[：:]?\s*/, '') }}</span><em>{{ item.action === 'create' ? '新建' : '补写空白集' }}</em></label>
          </li>
        </ul>
        <button class="btn sm" :disabled="!pickerChecked.size" @click="confirmPicker">生成 {{ pickerChecked.size }} 集正文</button>
      </div>
    </PortalLayer>
  </section>
</template>
<script setup>
import { computed, defineComponent, h, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Document, User, Upload, Setting, Plus, Notebook, VideoCamera } from '@element-plus/icons-vue'
import { usePortal } from '../../utils/portal.js'
import { canEdit, validateWork, validateChapter, wordCount, outlineChapters, planOutlineChapters, outlineToText } from '../../utils/creator.js'
import { chapterReviewState, canSetChapterTrial } from '../../utils/chapterReview.js'
import { setChapterTrial } from '../../api/creator.js'
import { readDraft } from '../../utils/draft.js'
import { uuid } from '../../utils/uuid.js'
import { documentText } from '../../utils/document.js'
import {
  chapterTail, episodeCardFrom, chapterSummaryBlock, checkGenerationRules,
  ledgerPromptBlockByCast, volumeSnapshotBlock, episodeCastFrom, castFromCharacters,
  stripRepeatedTail, stripRepeatedHead, clampEpisodeText, EPISODE_TEXT_MAX, splitOutlineSections,
  rosterFromCharacters, stateGuardBlock, auditEpisodeState, mergeCharacters, mergeOutlineCards, outlineNextNo,
} from '../../utils/creatorAi.js'
import ScriptEditor from '../../components/ScriptEditor.vue'
import PortalLayer from '../../components/PortalLayer.vue'
import AiStudio from './AiStudio.vue'
import '../../assets/styles/creation.css'

const { api, user, canCreate, goWork, goWorks, handleError } = usePortal()
const route = useRoute()
const router = useRouter()
const form = reactive({ title: '', summary: '', scriptUrl: '', scriptName: '', scriptSize: 0 })
const newChapter = number => ({ draftId: uuid(), chapterTitle: `第 ${number} 集`, content: '', isFree: '0', status: '1' })
const sameChapter = (a, b) => a && b && a.chapterTitle === b.chapterTitle && a.content === b.content
const chapters = ref([newChapter(1)])
const characters = ref('')
// 创作台账（跨端共享，落 sys_work_ledger）：故事简介 / 主要人物 / 人物关系 / 伏笔 / 时间线 / 物品位置 / 未解线索。
// 故事简介与人物走上面的编辑区，其余四类在本页「人物便签」下方的台账区直接编辑。
const ledger = reactive({ storySummary: '', characters: '', relations: '', foreshadow: '', timeline: '', items: '', props: '', styleGuide: '', threads: '' })
// 时间线事件（只追加）：每集摘要一并产出，按集号倒序展示；过去不可改，后文填坑时回查
const timelineEvents = ref([])
const timelineStatus = ref({ open: 0, done: 0, void: 0 })
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
const newAiState = () => ({ tab: 'outline', outlineIncomplete: false, form: { workId: '', episodes: 3, episodeMinutes: 1, prompt: '', content: '', style: '增强画面感', chapterTitle: '', skillId: '', script: '', sbStyle: '电影感' }, results: { outline: '', polish: '', storyboard: '' } })
const aiState = reactive(newAiState())
const workspaceRevision = ref(0)
const activeChapter = ref(0)
const section = ref('chapter')
const readOnly = ref(false)
const currentChapter = computed(() => chapters.value[activeChapter.value])
const storyboardDraft = reactive({ title: '', content: '' })
const storyboards = ref([])
const storyboardSaving = ref(false)
const trialSaving = ref(false)
const selectedStoryboardChapter = computed(() => chapters.value.find(chapter => String(chapter.chapterTitle || '').trim() === String(storyboardDraft.title || '').trim()))
const selectedStoryboard = computed(() => storyboards.value.find(item => String(item.chapterTitle || item.title || item.name || '').trim() === String(storyboardDraft.title || '').trim()))
// 分镜试读权限跟随关联章节；作者本人可看到正文，但不代表读者已经开放试读。
const storyboardTrialEnabled = computed(() => {
  const chapter = selectedStoryboardChapter.value
  if (chapter) return chapter.isFree === '1' || chapter.isFree === 1 || chapter.isFree === true || selectedStoryboard.value?.trialEnabled === true || selectedStoryboard.value?.trialEnabled === 1 || selectedStoryboard.value?.trialEnabled === '1'
  return selectedStoryboard.value?.trialEnabled === true || selectedStoryboard.value?.trialEnabled === 1 || selectedStoryboard.value?.trialEnabled === '1'
})
const currentText = computed(() => section.value === 'summary' ? form.summary : section.value === 'outline' ? scriptOutline.value : section.value === 'characters' ? characters.value : section.value === 'storyboard' ? storyboardDraft.content : currentChapter.value.content)
const totalWords = computed(() => chapters.value.reduce((count, chapter) => count + wordCount(chapter.content), 0))
const works = ref([])
const worksError = ref('')
const loadedWork = ref(null)
const trialAllowed = chapter => {
  const original = originalChapters.get(Number(chapter?.chapterId))
  return sameChapter(original, chapter) && canSetChapterTrial(chapter, loadedWork.value?.status)
}
const currentChapterState = computed(() => {
  const chapter = currentChapter.value
  const original = originalChapters.get(Number(chapter?.chapterId))
  if (!chapter?.chapterId || (original && !sameChapter(original, chapter))) return chapterReviewState(null, 'draft')
  return chapterReviewState(chapter, loadedWork.value?.status)
})
const workLoadFailed = ref(false)
const editable = computed(() => canCreate.value && !workLoadFailed.value && (!loadedWork.value || canEdit(user.value, loadedWork.value)))
const error = ref('')
const saving = ref(false)
const importing = ref(false)
const initializing = ref(true)
const busy = computed(() => saving.value || importing.value || initializing.value)
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
let media
let ready = false
let disposed = false
let normalizingRoute = false
const snapshot = () => JSON.stringify({ form, chapters: chapters.value, characters: characters.value, outline: scriptOutline.value, storyboard: storyboardDraft, createdId: createdId.value })
const workFields = (value = form) => JSON.stringify({ title: value.title, summary: value.summary || '' })
const hasContent = () => Boolean(form.title || form.summary || characters.value || scriptOutline.value || storyboardDraft.content || totalWords.value || createdId.value || chapters.value.length > 1 || chapters.value.some(chapter => chapter.isFree === '1'))
function cacheDraft() {
  if (!ready || completed || !editable.value) return
  try {
    if (!hasContent() || snapshot() === savedSnapshot) { storage.removeItem(draftKey); draftStatus.value = createdId.value ? '作品已保存' : '草稿尚未保存'; return }
    const draft = JSON.parse(snapshot())
    storage.setItem(draftKey, JSON.stringify(draft)); storageFailed.value = false; draftStatus.value = '草稿已保存在本机'
  }
  catch { storageFailed.value = true; draftStatus.value = '本机保存失败，请保存草稿' }
}
// 输入时仅标记改动，本机缓存留到显式操作或离开时写入。
watch([() => form.title, () => form.summary, () => chapters.value.length, () => currentChapter.value?.chapterTitle, () => currentChapter.value?.content, characters, scriptOutline, () => storyboardDraft.content, () => storyboardDraft.title], () => {
  if (ready && !completed && !busy.value) draftStatus.value = '有未保存的修改'
}, { flush: 'sync' })

// 目录在桌面和抽屉中复用，业务状态仍由本页统一维护。
const DirectoryContents = defineComponent({ setup() { return () => h('div', { class: 'directory-content' }, [
  h('div', { class: 'directory-info' }, [
    ...[['summary', Document, '故事简介'], ['outline', Notebook, '剧本大纲'], ['characters', User, '人物便签'], ['storyboard', VideoCamera, '分镜目录']].map(([value, icon, label]) => h('button', { class: { selected: section.value === value }, onClick: () => selectSection(value) }, [h(icon, { class: 'directory-icon' }), label]))
  ]),
  h('div', { class: 'directory-heading' }, [h('h2', '正文分集'), h('button', { title: '新建分集', 'aria-label': '新建分集', disabled: busy.value || !editable.value || readOnly.value, onClick: addChapter }, [h(Plus, { class: 'directory-icon' }), '新建'])]),
  h('nav', { class: 'episode-list', 'aria-label': '正文分集' }, chapters.value.map((chapter, index) => h('div', { key: chapter.draftId, class: ['episode-card', { selected: section.value === 'chapter' && activeChapter.value === index }] }, [
    h('button', { class: 'episode-select', 'aria-current': section.value === 'chapter' && activeChapter.value === index ? 'page' : undefined, onClick: () => { activeChapter.value = index; selectSection('chapter') } }, [h('span', { class: 'episode-index' }, String(index + 1).padStart(2, '0')), h('span', { class: 'episode-name' }, chapter.chapterTitle || '未命名分集'), h('small', `${wordCount(chapter.content)} 字${chapter.isFree === '1' ? ' · 试读' : ''}`)]),
    h('button', { class: 'episode-delete', title: '删除分集', 'aria-label': `删除分集：${chapter.chapterTitle || '未命名分集'}`, disabled: busy.value || !editable.value || readOnly.value || chapters.value.length <= 1, onClick: () => removeChapter(index) }, '删除')
  ]))),
  h('div', { class: 'directory-heading storyboard-heading' }, [h('h2', '分镜目录'), h('button', { title: '新建分镜', 'aria-label': '新建分镜', disabled: busy.value || !editable.value || readOnly.value, onClick: () => { storyboardDraft.title = ''; storyboardDraft.content = ''; selectSection('storyboard') } }, [h(VideoCamera, { class: 'directory-icon' }), '新建'])]),
  h('nav', { class: 'episode-list storyboard-list', 'aria-label': '分镜目录' }, storyboards.value.map((storyboard, index) => h('button', { key: storyboard.storyboardId || storyboard.id || index, class: ['episode-card', { selected: section.value === 'storyboard' && storyboardDraft.title === (storyboard.chapterTitle || storyboard.title || storyboard.name) }], onClick: () => { storyboardDraft.title = storyboard.chapterTitle || storyboard.title || storyboard.name || ''; storyboardDraft.content = storyboard.content || storyboard.description || ''; selectSection('storyboard') } }, [h('span', { class: 'episode-index' }, String(index + 1).padStart(2, '0')), h('span', { class: 'episode-name' }, storyboard.chapterTitle || storyboard.title || storyboard.name || '未命名分镜'), h('small', `${storyboard.shotCount ?? storyboard.totalShots ?? storyboard.wordCount ?? '—'} ${storyboard.shotCount || storyboard.totalShots ? '镜头' : '字'} · ${storyboardStatus(storyboard.status)}`)]))),
  h('div', { class: 'create-upload directory-upload' }, [h('button', { class: 'directory-drop', disabled: busy.value || !editable.value || readOnly.value, onClick: () => fileInput.value.click(), onDragover: event => event.preventDefault(), onDrop: event => { event.preventDefault(); importFile(event.dataTransfer.files[0]) } }, [h(Upload, { class: 'upload-icon' }), h('b', importing.value ? '正在读取剧本…' : '导入本地剧本'), h('span', '点击选择，或拖拽文件到这里'), h('small', '.docx / .txt / .md · 最大 10 MB')]), form.scriptName ? h('p', { class: 'import-file-name' }, form.scriptName) : null, form.scriptName ? h('p', { class: 'cost' }, `已读取 ${totalWords.value.toLocaleString()} 字 · 导入到当前分集`) : null])
]) } })
const storyboardStatus = status => ({ ai_reviewing: 'AI审核中', pending: '待人工审核', approved: '审核通过', rejected: '审核驳回' })[status] || '待审核'
function selectSection(value) { section.value = value; if (value === 'storyboard') aiState.tab = 'storyboard'; directoryVisible.value = false }

// 当前分集的上一章末尾（续写注入锚点）。
// 与后台队列同口径：跳过空占位章，取当前集号之前、正文非空、序号最大的一章。
const prevChapterText = computed(() => {
  for (let index = activeChapter.value - 1; index >= 0; index -= 1) {
    const content = String(chapters.value[index]?.content || '').trim()
    if (content) return content
  }
  return ''
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
    ledger.outline = remote.outline || ''
    ledger.threads = remote.threads || ''
    if (ledger.storySummary && !form.summary.trim()) form.summary = ledger.storySummary
    if (ledger.characters && !characters.value.trim()) characters.value = ledger.characters
    // 大纲不再只靠本机草稿：服务端有值而本地为空时回填，换浏览器/换设备也能续写。
    if (ledger.outline && !String(scriptOutline.value || '').trim()) scriptOutline.value = ledger.outline
  } catch { /* 台账读不到不阻塞创作；保存时会再写一次 */ }
  await loadTimeline(id)
}

// 时间线：只读、按集号倒序；未兑现单独计数，方便看还有多少坑没填。
async function loadTimeline(id) {
  if (!id || !api.value?.listWorkTimeline) return
  try {
    const rows = (await api.value.listWorkTimeline(id, { limit: 200 })) || []
    timelineEvents.value = rows
    timelineStatus.value = {
      open: rows.filter(item => item.status === '未兑现').length,
      done: rows.filter(item => item.status === '已兑现').length,
      void: rows.filter(item => item.status === '已失效').length,
    }
  } catch { timelineEvents.value = [] }
}

// 保存台账：故事简介与人物取当前编辑区，关系/伏笔/时间线/物品/线索取台账区。
async function saveLedger({ throwOnFailure = false } = {}) {
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
      outline: scriptOutline.value,
      threads: ledger.threads,
    })
    ledger.storySummary = form.summary
    ledger.characters = characters.value
    return true
  } catch (failure) {
    if (throwOnFailure) throw failure
    ElMessage.warning('台账保存失败：' + (failure.message || '请稍后重试'))
    return false
  }
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
  if (section.value === 'storyboard') {
    storyboardDraft.content = content
    aiVisible.value = false
    ElMessage.success(storyboardDraft.title.trim() ? '已写入分镜编辑区，请确认后保存到分镜目录' : '已写入分镜编辑区，请先选择已有章节目录标题')
    return
  }
  const target = currentChapter.value
  section.value = 'chapter'; await nextTick(); scriptEditor.value.appendText(content)
  aiVisible.value = false; ElMessage.success('已插入当前分集末尾')
  await syncChapterSummary(target)
}
async function loadStoryboards(id) {
  storyboards.value = []
  if (!id || !api.value?.listWorkStoryboards) return
  try {
    const result = await api.value.listWorkStoryboards(id)
    storyboards.value = Array.isArray(result) ? result : result?.list || result?.rows || []
  } catch { /* 后端未接入分镜目录时保留空目录，不影响章节编辑 */ }
}
async function saveStoryboard() {
  if (!createdId.value || storyboardSaving.value) return
  if (!storyboardDraft.title.trim()) { ElMessage.warning('请选择已有章节目录标题'); return }
  if (!storyboardDraft.content.trim()) { ElMessage.warning('请输入分镜内容'); return }
  storyboardSaving.value = true
  try {
    await api.value.createWorkStoryboard(createdId.value, { title: storyboardDraft.title.trim(), content: storyboardDraft.content, source: 'manual' })
    await loadStoryboards(createdId.value)
    ElMessage.success('分镜已保存到作品目录，等待审核')
  } catch (failure) {
    await handleError(failure)
  } finally { storyboardSaving.value = false }
}
function setStoryboardTrial(value) {
  return setTrial(selectedStoryboardChapter.value, value)
}
async function setTrial(chapter, enabled) {
  if (!createdId.value || !trialAllowed(chapter) || !editable.value || busy.value || readOnly.value || trialSaving.value) return
  trialSaving.value = true
  try {
    await setChapterTrial(createdId.value, chapter.chapterId, enabled)
    chapter.isFree = enabled ? '1' : '0'
    const original = originalChapters.get(Number(chapter.chapterId))
    if (original) original.isFree = chapter.isFree
    await loadStoryboards(createdId.value)
    ElMessage.success(enabled ? '已开启章节试读' : '已关闭章节试读')
  } catch (failure) {
    await handleError(failure)
  } finally { trialSaving.value = false }
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

// 「AI 剧本续写」结果并入创作资料：简介更新为最新走向、人物按姓名增量合并、事件卡按集号并入、台账只补空位。
// 不再整段覆盖：续写会带出新人物与新状态，覆盖会丢失用户手改过的设定，也会和已有集重复。
async function applyOutline(content, options = {}) {
  // 起稿页带内容跳转时仍在初始化阶段（busy=true），该场景由 options.force 放行，否则会静默丢弃。
  if ((busy.value && !options.force) || !editable.value || readOnly.value) return null
  const text = (content || '').trim()
  if (!text) return null
  const { seed = false } = options
  const parts = splitAiOutline(text)
  const hasSections = Boolean(parts.summary || parts.characters)
  const outlineText = parts.outline || (hasSections ? '' : text)
  const targets = []
  if (parts.summary) targets.push('故事简介')
  if (parts.characters) targets.push('人物便签')
  if (parts.props) targets.push('道具档案')
  if (parts.styleGuide) targets.push('写法基线')
  if (outlineText) targets.push('剧本大纲')
  if (!targets.length) { ElMessage.warning('AI 结果里没有可写入的内容'); return null }
  // 续写按提示词只说「沿用原简介，补充后续走向」，直接覆盖会把原简介（含结局）冲掉；
  // 因此这里剥掉要求台词后：起稿直接写入，续写追加为后续走向，模型真写了完整新简介才替换。
  const summaryRaw = (parts.summary || '').trim()
  const summaryAddition = summaryRaw
    .replace(/^[（(]?沿用原简介[）)]?/, '')
    .replace(/^[，,、：:]\s*/, '')
    .trim()
  if (summaryAddition) {
    const base = String(form.summary || '').trim()
    // 已有简介就不动：续写提示词要求「沿用原简介」，模型给的只是走向补充，
    // 覆盖会让原简介（含结局）消失，追加又会出现两版并排。
    if (seed || !base) {
      form.summary = summaryAddition; ledger.storySummary = summaryAddition
    }
  }
  // 人物卡去掉「人物关系」段后按姓名合并：同名条目更新，新人物追加。
  const cardText = (parts.characters || '').replace(/人物关系\s*\n[\s\S]*$/, '').trim()
  if (cardText) {
    characters.value = mergeCharacters(characters.value, cardText)
    ledger.characters = mergeCharacters(ledger.characters, cardText)
  }
  // 人物关系逐行去重追加，不做整段替换。
  const relationPart = (parts.characters.match(/人物关系\s*\n([\s\S]*)$/) || [])[1]
  if (relationPart?.trim()) {
    const exists = new Set(String(ledger.relations || '').split('\n').map(line => line.trim()).filter(Boolean))
    const additions = relationPart.split('\n').map(line => line.trim()).filter(Boolean).filter(line => !exists.has(line))
    if (additions.length) ledger.relations = [String(ledger.relations || '').trim(), additions.join('\n')].filter(Boolean).join('\n')
  }
  if (outlineText) {
    scriptOutline.value = String(scriptOutline.value || '').trim() ? mergeOutlineCards(scriptOutline.value, outlineText) : outlineText
  }
  // 台账初始化：道具档案与写法基线随大纲一起生成，只填空值，用户手填的不覆盖。
  if (parts.props && !String(ledger.props || '').trim()) ledger.props = parts.props
  if (parts.styleGuide && !String(ledger.styleGuide || '').trim()) ledger.styleGuide = parts.styleGuide
  section.value = 'outline'
  aiVisible.value = false
  cacheDraft()
  if (seed) return targets
  await saveLedger()
  // 规则版生成后核查（模型档暂缓）：只提示，不阻断。
  const issues = checkGenerationRules({ outline: scriptOutline.value, chapters: [], ledger })
  if (issues.length) ElMessage.warning(`生成后核查：${issues.join('；')}`)
  ElMessage.success(`已并入${targets.join('、')}：事件卡按集号合并、人物按姓名合并，不会整段覆盖`)
  return targets
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
// ──── 后台生成队列：点一次提交，后端逐集跑完；关页/断网不中断，失败可续跑 ────
const genJob = ref(null)
const GEN_ACTIVE = ['queued', 'running']
const genJobRunning = computed(() => GEN_ACTIVE.includes(genJob.value?.status))
const genStatusText = computed(() => ({ queued: '排队中', running: '后台执行中', paused: '已暂停，可续跑', succeeded: '已全部完成', cancelled: '已取消' }[genJob.value?.status] || ''))
/** 不做实时轮询：进页面拉一次、点「刷新」拉一次，避免后台任务持续占用前端。 */
async function refreshGenJob(workId = createdId.value, jobId) {
  if (!workId) return
  try {
    const result = jobId ? await api.value.getGenJob(workId, jobId) : await api.value.getLatestGenJob(workId)
    if (!disposed) genJob.value = result || null
  } catch { /* 拉取失败保留上次状态，下次进页面再拉 */ }
}
/** 计划项 → 队列集（集号从标题取，取不到按已有章节数顺延）。 */
function episodesFromPlan(outlineText, plan) {
  return plan.map(item => {
    const no = Number((item.title.match(/第\s*(\d{1,3})\s*集/) || [])[1]) || chapters.value.length + plan.indexOf(item) + 1
    return { no, title: item.title, card: episodeCardFrom(outlineText, item.title, no) || item.summary || '' }
  })
}
// AI 创作起稿页跳转过来时的一手内容：大纲是三段式，插入时按「简介 / 人物 / 事件卡」分别落位。
const aiCreateSeedKey = id => `PcUser-AiCreateSeed:${id}`
let aiCreateSeedWorkId = null
async function applyAiCreateSeed(id) {
  let seed = null
  try { seed = JSON.parse(sessionStorage.getItem(aiCreateSeedKey(id)) || 'null') } catch { seed = null }
  const text = String(seed?.text || '').trim()
  if (!text) { ElMessage.warning('起稿内容已失效，请回到 AI 创作重新插入一次'); return false }
  if (!form.title.trim() && seed.title) form.title = String(seed.title).slice(0, 100)
  const applied = await applyOutline(text, { seed: true, force: true })
  if (!applied) return false
  aiCreateSeedWorkId = id
  return true
}
async function finishAiCreateSeed(id) {
  const { aiCreate, ...query } = route.query
  if (aiCreate !== '1' || String(query.workId) !== String(id)) return
  normalizingRoute = true
  try {
    const failure = await router.replace({ path: route.path, query, hash: route.hash })
    if (!failure) {
      aiCreateSeedWorkId = null
      try { sessionStorage.removeItem(aiCreateSeedKey(id)) } catch { /* 已保存，回收临时数据失败不影响编辑。 */ }
    }
  } finally { normalizingRoute = false }
}
/** 局部重载章节：只从服务器拉章节，不重置 AI 面板与正在看的续写结果。 */
async function reloadChapters() {
  const detail = await api.value.getWork(createdId.value)
  const remote = (detail.chapters || []).map(chapter => ({ chapterId: Number(chapter.chapterId), chapterNo: chapter.chapterNo, chapterTitle: chapter.chapterTitle || '', content: chapter.content || '', isFree: chapter.isFree, status: String(chapter.status ?? '1'), summary: chapter.summary || '', draftId: uuid() }))
  chapters.value = remote.length ? remote : [newChapter(1)]
  originalChapters = new Map(remote.map(chapter => [chapter.chapterId, { chapterTitle: chapter.chapterTitle, content: chapter.content, isFree: chapter.isFree, status: String(chapter.status ?? '1'), summary: chapter.summary || '' }]))
  activeChapter.value = Math.min(activeChapter.value, chapters.value.length - 1)
}
/** 勾选集数靠后时，先把前面缺的集建成空分集：后端按「第N集」回填，否则第 15 集会落成第 1 集。 */
async function createBlankChapters(upToNo) {
  const existing = new Set(chapters.value.map((chapter, index) => Number(chapter.chapterNo) || index + 1))
  const missing = []
  for (let n = 1; n <= upToNo; n += 1) if (!existing.has(n)) missing.push(n)
  if (!missing.length) return false
  for (const n of missing) {
    const result = await api.value.saveChapter(createdId.value, { chapterTitle: `第 ${n} 集`, content: '', summary: '', isFree: '0' })
    if (!result?.chapterId) throw new Error(`第 ${n} 集空分集创建失败，请重试`)
  }
  return true
}
// 章节勾选窗：像 AI 创作起稿页那样自己挑要写正文的集，确认后只提交选中的集。
const pickerVisible = ref(false)
const pickerItems = ref([])
const pickerChecked = ref(new Set())
function openChapterPicker(outlineOverride) {
  if (busy.value || !editable.value || readOnly.value || genJobRunning.value) return
  if (typeof outlineOverride === 'string' && outlineOverride.trim()) {
    const parts = splitAiOutline(outlineOverride)
    const body = (parts.outline || '').trim()
    if (body) { scriptOutline.value = body; cacheDraft() }
  }
  const outlineText = scriptOutline.value
  const items = outlineChapters(outlineText)
  if (!items.length) { ElMessage.warning('大纲章节不完整、编号重复或混有编号列表，请先改好剧本大纲再生成正文'); return }
  if (!form.title.trim()) { ElMessage.warning('先填作品名再生成正文：提交时会自动保存并创建作品'); return }
  const plan = planOutlineChapters(items, chapters.value)
  const pending = plan.filter(item => item.action === 'fill' || item.action === 'create')
  if (!pending.length) { ElMessage.info('当前大纲对应的分集都已有正文，没有需要生成的章节'); return }
  pickerItems.value = pending.map((item, index) => {
    const no = Number((item.title.match(/第\s*(\d{1,3})\s*集/) || [])[1]) || chapters.value.length + index + 1
    return { key: item.title, no, title: item.title, action: item.action, summary: item.summary }
  })
  pickerChecked.value = new Set(pickerItems.value.map(item => item.key))
  pickerVisible.value = true
}
function togglePick(key) {
  const next = new Set(pickerChecked.value)
  next.has(key) ? next.delete(key) : next.add(key)
  pickerChecked.value = next
}
function togglePickAll() {
  pickerChecked.value = pickerChecked.value.size === pickerItems.value.length ? new Set() : new Set(pickerItems.value.map(item => item.key))
}
async function confirmPicker() {
  const selected = pickerItems.value.filter(item => pickerChecked.value.has(item.key))
  if (!selected.length) { ElMessage.warning('请至少勾选一集'); return }
  pickerVisible.value = false
  await startBackgroundJob(null, selected)
}
async function startBackgroundJob(outlineOverride, selected) {
  if (busy.value || !editable.value || readOnly.value || genJobRunning.value) return
  // 浮层「根据大纲生成各章」可直接传本次 AI 输出：先取分集段落到剧本大纲，再统一按大纲提交。
  if (typeof outlineOverride === 'string' && outlineOverride.trim()) {
    const parts = splitAiOutline(outlineOverride)
    const body = (parts.outline || '').trim()
    if (body) { scriptOutline.value = body; cacheDraft() }
  }
  const outlineText = scriptOutline.value
  const items = outlineChapters(outlineText)
  if (!items.length) { ElMessage.warning('大纲章节不完整、编号重复或混有编号列表，请先改好剧本大纲再生成正文'); return }
  if (!form.title.trim()) { ElMessage.warning('先填作品名再生成正文：提交时会自动保存并创建作品'); return }
  const plan = planOutlineChapters(items, chapters.value)
  let pending = plan.filter(item => item.action === 'fill' || item.action === 'create')
  const pickedTitles = Array.isArray(selected) && selected.length ? new Set(selected.map(item => item.title)) : null
  if (pickedTitles) pending = pending.filter(item => pickedTitles.has(item.title))
  if (!pending.length) { ElMessage.info('当前大纲对应的分集都已有正文，没有需要生成的章节'); return }
  const upTo = Math.max(...pending.map((item, index) => Number((item.title.match(/第\s*(\d{1,3})\s*集/) || [])[1]) || chapters.value.length + index + 1))
  try {
    await ElMessageBox.confirm(`将把选中的 ${pending.length} 集写成正文。提交前会先保存草稿；之后可以关闭页面，后端逐集生成并落库，失败可续跑。每集按实际 token 扣积分。`, '根据大纲生成各章', { confirmButtonText: '提交并开始', cancelButtonText: '取消' })
  } catch { return }
  // 队列每集从库里读上一集正文与最新台账，所以必须先把手上的草稿存成章节。
  await save(false, { navigate: false, review: false })
  if (error.value) return
  if (!createdId.value) { ElMessage.warning('作品保存失败，请重试'); return }
  try {
    // 勾选的第 15 集而前 14 集空白时，先建 14 个空分集占位，后端「第N集」才能回填到正确序号。
    const created = await createBlankChapters(upTo)
    if (created) {
      await reloadChapters()
      const replanned = planOutlineChapters(outlineChapters(scriptOutline.value), chapters.value)
      const titles = new Set(pending.map(item => item.title))
      pending = replanned.filter(item => (item.action === 'fill' || item.action === 'create') && titles.has(item.title))
      if (!pending.length) { ElMessage.info('选中的分集已全部有正文，无需再生成'); return }
    }
    const episodes = episodesFromPlan(outlineText, pending)
    const roster = rosterFromCharacters(characters.value || ledger.characters)
    const job = await api.value.createGenJob(createdId.value, {
      outline: outlineText,
      characters: characters.value || ledger.characters || '',
      roster: roster.join('、'),
      genre: '',
      userPrompt: (aiState.form.prompt || '').trim(),
      model: aiState.form.model || '',
      episodes,
    })
    genJob.value = job
    ElMessage.success(`已提交 ${episodes.length} 集，可以关闭页面；回来打开本页可查看进度`)
    refreshGenJob(createdId.value, job?.jobId)
  } catch (failure) {
    error.value = failure.message || '提交生成失败'
    await handleError(failure)
  }
}
async function resumeGenJob() {
  if (!createdId.value || !genJob.value || busy.value) return
  try {
    const job = await api.value.resumeGenJob(createdId.value, genJob.value.jobId)
    genJob.value = job; refreshGenJob(createdId.value, job?.jobId)
    ElMessage.success('已续跑，未完成的集继续生成')
  } catch (failure) { error.value = failure.message || '续跑失败'; await handleError(failure) }
}
async function cancelGenJob() {
  if (!createdId.value || !genJob.value) return
  try { await ElMessageBox.confirm('取消后台生成？当前这一集写完即停，已生成的章节保留。', '取消后台生成', { confirmButtonText: '取消任务', cancelButtonText: '继续运行' }) } catch { return }
  try {
    genJob.value = await api.value.cancelGenJob(createdId.value, genJob.value.jobId)
    ElMessage.info('已取消，已生成的章节保留')
  } catch (failure) { error.value = failure.message || '取消失败'; await handleError(failure) }
}
async function syncChaptersFromJob() {
  if (!createdId.value) return
  try { await ElMessageBox.confirm('重新从服务器加载章节？本页尚未保存的修改会丢失。', '同步后台生成结果', { confirmButtonText: '重新加载', cancelButtonText: '取消' }) } catch { return }
  await loadWorkspace()
  ElMessage.success('已同步后台生成的最新章节')
}
// 关闭提示前先确认是否已经同步：没同步时直接关掉，本页不会自动补正文。
async function closeGenJob() {
  try {
    await ElMessageBox.confirm('关闭前确认：正文已经点过「同步章节」了吗？没同步的话，正文仍在服务器，但关掉这条提示后本页不会自动补进来。', '关闭后台生成提示', { confirmButtonText: '已同步，关闭', cancelButtonText: '还没同步，先同步', distinguishCancelAndClose: true, type: 'warning' })
  } catch (action) {
    if (action === 'cancel') await syncChaptersFromJob()
    return
  }
  genJob.value = null
}
function exportNotes(content = characters.value, title = form.title) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }))
  const link = document.createElement('a'); link.href = url; link.download = (title.trim() || '未命名剧本') + '-人物便签.txt'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
}
async function save(submit, options = {}) {
  const { navigate = true, review = true } = options
  if (!editable.value || busy.value || trialSaving.value) return false
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
  if (error.value) {
    ElMessage.warning(error.value)
    return false
  }
  saving.value = true
  const importingAiSeed = aiCreateSeedWorkId !== null && aiCreateSeedWorkId === createdId.value
  let saveStep = createdId.value ? '读取作品' : '创建作品草稿'
  try {
    if (submit) { try { await ElMessageBox.confirm('保存全部分集并提交内容审核。审核期间作品将锁定编辑，通过后不会自动上架，需要你确认后手动上架。', '提交审核', { confirmButtonText: '保存并提交', cancelButtonText: '继续编辑' }) } catch { return } }
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
        saveStep = '保存作品资料'
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
      saveStep = '保存分集「' + chapter.chapterTitle + '」'
      const result = await api.value.saveChapter(createdId.value, chapter)
      if (!chapter.chapterId) {
        if (!result?.chapterId) throw new Error('分集保存响应缺少编号，请到作品详情确认保存状态')
        chapter.chapterId = result.chapterId; cacheDraft()
      }
      if (!sameChapter(original, chapter)) { chapter.status = '1'; chapter.isFree = '0' }
      originalChapters.set(Number(chapter.chapterId), { chapterTitle: chapter.chapterTitle, content: chapter.content, isFree: chapter.isFree, status: String(chapter.status ?? '1'), summary: chapter.summary || '' })
    }
    if (submit) { saveStep = '提交审核'; await api.value.submitWork(createdId.value) }
    saveStep = '保存创作台账'
    // AI 起稿交接必须确认台账写入；失败时保留临时数据供保存重试。
    await saveLedger({ throwOnFailure: importingAiSeed })
    if (characters.value) {
      try { storage.setItem(draftBase + ':notes:' + createdId.value, JSON.stringify({ title: form.title, characters: characters.value })) }
      catch { cacheDraft(); storageFailed.value = true; ElMessage.warning('作品已保存，人物便签未能在本机存档，请先导出便签'); return }
    }
    try {
      if (scriptOutline.value) storage.setItem(draftBase + ':outline:' + createdId.value, scriptOutline.value)
      else storage.removeItem(draftBase + ':outline:' + createdId.value)
    } catch { cacheDraft(); storageFailed.value = true; ElMessage.warning('作品已保存，剧本大纲未能在本机存档，请先复制大纲'); return }
    savedSnapshot = snapshot(); cacheDraft(); draftStatus.value = '作品已保存'
    if (importingAiSeed) {
      saveStep = '完成 AI 起稿交接'
      await finishAiCreateSeed(createdId.value)
    }
    ElMessage.success(submit ? '已提交内容审核' : '草稿已保存至作品')
    // 批量生成的章节落库后才拿得到 chapterId，验收与卷快照必须在这之后补跑。
    if (review && batchPendingReview.value) {
      const count = batchPendingReview.value
      batchPendingReview.value = 0
      try {
        await ElMessageBox.confirm(`已保存 ${count} 集。现在逐集验收并生成卷末快照吗？每集一次 AI 判定，按实际 token 扣积分。`, '逐集验收', { confirmButtonText: '开始验收', cancelButtonText: '稍后再说' })
        await runBatchReview(count)
      } catch { ElMessage.info('已跳过逐集验收，可在单集「更新摘要」时单独验收') }
    }
    if (navigate) {
      completed = true
      storage.removeItem(draftKey)
      await goWork(createdId.value)
    }
    return true
  } catch (failure) {
    error.value = saveStep + '未完成：' + (failure.message || '请稍后重试')
    cacheDraft()
    if (storageFailed.value) error.value += '。请先复制未保存内容，避免刷新时丢失。'
    await handleError(failure)
    return false
  } finally {
    saving.value = false
  }
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
  chapters.value = draft.chapters.map((chapter, index) => ({ ...chapter, status: originalChapters.get(Number(chapter.chapterId))?.status ?? '1', isFree: String(originalChapters.get(Number(chapter.chapterId))?.isFree ?? '0'), chapterTitle: !createdId.value && index === 0 && chapter.chapterTitle === '第一集' ? '第 1 集' : chapter.chapterTitle, draftId: uuid() }))
  characters.value = typeof draft.characters === 'string' && draft.characters ? draft.characters : characters.value
  scriptOutline.value = typeof draft.outline === 'string' && draft.outline ? draft.outline : scriptOutline.value
  if (draft.storyboard && typeof draft.storyboard === 'object') {
    storyboardDraft.title = typeof draft.storyboard.title === 'string' ? draft.storyboard.title : ''
    storyboardDraft.content = typeof draft.storyboard.content === 'string' ? draft.storyboard.content : ''
  }
  draftStatus.value = '已恢复本机草稿'
}
async function loadWorkspace() {
  aiCreateSeedWorkId = null
  ready = false; initializing.value = true; completed = false; error.value = ''; workLoadFailed.value = false; storageFailed.value = false
  loadedWork.value = null; createdId.value = null; originalChapters = new Map(); activeChapter.value = 0; section.value = 'chapter'; storyboardDraft.title = ''; storyboardDraft.content = ''; storyboards.value = []
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
      const remote = (detail.chapters || []).map(chapter => ({ chapterId: Number(chapter.chapterId), chapterNo: chapter.chapterNo, chapterTitle: chapter.chapterTitle || '', content: chapter.content || '', isFree: chapter.isFree, status: String(chapter.status ?? '1'), summary: chapter.summary || '', draftId: uuid() }))
      chapters.value = remote.length ? remote : [newChapter(1)]
      originalChapters = new Map(remote.map(chapter => [chapter.chapterId, { chapterTitle: chapter.chapterTitle, content: chapter.content, isFree: chapter.isFree, status: String(chapter.status ?? '1'), summary: chapter.summary || '' }]))
      try { characters.value = JSON.parse(storage.getItem(draftBase + ':notes:' + id) || 'null')?.characters || '' } catch { /* 损坏的便签不影响正文。 */ }
      try { scriptOutline.value = storage.getItem(draftBase + ':outline:' + id) || '' } catch { /* 损坏的大纲存档不影响正文。 */ }
      await loadLedger(id)
      await loadVolumes(id)
      await loadStoryboards(id)
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
    if (route.query.mode === 'storyboard') selectSection('storyboard')
    // AI 创作起稿页「插入到文章并进入编辑」：把三段式大纲按「简介 / 人物 / 事件卡」分别落位。
    if (route.query.aiCreate === '1' && id) await applyAiCreateSeed(id)
  } catch (failure) { workLoadFailed.value = true; error.value = failure.message || '作品加载失败，请重新选择作品'; if (failure.code) await handleError(failure) }
  finally {
    if (!disposed) {
      ready = true; initializing.value = false
      if (createdId.value) refreshGenJob(createdId.value)
      // 起稿页带来的资料要落库：等初始化结束（busy 放开）再保存一次。
      if (aiCreateSeedWorkId !== null) {
        cacheDraft()
        await save(false, { navigate: false, review: false })
      }
    }
  }
}
watch(() => [route.query.workId, route.query.chapterId, route.query.mode], () => { if (ready && !normalizingRoute) loadWorkspace() })
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
onBeforeUnmount(() => { cacheDraft(); disposed = true; ready = false; media?.removeEventListener('change', resizeAi); window.removeEventListener('beforeunload', protectUnload) })
</script>
