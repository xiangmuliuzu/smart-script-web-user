<template>
  <section class="v3-scope" aria-label="创作工作台">
    <LoadState v-if="loading" pending loading-text="正在打开作品…" />
    <div v-else-if="loadError" class="page">
      <LoadState :error="loadError" :retry="load" />
      <div class="row-actions"><button class="btn quiet" type="button" @click="goWorks">← 返回工作台</button></div>
    </div>
    <section
      v-else
      class="workbench"
      :class="{ 'has-subdir': hasSubdir }"
      :aria-busy="saving || creatingChapter"
    >
      <StudioSidebar
        :work="work"
        :blueprint="workMeta"
        :works="works"
        :active-view="activeView"
        :editable="editable"
        :reviewing="reviewing"
        :rejected="rejected"
        :rejected-reason="rejectedReason"
        :submitting="submitting"
        :shelfing="shelfing"
        :deleting="deleting"
        :switching="switching"
        @navigate="navigate"
        @action="onAction"
        @switch-work="switchWork"
      />

      <StudioSubdir
        v-if="hasSubdir"
        :chapters="chapters"
        :storyboards="storyboards"
        :view="activeView"
        :active-chapter-no="chapterNo"
        :editable="editable"
        :generating="creatingChapter"
        :generating-no="generatingNo"
        :generating-preview="generatingPreview"
        @navigate="navigate"
        @select-chapter="selectChapter"
        @new-chapter="newChapter"
      />

      <section class="studio">
        <div class="studio-main">
          <header v-if="viewTabs.length" class="studio-head">
            <div class="tab-row">
              <div class="view-tabs" role="tablist" aria-label="章节视图">
                <button
                  v-for="tabItem in viewTabs"
                  :key="tabItem.key"
                  type="button"
                  role="tab"
                  :aria-selected="tab === tabItem.key"
                  :class="{ active: tab === tabItem.key }"
                  @click="setTab(tabItem.key)"
                >{{ tabItem.label }}</button>
              </div>
              <div class="spacer"></div>
              <button v-if="metaTab && currentChapter && editing" class="btn quiet sm" type="button"
                :disabled="saving || creatingChapter || organizingMeta" @click="organizeChapterMeta">
                {{ organizingMeta ? '正在整理…' : 'AI 整理本章资料' }}
              </button>
              <button
                v-if="aiAvailable"
                class="ai-trigger"
                :class="{ on: aiOpen }"
                type="button"
                :aria-pressed="aiOpen"
                @click="aiOpen = !aiOpen"
              >✦ {{ aiOpen ? '收起 AI 创作' : '打开 AI 创作' }}</button>
            </div>
          </header>
          <div v-if="!editing" class="freeze-bar" role="status">
            {{ reviewing ? '作品审核中，当前为只读状态；审核结束后可继续编辑。' : '当前账号暂无编辑权限，仅可查看作品资料。' }}
          </div>
          <div class="studio-body">
            <div v-if="metaTab && metaError" class="note warn" role="status">
              {{ metaError }} <button class="btn sm quiet" type="button" @click="refreshChapterMeta">重新读取</button>
            </div>
            <WorkViews
              v-if="!isChapterView"
              :view="activeView"
              :blueprint="blueprint"
              :plan-episodes="workMeta.planEpisodes"
              :minutes="workMeta.minutesPerEpisode"
              :regenerating="Boolean(regenerating)"
              :can-edit="editable"
              @open-modal="openModal"
              @regenerate="regenerate"
              @new-chapter="newChapter"
            />
            <ChapterTabs
              v-else-if="currentChapter"
              :tab="tab"
              :chapter="currentChapter"
              :meta="currentMeta"
              :blueprint="blueprint"
              :can-edit="editing"
              :saving="saving"
              @update:summary="updateSummary"
              @update:text="updateText"
              @update:storyboard="updateStoryboard"
              @save="saveNow"
              @goto="setTab"
              @open-modal="openModal"
              @view-work="navigate"
            />
            <div v-else class="empty">
              <div>
                <h3>还没有章节</h3>
                <p>{{ editable ? '点「＋ 新建章节」，AI 会依据作品资料生成本章概要。' : '作品还没有章节。' }}</p>
                <button v-if="editable" class="btn light" type="button" :disabled="creatingChapter" @click="newChapter">{{ creatingChapter ? '正在生成…' : '＋ 新建章节' }}</button>
              </div>
            </div>
          </div>
          <footer class="studio-foot" aria-live="polite">
            <span class="save-state">
              <span class="dot" :class="footDot" aria-hidden="true"></span>{{ footSaveText }}
            </span>
            <span>{{ footInfo }}</span>
          </footer>
        </div>

        <AiDrawer
          v-model="aiOpen"
          :mode="aiMode"
          :work="work"
          :blueprint="blueprint"
          :chapter="currentChapter"
          :ledger="ledger"
          :prev-chapter="prevChapter"
          :chapter-no="chapterNo"
          :can-edit="editable"
          :current-content="currentChapter?.plainText || ''"
          :quota-text="quotaText"
          @apply="applyAi"
        />
      </section>
    </section>

    <BlueprintDetailModal
      v-model="modalOpen"
      :kind="modalKind"
      :blueprint="blueprint"
      :focus-key="modalKey"
      :busy="Boolean(regenerating)"
      :show-regen="Boolean(blueprintSessionId && editable)"
      @focus="openModal"
      @regenerate="instruction => regenerate(modalSection, instruction, modalKey)"
    />

    <WorkSettings v-if="settingsVisible && work" v-model="settingsVisible" :work="work" @saved="reloadWork" />
    <WorkDelete v-if="deleteVisible && work" v-model="deleteVisible" :work="work" @deleted="afterDeleted" />
    <PortalLayer v-model="versionsVisible" title="版本历史" modal>
      <LoadState :pending="versionLoading" :error="versionError" :retry="showVersions" :empty="!versionLoading && !versionError && !versions.length" />
      <ul class="version-list">
        <li v-for="version in versions" :key="version.versionId">
          <time>{{ dateText(version.createTime) }}</time>
          <b>{{ version.version || version.versionNo || '作品版本' }}</b>
          <p>{{ version.versionDesc || version.description || '暂无版本说明' }}</p>
        </li>
      </ul>
    </PortalLayer>
  </section>
</template>
<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { usePortal } from '../../../utils/portal.js'
import { canEdit as canEditWork, dateText, quotaTip, sortWorksDesc } from '../../../utils/creator.js'
import { documentText } from '../../../utils/document.js'
import {
  appendStoryboard,
  appendToDocument,
  chapterStats,
  emptyChapterMeta,
  ledgerToBlueprint,
  normalizeChapterMeta,
  normalizeBlueprint
} from '../../../utils/blueprint.js'
import {
  readStudioDraft,
  writeStudioDraft,
  clearStudioDraft
} from '../../../composables/useBlueprint.js'
import StudioSidebar from './StudioSidebar.vue'
import StudioSubdir from './StudioSubdir.vue'
import WorkViews from './WorkViews.vue'
import ChapterTabs from './ChapterTabs.vue'
import AiDrawer from './AiDrawer.vue'
import BlueprintDetailModal from '../../../components/blueprint/BlueprintDetailModal.vue'
import LoadState from '../../../components/LoadState.vue'
import PortalLayer from '../../../components/PortalLayer.vue'
import WorkSettings from '../Settings.vue'
import WorkDelete from '../Delete.vue'
import '../../../assets/styles/creation.css'
import '../../../assets/styles/studio.css'

const { api, user, goWorks, openPanel, handleError } = usePortal()
const route = useRoute()
const router = useRouter()

const VIEWS = new Set(['intro', 'characters', 'objects', 'outline', 'chapter'])
const TABS = new Set(['summary', 'text', 'storyboard', 'cast', 'items', 'relations'])
const VIEW_TABS = [
  { key: 'summary', label: '内容概要' },
  { key: 'text', label: '章节文本' },
  { key: 'storyboard', label: '章节分镜' },
  { key: 'cast', label: '人物信息' },
  { key: 'items', label: '物品信息' },
  { key: 'relations', label: '人物关系' }
]
const SECTION_LABELS = { storyCore: '故事核心', world: '世界与规则', characters: '主要人物', items: '关键物品', outline: '作品大纲', relations: '人物关系', all: '全部资料' }

const loading = ref(true)
const loadError = ref('')
const work = ref(null)
const works = ref([])
const chapters = ref([])
const storyboards = ref([])
const ledger = reactive({ storySummary: '', characters: '', relations: '', foreshadow: '', timeline: '', items: '', props: '', styleGuide: '', outline: '', threads: '', stateBoard: '' })
const blueprintSeed = ref(null)
const blueprintSessionId = ref(null)
const chapterMetas = ref({})
const organizingMeta = ref(false)
const metaError = ref('')
const latestReview = ref(null)

const activeView = ref('outline')
const chapterNo = ref(1)
const tab = ref('summary')
const aiOpen = ref(false)

const dirty = reactive({ summary: false, text: false, storyboard: false })
const saving = ref(false)
const saveStep = ref('')
const lastSavedAt = ref('')
const saveFailed = ref(false)
const autoSaving = ref(false)
const creatingChapter = ref(false)
const generatingNo = ref(0)
const generatingPreview = ref('')
const switching = ref(false)
const submitting = ref(false)
const shelfing = ref(false)
const deleting = ref(false)
const settingsVisible = ref(false)
const deleteVisible = ref(false)
const versionsVisible = ref(false)
const versionLoading = ref(false)
const versionError = ref('')
const versions = ref([])
const modalOpen = ref(false)
const modalKind = ref('story')
const modalKey = ref('')
const regenerating = ref('')
const quota = ref(null)

/* ───────── 派生状态 ───────── */

const editing = computed(() => canEditWork(user.value, work.value))
const reviewing = computed(() => work.value?.status === 'reviewing')
const rejected = computed(() => ['revision', 'rejected'].includes(work.value?.status))
const editable = computed(() => editing.value && !saving.value && !creatingChapter.value)
const rejectedReason = computed(() => latestReview.value?.reviewOpinion || '')
const hasSubdir = computed(() => activeView.value === 'outline' || activeView.value === 'chapter')
const isChapterView = computed(() => activeView.value === 'chapter')
const viewTabs = computed(() => isChapterView.value ? VIEW_TABS : [])
const metaTab = computed(() => isChapterView.value && ['cast', 'items', 'relations'].includes(tab.value))
const blueprint = computed(() => normalizeBlueprint(blueprintSeed.value))
const workMeta = computed(() => ({
  genre: work.value?.genreName || '未分类',
  planEpisodes: Math.max(Number(blueprint.value.planEpisodes) || 12, ...chapters.value.map(chapter => chapter.chapterNo)),
  minutesPerEpisode: Number(work.value?.duration) > 0 ? Number(work.value.duration) / 60 : Number(blueprint.value.minutesPerEpisode) || 2
}))
const currentChapter = computed(() => chapters.value.find(chapter => Number(chapter.chapterNo) === Number(chapterNo.value)) || null)
const currentMeta = computed(() => {
  const stored = chapterMetas.value[Number(chapterNo.value)] || emptyChapterMeta(chapterNo.value)
  return normalizeChapterMeta(stored, chapterNo.value)
})
const currentStoryboard = computed(() => storyboards.value.find(board => boardMatchesChapter(board, currentChapter.value)) || null)
const activeTabForAi = computed(() => tab.value === 'text' || tab.value === 'storyboard')
const aiMode = computed(() => tab.value === 'storyboard' ? 'storyboard' : 'text')
const aiAvailable = computed(() => isChapterView.value && activeTabForAi.value && Boolean(currentChapter.value))
const quotaText = computed(() => quota.value == null ? '' : `本次生成按实际 token 扣积分（剩余 ${quota.value}）`)
const anyDirty = computed(() => dirty.summary || dirty.text || dirty.storyboard)

const stats = computed(() => chapterStats({
  chapter: currentChapter.value ? { ...currentChapter.value, plainText: documentText(currentChapter.value.content) } : {},
  storyboard: currentStoryboard.value || (currentChapter.value ? { content: currentChapter.value.storyboardContent } : null),
  meta: currentMeta.value
}))

const footDot = computed(() => saveFailed.value ? 'bad' : anyDirty.value ? 'dirty' : '')
const footSaveText = computed(() => {
  if (saving.value) return saveStep.value || '正在保存…'
  if (saveFailed.value) return '保存失败，修改已暂存本机'
  if (anyDirty.value) return '有未保存的修改'
  return lastSavedAt.value ? `草稿已保存 · ${lastSavedAt.value}` : '草稿已保存'
})
const footInfo = computed(() => {
  if (!isChapterView.value) return '作品资料为只读参考 · 可让 AI 重新整理任一资料'
  if (!currentChapter.value) return '还没有章节'
  const total = Math.max(chapters.value.length, workMeta.value.planEpisodes)
  const parts = [`第 ${chapterNo.value} 章 / ${total}`]
  if (tab.value === 'text') parts.push(`正文约 ${stats.value.words} 字`)
  else if (tab.value === 'storyboard') parts.push(`分镜 ${stats.value.shots} 行`)
  else if (tab.value === 'cast') parts.push(`本章出场 ${stats.value.cast} 人`)
  else if (tab.value === 'items') parts.push(`本章物品 ${stats.value.items} 件`)
  else if (tab.value === 'relations') parts.push(`本章关系 ${stats.value.relations} 条`)
  else parts.push(`概要 ${stats.value.summaryWords} 字`, '本章内容独立保存')
  return parts.join(' · ')
})
const prevChapter = computed(() => {
  const previous = chapters.value
    .filter(chapter => Number(chapter.chapterNo) === Number(chapterNo.value) - 1)
    .map(chapter => documentText(chapter.content))
    .join('')
  return previous
})

/* ───────── 数据装载 ───────── */

function normalizeWorks(list) {
  // 切换列表与「我的作品」同口径：更新时间倒序、同时间按 workId 倒序。
  return sortWorksDesc((Array.isArray(list) ? list : []).filter(item => item && item.workId))
}

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const workId = Number(route.params.id)
    if (!Number.isSafeInteger(workId) || workId < 1) throw new Error('作品编号不正确')
    const detail = await api.value.getWork(workId)
    work.value = detail?.work || null
    if (!work.value) throw new Error('作品不存在或已被删除')
    latestReview.value = detail?.latestReview || null
    applyChapters(detail?.chapters || [])
    const [ledgerResult, storyboardResult, blueprintResult] = await Promise.allSettled([
      api.value.getWorkLedger ? api.value.getWorkLedger(workId) : Promise.resolve(null),
      api.value.listWorkStoryboards ? api.value.listWorkStoryboards(workId) : Promise.resolve([]),
      api.value.getWorkBlueprint(workId),
      refreshChapterMeta()
    ])
    Object.assign(ledger, {
      storySummary: ledgerResult.status === 'fulfilled' ? (ledgerResult.value?.storySummary || '') : '',
      characters: ledgerResult.status === 'fulfilled' ? (ledgerResult.value?.characters || '') : '',
      relations: ledgerResult.status === 'fulfilled' ? (ledgerResult.value?.relations || '') : '',
      foreshadow: ledgerResult.status === 'fulfilled' ? (ledgerResult.value?.foreshadow || '') : '',
      timeline: ledgerResult.status === 'fulfilled' ? (ledgerResult.value?.timeline || '') : '',
      items: ledgerResult.status === 'fulfilled' ? (ledgerResult.value?.items || '') : '',
      props: ledgerResult.status === 'fulfilled' ? (ledgerResult.value?.props || '') : '',
      styleGuide: ledgerResult.status === 'fulfilled' ? (ledgerResult.value?.styleGuide || '') : '',
      outline: ledgerResult.status === 'fulfilled' ? (ledgerResult.value?.outline || '') : '',
      threads: ledgerResult.status === 'fulfilled' ? (ledgerResult.value?.threads || '') : '',
      stateBoard: ledgerResult.status === 'fulfilled' ? (ledgerResult.value?.stateBoard || '') : ''
    })
    storyboards.value = normalizeStoryboards(storyboardResult.status === 'fulfilled' ? storyboardResult.value : [])
    mergeStoryboardsIntoChapters()
    const session = blueprintResult.status === 'fulfilled' ? blueprintResult.value : null
    blueprintSessionId.value = session?.sessionId || null
    blueprintSeed.value = session?.blueprint || detail.blueprint || ledgerToBlueprint({ ...ledger, updateTime: work.value.updateTime })
    if (blueprintResult.status === 'rejected') ElMessage.warning('未能读取作品资料会话，可刷新工作台重试')
    applyRouteState()
    restoreDraft()
    loadWorks()
    loadQuota()
  } catch (failure) {
    loadError.value = failure.message || '作品加载失败'
    if (failure?.status) await handleError(failure)
  } finally {
    loading.value = false
  }
}

async function refreshChapterMeta() {
  const workId = work.value?.workId
  if (!workId) return
  metaError.value = ''
  try {
    const result = await api.value.getChapterMeta(workId)
    if (work.value?.workId === workId) chapterMetas.value = result || {}
  } catch (failure) {
    if (work.value?.workId === workId) metaError.value = failure?.message || '本章资料读取失败'
    if (failure?.status) await handleError(failure)
  }
}

function applyChapters(list) {
  chapters.value = (Array.isArray(list) ? list : []).map(chapter => ({
    ...chapter,
    chapterNo: Number(chapter.chapterNo) || 0,
    chapterTitle: chapter.chapterTitle || `第 ${chapter.chapterNo} 章`,
    chapterId: chapter.chapterId ?? null,
    summary: chapter.summary || '',
    content: chapter.content || '',
    storyboardContent: '',
    plainText: documentText(chapter.content || '')
  })).sort((a, b) => a.chapterNo - b.chapterNo)
  mergeStoryboardsIntoChapters()
}

// 分镜内容并入章节：按 chapterId / chapterNo / 标题三重匹配。
function mergeStoryboardsIntoChapters() {
  for (const chapter of chapters.value) {
    const board = storyboards.value.find(item => boardMatchesChapter(item, chapter))
    if (board && typeof board.content === 'string' && !dirty.storyboard) chapter.storyboardContent = board.content
  }
}

function normalizeStoryboards(value) {
  const list = Array.isArray(value) ? value : value?.list || value?.rows || []
  return list.map(board => ({ ...board, content: board?.content || '' }))
}

function boardMatchesChapter(board, chapter) {
  if (!board || !chapter) return false
  if (board.chapterId && chapter.chapterId) return Number(board.chapterId) === Number(chapter.chapterId)
  if (board.chapterNo) return Number(board.chapterNo) === Number(chapter.chapterNo)
  return Boolean(board.chapterTitle && board.chapterTitle === chapter.chapterTitle)
}

async function loadWorks() {
  if (!api.value?.listWorks) return
  try { works.value = normalizeWorks(await api.value.listWorks()) } catch { works.value = [] }
}

async function loadQuota() {
  if (!api.value?.getAiQuota || !user.value?.userId) return
  try { quota.value = (await api.value.getAiQuota(user.value.userId)).available } catch { quota.value = null }
}

async function reloadWork() {
  const detail = await api.value.getWork(Number(route.params.id))
  work.value = detail?.work || work.value
  latestReview.value = detail?.latestReview || latestReview.value
  applyChapters(detail?.chapters || [])
  if (!blueprintSeed.value) blueprintSeed.value = ledgerToBlueprint(ledger)
}

/* ───────── 路由同步 ───────── */

let lastPushedKey = ''
const queryKey = q => `${q?.view || ''}|${q?.chapter || ''}|${q?.tab || ''}`

// 把 URL 的 view/chapter/tab 落到本地状态；非法值回落到大纲视图。
function applyRouteState() {
  const queryView = String(route.query.view || '')
  const view = VIEWS.has(queryView) ? queryView : 'outline'
  activeView.value = view
  if (view === 'chapter') {
    const wanted = Number(route.query.chapter)
    const exists = chapters.value.some(chapter => Number(chapter.chapterNo) === wanted)
    chapterNo.value = exists ? wanted : (chapters.value[0]?.chapterNo || 1)
    tab.value = TABS.has(String(route.query.tab)) ? String(route.query.tab) : 'summary'
  } else {
    const first = chapters.value[0]?.chapterNo || 1
    chapterNo.value = Number(route.query.chapter) || first
    tab.value = 'summary'
  }
  if (!aiAvailable.value) aiOpen.value = false
}

function pushRoute() {
  const query = { view: activeView.value }
  if (activeView.value === 'chapter') { query.chapter = String(chapterNo.value); query.tab = tab.value }
  lastPushedKey = queryKey(query)
  router.replace({ path: `/works/${route.params.id}/studio`, query }).catch(() => {})
}

watch(() => route.query, async next => {
  if (queryKey(next) === lastPushedKey) return
  const changedView = VIEWS.has(String(next.view)) && String(next.view) !== activeView.value
  const changedChapter = next.chapter != null && Number(next.chapter) !== Number(chapterNo.value)
  if (!changedView && !changedChapter) { applyRouteState(); return }
  // 视图/章节变化前先保存当前章，避免丢失手写内容。
  if (anyDirty.value && !await save({ silent: true })) return
  applyRouteState()
})

/* ───────── 视图切换与保存 ───────── */

async function navigate(view) {
  if (view === activeView.value) return
  if (anyDirty.value && !await save({ silent: true })) return
  activeView.value = view
  if (view !== 'chapter') aiOpen.value = false
  pushRoute()
}

async function selectChapter(no) {
  const target = chapters.value.find(chapter => Number(chapter.chapterNo) === Number(no))
  if (!target) return
  if (anyDirty.value && !await save({ silent: true })) return
  activeView.value = 'chapter'
  chapterNo.value = Number(no)
  tab.value = 'summary'
  aiOpen.value = false
  pushRoute()
}

async function setTab(next) {
  if (next === tab.value) return
  if (anyDirty.value && !await save({ silent: true })) return
  tab.value = next
  if (next !== 'text' && next !== 'storyboard') aiOpen.value = false
  pushRoute()
}

function updateSummary(value) {
  if (!currentChapter.value) return
  currentChapter.value.summary = String(value).slice(0, 500)
  dirty.summary = true
}

function updateText(value) {
  if (!currentChapter.value) return
  currentChapter.value.content = value
  currentChapter.value.plainText = documentText(value)
  dirty.text = true
}

function updateStoryboard(value) {
  if (!currentChapter.value) return
  currentChapter.value.storyboardContent = value
  dirty.storyboard = true
}

/** 统一保存：章节（概要+正文）与分镜一次提交，全成才清 dirty；失败保留 dirty 并暂存本机。 */
async function save({ silent = false } = {}) {
  const chapter = currentChapter.value
  if (!chapter) return true
  if (!editable.value) { if (!silent) ElMessage.warning('作品审核中或没有编辑权限，暂不能保存'); return false }
  const needChapter = dirty.summary || dirty.text
  const needStoryboard = dirty.storyboard
  if (!needChapter && !needStoryboard) { if (!silent) ElMessage.info('没有需要保存的修改'); return true }
  if (saving.value) return false
  saving.value = true
  saveStep.value = needChapter && needStoryboard ? '正在保存章节与分镜…' : needChapter ? '正在保存章节…' : '正在保存分镜…'
  let failed = false
  try {
    if (needChapter) {
      const payload = {
        chapterId: chapter.chapterId || undefined,
        chapterNo: chapter.chapterId ? undefined : chapter.chapterNo,
        chapterTitle: chapter.chapterTitle,
        content: chapter.content,
        summary: chapter.summary
      }
      const result = await api.value.saveChapter(work.value.workId, payload)
      if (!chapter.chapterId) {
        if (!result?.chapterId) throw new Error('保存响应缺少章节编号，请刷新后确认')
        chapter.chapterId = result.chapterId
      }
      dirty.summary = false
      dirty.text = false
    }
    if (needStoryboard) {
      try {
        const board = await api.value.createWorkStoryboard(work.value.workId, {
          chapterId: chapter.chapterId || undefined,
          chapterNo: chapter.chapterNo,
          title: chapter.chapterTitle,
          content: chapter.storyboardContent,
          source: 'manual'
        })
        if (board) {
          const existing = storyboards.value.findIndex(item => boardMatchesChapter(item, chapter))
          const merged = { ...(existing >= 0 ? storyboards.value[existing] : {}), ...board, content: chapter.storyboardContent, chapterId: board.chapterId || chapter.chapterId, chapterNo: chapter.chapterNo }
          if (existing >= 0) storyboards.value.splice(existing, 1, merged)
          else storyboards.value.push(merged)
        }
        dirty.storyboard = false
      } catch (failure) {
        // 分镜接口失败不拖累章节保存：保留 dirty，提示后继续。
        failed = true
        ElMessage.warning(`分镜保存失败：${failure.message || '请稍后重试'}`)
      }
    }
    if (!failed) {
      lastSavedAt.value = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
      saveFailed.value = false
      clearStudioDraft(work.value.workId)
      if (!silent) ElMessage.success('已保存本章')
    }
  } catch (failure) {
    failed = true
    saveFailed.value = true
    stashUnsaved()
    if (!silent) await handleError(failure)
    else ElMessage.warning(`自动保存失败：${failure.message || '修改已暂存本机'}`)
  } finally {
    saving.value = false
    saveStep.value = ''
  }
  return !failed
}

async function saveNow() { return save({ silent: false }) }

// 保存失败：把未保存字段放进本机缓冲，刷新后提示恢复。
function stashUnsaved() {
  const chapter = currentChapter.value
  if (!chapter) return
  writeStudioDraft(work.value.workId, {
    chapterNo: chapter.chapterNo,
    summary: chapter.summary,
    content: chapter.content,
    storyboard: chapter.storyboardContent,
    savedAt: new Date().toISOString()
  })
}

function restoreDraft() {
  const draft = readStudioDraft(work.value?.workId)
  if (!draft || !Number(draft.chapterNo)) return
  const chapter = chapters.value.find(item => Number(item.chapterNo) === Number(draft.chapterNo))
  if (!chapter) return
  // 只在服务器内容为空、且本机确实有内容时回填，避免覆盖服务端最新数据。
  if (!String(chapter.summary || '').trim() && draft.summary) { chapter.summary = draft.summary; dirty.summary = true }
  if (!String(documentText(chapter.content) || '').trim() && draft.content) { chapter.content = draft.content; chapter.plainText = documentText(draft.content); dirty.text = true }
  if (!String(chapter.storyboardContent || '').trim() && draft.storyboard) { chapter.storyboardContent = draft.storyboard; dirty.storyboard = true }
  if (anyDirty.value) ElMessage.info('检测到上次未保存的修改，已恢复到本章，请确认后保存')
}

/* ───────── 新建章节 ───────── */

async function newChapter() {
  if (!editable.value) { ElMessage.warning('作品审核中或没有编辑权限，暂不能新建章节'); return }
  if (creatingChapter.value) return
  if (anyDirty.value && !await save({ silent: true })) return
  const nextNo = Math.max(0, ...chapters.value.map(chapter => Number(chapter.chapterNo) || 0)) + 1
  const plan = workMeta.value.planEpisodes
  if (nextNo > plan) {
    try {
      await ElMessageBox.confirm(`已达到计划集数（${plan} 集）。是否继续新建第 ${nextNo} 章？`, '计划集数上限', { confirmButtonText: '继续新建', cancelButtonText: '取消', type: 'warning' })
    } catch { return }
  }
  creatingChapter.value = true
  generatingNo.value = nextNo
  generatingPreview.value = ''
  const workId = work.value.workId
  let draft = null
  try {
    generatingPreview.value = 'AI 正在依据作品资料与前情生成本章概要…'
    const result = await api.value.generateStream('chapter-draft', { workId, chapterNo: nextNo })
    if (!result?.draft) throw new Error('生成响应缺少章节草稿')
    draft = result.draft
  } catch (failure) {
    if (failure?.status || failure?.code) await handleError(failure)
    ElMessage.warning(`AI 生成失败，将新建空白章节。${failure?.message || ''}`)
  }
  generatingPreview.value = ''
  // AI 失败/无内容：建空壳章兜底，保证作者仍能写作。
  const title = draft?.title?.trim() || `第 ${nextNo} 章`
  const summary = String(draft?.summary || '').slice(0, 500)
  try {
    const created = await api.value.saveChapter(workId, {
      chapterNo: nextNo,
      chapterTitle: title.slice(0, 100),
      content: '',
      summary
    })
    if (!created?.chapterId) throw new Error('新建章节响应缺少编号')
    chapters.value.push({
      chapterId: created.chapterId,
      chapterNo: nextNo,
      chapterTitle: title,
      summary,
      content: '',
      plainText: '',
      storyboardContent: '',
      status: '1',
      isFree: '0'
    })
    chapters.value.sort((a, b) => a.chapterNo - b.chapterNo)
    if (draft) {
      try {
        const meta = await api.value.saveChapterMeta(workId, nextNo, {
          cast: draft.cast, items: draft.items, edges: draft.edges, aiSummary: draft.summary, source: 'ai'
        })
        chapterMetas.value = { ...chapterMetas.value, [nextNo]: meta }
      } catch (failure) {
        ElMessage.warning(`章节已创建，资料保存失败。可在本章资料页重新整理。${failure?.message || ''}`)
      }
    }
    await selectChapter(nextNo)
    ElMessage.success(draft ? `第 ${nextNo} 章概要已生成，可继续创作` : `已新建第 ${nextNo} 章，可手动填写概要`)
  } catch (failure) {
    ElMessage.error(`新建章节失败：${failure.message || '请稍后重试'}`)
    if (failure?.status) await handleError(failure)
  } finally {
    creatingChapter.value = false
    generatingNo.value = 0
    loadQuota()
  }
}

async function organizeChapterMeta() {
  if (!editable.value || organizingMeta.value || !currentChapter.value) return
  const workId = work.value.workId
  const number = currentChapter.value.chapterNo
  if (anyDirty.value && !await save({ silent: true })) return
  organizingMeta.value = true
  try {
    const meta = await api.value.generateChapterMeta({ workId, chapterNo: number })
    if (work.value?.workId === workId) chapterMetas.value = { ...chapterMetas.value, [number]: meta }
    metaError.value = ''
    ElMessage.success('本章资料已整理并保存')
  } catch (failure) {
    ElMessage.warning(failure?.message || '整理本章资料失败，请稍后重试')
    if (failure?.status || failure?.code) await handleError(failure)
  } finally {
    organizingMeta.value = false
    loadQuota()
  }
}

/* ───────── 作品级资料重新整理 ───────── */

function openModal(payload) {
  modalKind.value = payload.kind
  modalKey.value = payload.key || ''
  modalOpen.value = true
}
const modalSection = computed(() => ({ story: 'storyCore', world: 'world', characters: 'characters', character: 'characters', items: 'items', item: 'items', outline: 'outline' })[modalKind.value] || 'storyCore')

async function regenerate(section, instruction = '', key = '') {
  if (!editable.value) { ElMessage.warning('作品审核中或没有编辑权限'); return }
  if (regenerating.value) return
  if (!blueprintSessionId.value) { ElMessage.info('此作品没有已确认的 AI 起稿会话'); return }
  if (quota.value === 0) { ElMessage.warning(quotaTip(0)); openPanel?.('recharge'); return }
  regenerating.value = section
  try {
    const result = await api.value.generateStream('blueprint/regenerate', {
      sessionId: blueprintSessionId.value, section, key: key || undefined, instruction: instruction || undefined
    })
    if (!result?.blueprint) throw new Error('整理响应缺少作品资料')
    blueprintSeed.value = result.blueprint
    try {
      Object.assign(ledger, await api.value.getWorkLedger(work.value.workId))
    } catch {
      ElMessage.warning('资料已保存，台账暂时无法读取，可刷新工作台重试')
    }
    ElMessage.success(`已更新${SECTION_LABELS[section] || '作品资料'}`)
  } catch (failure) {
    ElMessage.warning(failure?.message || '整理失败，请稍后重试')
    if (failure?.status || failure?.code) await handleError(failure)
  } finally {
    regenerating.value = ''
    loadQuota()
  }
}

/* ───────── AI 抽屉写入 ───────── */

function applyAi({ mode, content }) {
  if (!currentChapter.value || !editable.value) return
  if (mode === 'text') {
    currentChapter.value.content = appendToDocument(currentChapter.value.content, content)
    currentChapter.value.plainText = documentText(currentChapter.value.content)
    dirty.text = true
    ElMessage.success('已插入到正文，可继续修改后保存')
  } else {
    const result = appendStoryboard(currentChapter.value.storyboardContent, content)
    if (result.added) {
      currentChapter.value.storyboardContent = result.content
      dirty.storyboard = true
      ElMessage.success(`已应用 ${result.added} 个分镜到分镜页`)
    } else {
      ElMessage.info('本次没有可插入的分镜行')
    }
  }
}

/* ───────── 作品菜单动作 ───────── */

async function onAction(action) {
  if (action === 'settings') { settingsVisible.value = true; return }
  if (action === 'archive') { router.push(`/works/${work.value.workId}`); return }
  if (action === 'delete') { deleteVisible.value = true; return }
  if (action === 'versions') { showVersions(); return }
  if (action === 'submit') { await submitWork(); return }
  if (action === 'shelf') { await toggleShelf(); return }
}

async function submitWork() {
  if (!editing.value || submitting.value) return
  if (anyDirty.value && !await save()) return
  try {
    await ElMessageBox.confirm('提交后作品将进入审核，期间暂不可编辑。', '提交审核', { confirmButtonText: '确认提交', cancelButtonText: '继续编辑' })
  } catch { return }
  submitting.value = true
  try {
    await api.value.submitWork(work.value.workId)
    ElMessage.success('已提交审核')
    await reloadWork()
  } catch (failure) { await handleError(failure) }
  finally { submitting.value = false }
}

async function toggleShelf() {
  if (shelfing.value) return
  const onShelf = work.value.shelfStatus === 'on_shelf'
  try {
    await ElMessageBox.confirm(onShelf ? '下架后读者将暂时无法在书城看到该作品，是否继续？' : '审核已通过。确认后作品才会展示在书城，是否继续？', onShelf ? '下架作品' : '上架到书城', { confirmButtonText: '确认', cancelButtonText: '取消', type: onShelf ? 'warning' : 'success' })
  } catch { return }
  shelfing.value = true
  try {
    const api_ = await import('../../../api/creator.js')
    await api_.changeShelfStatus(work.value.workId, onShelf ? 'off_shelf' : 'on_shelf')
    work.value.shelfStatus = onShelf ? 'off_shelf' : 'on_shelf'
    ElMessage.success(onShelf ? '作品已下架' : '作品已上架到书城')
  } catch (failure) { await handleError(failure) }
  finally { shelfing.value = false }
}

// 复用组件时路由参数变化（/works/1/studio → /works/2/studio）必须重载数据：
// 只 watch query 不会触发，旧作品的章节与资料会残留在新作品下。
async function reloadForWork() {
  chapters.value = []
  storyboards.value = []
  chapterMetas.value = {}
  blueprintSeed.value = null
  blueprintSessionId.value = null
  latestReview.value = null
  work.value = null
  works.value = []
  dirty.summary = false
  dirty.text = false
  dirty.storyboard = false
  saveFailed.value = false
  lastSavedAt.value = ''
  lastPushedKey = ''
  await load()
}

async function switchWork(workId) {
  if (!workId || Number(workId) === Number(work.value?.workId) || switching.value) return
  if (anyDirty.value) {
    try {
      await ElMessageBox.confirm('当前章节有未保存的修改，切换作品前是否保存？', '未保存的修改', { confirmButtonText: '保存并切换', cancelButtonText: '放弃并切换', distinguishCancelAndClose: true, type: 'warning' })
      if (!await save({ silent: true })) return
    } catch (action) {
      if (action !== 'cancel') return
    }
  }
  switching.value = true
  try {
    await router.push(`/works/${workId}/studio?view=outline`)
  } finally { switching.value = false }
}

async function showVersions() {
  versionsVisible.value = true
  versionLoading.value = true
  versionError.value = ''
  versions.value = []
  try { versions.value = await api.value.listVersions(work.value.workId) }
  catch (failure) { versionError.value = failure.message || '版本列表加载失败' }
  finally { versionLoading.value = false }
}

function afterDeleted() { ElMessage.success('作品已删除'); router.replace('/works') }

/* ───────── 键盘、拦截、自动保存 ───────── */

function onKeydown(event) {
  if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 's') return
  if (!isChapterView.value) return
  event.preventDefault()
  save({ silent: false })
}

function onBeforeUnload(event) {
  if (!anyDirty.value) return
  event.preventDefault()
  event.returnValue = '本章还有未保存的修改'
  return event.returnValue
}

let autoTimer = null
function startAutoSave() {
  clearInterval(autoTimer)
  autoTimer = setInterval(() => {
    if (anyDirty.value && editable.value && !saving.value && document.visibilityState === 'visible') save({ silent: true })
  }, 15000)
}

onBeforeRouteLeave(async () => {
  if (!anyDirty.value) return true
  try {
    await ElMessageBox.confirm('本章还有未保存的修改，离开前是否保存？', '未保存的修改', { confirmButtonText: '保存并离开', cancelButtonText: '放弃修改', distinguishCancelAndClose: true, type: 'warning' })
    return await save({ silent: true })
  } catch (action) {
    return action === 'cancel'
  }
})

watch(() => route.params.id, async (next, previous) => {
  if (!next || next === previous) return
  // 直接改地址或浏览器前后退：先把旧作品的修改落盘，再切到新作品。
  if (anyDirty.value) await save({ silent: true })
  if (String(route.params.id) !== String(next)) return
  await reloadForWork()
})

// 切章/切视图前自动保存已经在动作里处理；这里兜底「浏览器后退」。
onMounted(() => {
  load()
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('beforeunload', onBeforeUnload)
  startAutoSave()
})

onBeforeUnmount(() => {
  clearInterval(autoTimer)
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('beforeunload', onBeforeUnload)
})
</script>
<style scoped>
.version-list { list-style: none; margin: 0; padding: 0; }
.version-list li { padding: 12px 0; border-bottom: 1px solid var(--rule); font-size: 13px; }
.version-list time { color: var(--ink-3); font-size: 12px; }
.version-list b { display: block; margin: 4px 0; font-family: var(--serif); }
.version-list p { margin: 0; color: var(--ink-2); }
</style>
