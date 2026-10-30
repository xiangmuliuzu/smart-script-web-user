<template>
  <section class="creation-workspace" aria-label="创作上传">
    <h1 class="sr-only">创作上传</h1>
    <header class="creation-header">
      <button class="creation-back" aria-label="返回我的作品" @click="goWorks">← <span>返回</span></button>
      <input v-model="form.title" class="creation-title" aria-label="作品名称" maxlength="100" placeholder="未命名剧本（点击输入）" :disabled="busy || !editable" :readonly="readOnly" />
      <div class="creation-selectors">
        <select v-model="form.genreId" class="creation-category" aria-label="分类" :disabled="busy || !editable || readOnly || !!categoryError"><option value="">选择分类</option><option v-for="category in categories" :key="category.categoryId" :value="category.categoryId">{{ category.categoryName }}</option></select>
        <select class="creation-work-select" aria-label="选择作品" :value="route.query.workId || createdId || ''" :disabled="busy || !!worksError" @change="switchWork"><option value="">新建作品</option><option v-if="createdId && !works.some(work => work.workId === createdId)" :value="createdId">{{ form.title || '未命名作品' }}</option><option v-for="work in works" :key="work.workId" :value="work.workId">{{ work.workId === createdId ? form.title || work.title : work.title }}</option></select>
      </div>
      <span class="creation-save-state" role="status" :class="{ bad: storageFailed }">{{ generatingChapters ? draftStatus : busy ? (importing ? '正在导入…' : '正在保存…') : draftStatus }}</span>
      <div class="creation-actions">
        <button class="btn quiet sm" :disabled="busy || !editable || readOnly" @click="settingsVisible = true"><el-icon><Setting /></el-icon> 作品设置</button>
        <button class="btn quiet sm" :disabled="busy || !editable || readOnly" @click="fileInput.click()"><el-icon><Upload /></el-icon> 导入剧本</button>
        <button class="btn ghost sm" :disabled="busy || !editable || !!categoryError" @click="save(false)">保存草稿</button>
        <button class="btn sm" :disabled="busy || !editable || readOnly || !!categoryError" @click="save(true)">提交审核</button>
      </div>
    </header>
    <div v-if="error || categoryError" class="creation-error note bad" role="alert">{{ error || categoryError }}<button v-if="categoryError" class="text-button" @click="loadCategories">重新加载分类</button></div>
    <div v-if="worksError" class="creation-error note bad" role="alert">{{ worksError }}<button class="text-button" @click="loadWorks">重新加载作品</button></div>
    <div v-if="loadedWork?.status === 'reviewing'" class="creation-error note info" role="status">作品正在审核中，暂不可编辑；你可以选择其他作品继续创作。</div>
    <div class="creation-mobile-tools"><button class="btn quiet sm" @click="directoryVisible = true">☰ 分集与资料</button><span>{{ chapters.length }} 集 · {{ totalWords.toLocaleString() }} 字</span><button class="btn quiet sm" @click="aiVisible = true">✦ AI 助手</button></div>
    <div class="creation-columns">
      <aside class="creation-directory" aria-label="分集与资料"><DirectoryContents /></aside>
      <div class="creation-editor">
        <div class="editor-location"><span>{{ section === 'summary' ? '作品资料 / 故事简介' : section === 'characters' ? '作品资料 / 人物便签' : '正文分集 / 第 ' + (activeChapter + 1) + ' 集' }}</span><span>{{ wordCount(currentText).toLocaleString() }} 字</span><div class="view-mode" role="group" aria-label="创作模式"><button type="button" :aria-pressed="!readOnly" :disabled="busy" @click="readOnly = false">编辑</button><button type="button" :aria-pressed="readOnly" :disabled="busy" @click="readOnly = true">阅读</button></div></div>
        <div v-if="section === 'chapter'" class="chapter-trial-setting"><el-switch v-model="currentChapter.isFree" active-value="1" inactive-value="0" aria-label="设为试读章节（免费阅读）" :disabled="busy || !editable || readOnly" /><span>设为试读章节（免费阅读）</span><small>保存后请在作品详情发布章节，作品通过审核后读者可免费阅读</small></div>
        <ScriptEditor v-if="section === 'chapter'" ref="scriptEditor" :key="currentChapter.draftId" v-model="currentChapter.content" v-model:title="currentChapter.chapterTitle" :disabled="busy || !editable" :read-only="readOnly" />
        <div v-else class="script-paper notes-paper"><h2>{{ section === 'summary' ? '故事简介' : '人物便签' }}</h2><p class="notes-description">{{ section === 'summary' ? '用一段话讲清人物、冲突与故事走向，保存时同步至作品简介。' : '记录人物关系、动机与成长线。人物便签仅保存在当前浏览器，可导出备份。' }}</p><textarea v-if="section === 'summary'" v-model="form.summary" aria-label="故事简介" :disabled="busy || !editable" :readonly="readOnly" placeholder="这个故事从谁开始，又将走向哪里？" /><textarea v-else v-model="characters" aria-label="人物便签" :disabled="busy || !editable" :readonly="readOnly" placeholder="姓名 / 身份 / 性格 / 人物关系…" /><button v-if="section === 'characters'" class="btn ghost sm" :disabled="!characters.trim()" @click="exportNotes()">导出人物便签</button><details v-if="section === 'characters' && noteBackups.length" class="notes-backups"><summary>已保存作品的便签存档</summary><button v-for="note in noteBackups" :key="note.title" @click="exportNotes(note.characters, note.title)">下载 · {{ note.title }}</button></details></div>
        <footer class="editor-footer"><span>{{ readOnly ? '阅读模式 · 内容不可编辑' : section === 'chapter' ? '格式随正文保存 · Ctrl+Z 撤销 · Ctrl+B 加粗' : '让故事的骨架更清晰' }}</span><span>共 {{ chapters.length }} 集 · {{ totalWords.toLocaleString() }} 字</span></footer>
      </div>
      <aside class="creation-ai" aria-label="AI 创作助手"><AiStudio v-if="!compactAi" :key="workspaceRevision" embedded :workspace-state="aiState" :insert-disabled="busy || !editable || readOnly" :current-content="currentChapter.content" :work-id="createdId" @insert="insertAi" @fill-outline="fillOutline" /></aside>
    </div>
    <input ref="fileInput" class="sr-only creation-file-input" type="file" accept=".docx,.txt,.md" :disabled="busy || !editable || readOnly" @change="importFile($event.target.files[0]); $event.target.value = ''" />
    <PortalLayer v-model="directoryVisible" title="分集与资料" size="min(300px, 92vw)"><div class="creation-directory directory-drawer"><DirectoryContents /></div></PortalLayer>
    <PortalLayer v-model="aiVisible" title="AI 创作助手" size="min(370px, 96vw)"><div class="creation-ai ai-drawer"><AiStudio v-if="compactAi" :key="workspaceRevision" embedded :workspace-state="aiState" :insert-disabled="busy || !editable || readOnly" :current-content="currentChapter.content" :work-id="createdId" @insert="insertAi" @fill-outline="fillOutline" /></div></PortalLayer>
    <PortalLayer v-model="settingsVisible" title="作品设置" size="min(480px, 96vw)"><div class="panel-content"><label class="field">书名<input v-model="form.title" maxlength="100" :disabled="busy" /></label><label class="field">作品分类<select v-model="form.genreId" :disabled="busy"><option value="">选择分类</option><option v-for="category in categories" :key="category.categoryId" :value="category.categoryId">{{ category.categoryName }}</option></select></label><label class="field">简介<textarea v-model="form.summary" :disabled="busy" /></label><p class="cost">封面可在保存草稿后的作品详情中补充。提交审核后，作品将在审核期间锁定编辑。</p><button class="btn sm" @click="settingsVisible = false">完成设置</button></div></PortalLayer>
  </section>
</template>
<script setup>
import { computed, defineComponent, h, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Document, User, Upload, Setting, Plus } from '@element-plus/icons-vue'
import { usePortal } from '../../utils/portal.js'
import { canEdit, validateWork, validateChapter, wordCount, outlineChapters, planOutlineChapters } from '../../utils/creator.js'
import { readDraft } from '../../utils/draft.js'
import { documentText } from '../../utils/document.js'
import ScriptEditor from '../../components/ScriptEditor.vue'
import PortalLayer from '../../components/PortalLayer.vue'
import AiStudio from './AiStudio.vue'
import '../../assets/styles/creation.css'

const { api, user, canCreate, goWork, goWorks, handleError } = usePortal()
const route = useRoute()
const router = useRouter()
const form = reactive({ title: '', genreId: '', summary: '', scriptUrl: '', scriptName: '', scriptSize: 0 })
const newChapter = number => ({ draftId: crypto.randomUUID(), chapterTitle: `第 ${number} 集`, content: '', isFree: '0' })
const sameChapter = (a, b) => a && b && a.chapterTitle === b.chapterTitle && a.content === b.content && a.isFree === b.isFree
const chapters = ref([newChapter(1)])
const characters = ref('')
const noteBackups = ref([])
const newAiState = () => ({ tab: 'outline', outlineIncomplete: false, form: { workId: '', genre: '', episodes: 12, prompt: '', content: '', style: '增强画面感', chapterTitle: '', skillId: '', script: '', sbStyle: '电影感' }, results: { outline: '', write: '', polish: '', storyboard: '' } })
const aiState = reactive(newAiState())
const workspaceRevision = ref(0)
const activeChapter = ref(0)
const section = ref('chapter')
const readOnly = ref(false)
const currentChapter = computed(() => chapters.value[activeChapter.value])
const currentText = computed(() => section.value === 'summary' ? form.summary : section.value === 'characters' ? characters.value : currentChapter.value.content)
const totalWords = computed(() => chapters.value.reduce((count, chapter) => count + wordCount(chapter.content), 0))
const categories = ref([])
const works = ref([])
const worksError = ref('')
const loadedWork = ref(null)
const workLoadFailed = ref(false)
const editable = computed(() => canCreate.value && !workLoadFailed.value && (!loadedWork.value || canEdit(user.value, loadedWork.value)))
const error = ref('')
const categoryError = ref('')
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
const snapshot = () => JSON.stringify({ form, chapters: chapters.value, characters: characters.value, createdId: createdId.value })
const workFields = (value = form) => JSON.stringify({ title: value.title, genreId: Number(value.genreId), summary: value.summary || '' })
const hasContent = () => Boolean(form.title || form.summary || characters.value || totalWords.value || createdId.value || chapters.value.length > 1 || chapters.value.some(chapter => chapter.isFree === '1'))
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
watch([form, chapters, characters, createdId], () => {
  if (!ready || completed) return
  draftStatus.value = '正在保存本机草稿…'
  clearTimeout(timer); timer = setTimeout(cacheDraft, 400)
}, { deep: true })

// 目录在桌面和抽屉中复用，业务状态仍由本页统一维护。
const DirectoryContents = defineComponent({ setup() { return () => h('div', { class: 'directory-content' }, [
  h('div', { class: 'directory-info' }, [
    ...[['summary', Document, '故事简介'], ['characters', User, '人物便签']].map(([value, icon, label]) => h('button', { class: { selected: section.value === value }, onClick: () => selectSection(value) }, [h(icon, { class: 'directory-icon' }), label]))
  ]),
  h('div', { class: 'directory-heading' }, [h('h2', '正文分集'), h('button', { title: '新建分集', 'aria-label': '新建分集', disabled: busy.value || !editable.value || readOnly.value, onClick: addChapter }, [h(Plus, { class: 'directory-icon' }), '新建'])]),
  h('nav', { class: 'episode-list', 'aria-label': '正文分集' }, chapters.value.map((chapter, index) => h('div', { key: chapter.draftId, class: ['episode-card', { selected: section.value === 'chapter' && activeChapter.value === index }] }, [
    h('button', { class: 'episode-select', 'aria-current': section.value === 'chapter' && activeChapter.value === index ? 'page' : undefined, onClick: () => { activeChapter.value = index; selectSection('chapter') } }, [h('span', { class: 'episode-index' }, String(index + 1).padStart(2, '0')), h('span', { class: 'episode-name' }, chapter.chapterTitle || '未命名分集'), h('small', `${wordCount(chapter.content)} 字${chapter.isFree === '1' ? ' · 试读' : ''}`)]),
    h('button', { class: 'episode-delete', title: '删除分集', 'aria-label': `删除分集：${chapter.chapterTitle || '未命名分集'}`, disabled: busy.value || !editable.value || readOnly.value || chapters.value.length <= 1, onClick: () => removeChapter(index) }, '删除')
  ]))),
  h('div', { class: 'create-upload directory-upload' }, [h('button', { class: 'directory-drop', disabled: busy.value || !editable.value || readOnly.value, onClick: () => fileInput.value.click(), onDragover: event => event.preventDefault(), onDrop: event => { event.preventDefault(); importFile(event.dataTransfer.files[0]) } }, [h(Upload, { class: 'upload-icon' }), h('b', importing.value ? '正在读取剧本…' : '导入本地剧本'), h('span', '点击选择，或拖拽文件到这里'), h('small', '.docx / .txt / .md · 最大 10 MB')]), form.scriptName ? h('p', { class: 'import-file-name' }, form.scriptName) : null, form.scriptName ? h('p', { class: 'cost' }, `已读取 ${totalWords.value.toLocaleString()} 字 · 导入到当前分集`) : null])
]) } })
function selectSection(value) { section.value = value; directoryVisible.value = false }
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
async function loadCategories() { categoryError.value = ''; try { categories.value = await api.value.listCategories() } catch (failure) { categoryError.value = failure.message; await handleError(failure) } }
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
  section.value = 'chapter'; await nextTick(); scriptEditor.value.appendText(content)
  aiVisible.value = false; ElMessage.success('已插入当前分集末尾')
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
    h('p', `请核对识别结果及章节序号。将生成 ${pending.length} 章，每次生成消耗一次 AI 次数；遇到字数上限时可确认后续写。生成后请检查并保存草稿。`),
    h('p', '纯编号格式可能与剧情列表混淆，请逐项核对。'),
    ...plan.map(item => h('p', `${item.title}：${item.action === 'conflict' ? '冲突，跳过' : item.action === 'skip' ? '跳过' : item.action === 'fill' ? '填充' : '新建'} — ${item.reason}`))
  ])
  if (!pending.length) { try { await ElMessageBox.alert(preview, '章节匹配结果', { confirmButtonText: '知道了' }) } catch { /* 关闭对话框 */ } finally { planningOutline.value = false }; return }
  try { await ElMessageBox.confirm(preview, '确认章节匹配结果', { confirmButtonText: '开始生成', cancelButtonText: '取消' }) } catch { planningOutline.value = false; return }
  generatingChapters.value = true
  planningOutline.value = false
  let completedCount = 0
  try {
    for (const item of pending) {
      draftStatus.value = `正在生成 ${completedCount + 1}/${pending.length}：${item.title}`
      const prompt = `请根据以下完整大纲，为“${item.title}”创作正文，只写这一章。\n完整大纲：\n${outline}\n本章剧情概要：\n${item.summary}`
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
      while (true) {
        chapter.content = generated
        cacheDraft()
        if (storageFailed.value) throw new Error('本机草稿保存失败，请先保存已生成内容')
        if (!output.truncated) break
        try {
          await ElMessageBox.confirm(`「${item.title}」达到单次生成长度上限，已有内容已保存在本机。续写会额外消耗一次 AI 次数，是否继续？`, '章节需要续写', { confirmButtonText: '续写本章', cancelButtonText: '暂时停止' })
        } catch {
          error.value = `「${item.title}」尚未写完，已保留已生成的内容；后续章节尚未生成。`
          return
        }
        draftStatus.value = `正在续写：${item.title}`
        const continuation = `请根据大纲和本章概要，从已有正文的末尾接着写完“${item.title}”。不要重复已有正文，不要写其他章节。\n完整大纲：\n${outline}\n本章概要：\n${item.summary}\n已有正文末尾：\n${generated.slice(-8000)}`
        output = await api.value.generateStream('write', { prompt: continuation, workId: createdId.value || undefined, type: 'script' }, () => {})
        if (disposed) return
        generated += output.content
      }
      completedCount++
    }
    ElMessage.success(`已生成 ${completedCount} 章，请检查后保存草稿`)
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
      const original = originalChapters.get(Number(chapter.chapterId))
      if (sameChapter(original, chapter)) continue
      const result = await api.value.saveChapter(createdId.value, chapter)
      if (!chapter.chapterId) {
        if (!result?.chapterId) throw new Error('分集保存响应缺少编号，请到作品详情确认保存状态')
        chapter.chapterId = result.chapterId; cacheDraft()
      }
      originalChapters.set(Number(chapter.chapterId), { chapterTitle: chapter.chapterTitle, content: chapter.content, isFree: chapter.isFree })
    }
    if (submit) await api.value.submitWork(createdId.value)
    if (characters.value) {
      try { storage.setItem(draftBase + ':notes:' + createdId.value, JSON.stringify({ title: form.title, characters: characters.value })) }
      catch { cacheDraft(); storageFailed.value = true; ElMessage.warning('作品已保存，人物便签未能在本机存档，请先导出便签'); return }
    }
    savedSnapshot = snapshot(); cacheDraft(); draftStatus.value = '作品已保存'
    ElMessage.success(submit ? '已提交内容审核' : '草稿已保存至作品')
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
    if (key === 'genreId' && ['string', 'number'].includes(typeof draft.form[key])) form[key] = String(draft.form[key])
    else if (typeof draft.form[key] === typeof form[key]) form[key] = draft.form[key]
  }
  chapters.value = draft.chapters.map((chapter, index) => ({ ...chapter, isFree: String(chapter.isFree ?? originalChapters.get(Number(chapter.chapterId))?.isFree ?? '0'), chapterTitle: !createdId.value && index === 0 && chapter.chapterTitle === '第一集' ? '第 1 集' : chapter.chapterTitle, draftId: crypto.randomUUID() }))
  characters.value = typeof draft.characters === 'string' ? draft.characters : ''
  draftStatus.value = '已恢复本机草稿'
}
async function loadWorkspace() {
  clearTimeout(timer); ready = false; initializing.value = true; completed = false; error.value = ''; workLoadFailed.value = false; storageFailed.value = false
  loadedWork.value = null; createdId.value = null; originalChapters = new Map(); activeChapter.value = 0; section.value = 'chapter'
  directoryVisible.value = false; aiVisible.value = false; settingsVisible.value = false
  Object.assign(form, { title: '', genreId: '', summary: '', scriptUrl: '', scriptName: '', scriptSize: 0 })
  chapters.value = [newChapter(1)]; characters.value = ''; Object.assign(aiState, newAiState()); workspaceRevision.value++
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
      Object.assign(form, { title: detail.work.title || '', genreId: String(detail.work.genreId || ''), summary: detail.work.summary || '' })
      const remote = (detail.chapters || []).map(chapter => ({ chapterId: Number(chapter.chapterId), chapterNo: chapter.chapterNo, chapterTitle: chapter.chapterTitle || '', content: chapter.content || '', isFree: chapter.isFree, draftId: crypto.randomUUID() }))
      chapters.value = remote.length ? remote : [newChapter(1)]
      originalChapters = new Map(remote.map(chapter => [chapter.chapterId, { chapterTitle: chapter.chapterTitle, content: chapter.content, isFree: chapter.isFree }]))
      try { characters.value = JSON.parse(storage.getItem(draftBase + ':notes:' + id) || 'null')?.characters || '' } catch { /* 损坏的便签不影响正文。 */ }
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
  await Promise.all([loadCategories(), loadWorks(), loadWorkspace()])
})
onBeforeUnmount(() => { cacheDraft(); disposed = true; ready = false; clearTimeout(timer); media?.removeEventListener('change', resizeAi); window.removeEventListener('beforeunload', protectUnload) })
</script>
