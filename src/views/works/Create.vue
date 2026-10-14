<template>
  <section class="creation-workspace" aria-label="创作上传">
    <h1 class="sr-only">创作上传</h1>
    <header class="creation-header">
      <button class="creation-back" aria-label="返回我的作品" @click="goWorks">← <span>返回</span></button>
      <input v-model="form.title" class="creation-title" aria-label="作品名称" maxlength="100" placeholder="未命名剧本（点击输入）" :disabled="busy" />
      <select v-model="form.genreId" class="creation-category" aria-label="分类" :disabled="busy || !!categoryError"><option value="">选择分类</option><option v-for="category in categories" :key="category.categoryId" :value="category.categoryId">{{ category.categoryName }}</option></select>
      <span class="creation-save-state" role="status" :class="{ bad: storageFailed }">{{ busy ? (importing ? '正在导入…' : '正在保存…') : draftStatus }}</span>
      <div class="creation-actions">
        <button class="btn quiet sm" :disabled="busy" @click="settingsVisible = true"><el-icon><Setting /></el-icon> 作品设置</button>
        <button class="btn quiet sm" :disabled="busy || !canCreate" @click="fileInput.click()"><el-icon><Upload /></el-icon> 导入剧本</button>
        <button class="btn ghost sm" :disabled="busy || !canCreate || !!categoryError" @click="save(false)">保存草稿</button>
        <button class="btn sm" :disabled="busy || !canCreate || !!categoryError" @click="save(true)">提交审核</button>
      </div>
    </header>
    <div v-if="error || categoryError" class="creation-error note bad" role="alert">{{ error || categoryError }}<button v-if="categoryError" class="text-button" @click="loadCategories">重新加载分类</button></div>
    <div class="creation-mobile-tools"><button class="btn quiet sm" @click="directoryVisible = true">☰ 分集与资料</button><span>{{ chapters.length }} 集 · {{ totalWords.toLocaleString() }} 字</span><button class="btn quiet sm" @click="aiVisible = true">✦ AI 助手</button></div>
    <div class="creation-columns">
      <aside class="creation-directory" aria-label="分集与资料"><DirectoryContents /></aside>
      <div class="creation-editor">
        <div class="editor-location"><span>{{ section === 'summary' ? '作品资料 / 故事简介' : section === 'characters' ? '作品资料 / 人物便签' : '正文分集 / 第 ' + (activeChapter + 1) + ' 集' }}</span><span>{{ wordCount(currentText).toLocaleString() }} 字</span></div>
        <ScriptEditor v-if="section === 'chapter'" ref="scriptEditor" :key="currentChapter.draftId" v-model="currentChapter.content" v-model:title="currentChapter.chapterTitle" :disabled="busy || !canCreate" />
        <div v-else class="script-paper notes-paper"><h2>{{ section === 'summary' ? '故事简介' : '人物便签' }}</h2><p class="notes-description">{{ section === 'summary' ? '用一段话讲清人物、冲突与故事走向，保存时同步至作品简介。' : '记录人物关系、动机与成长线。人物便签仅保存在当前浏览器，可导出备份。' }}</p><textarea v-if="section === 'summary'" v-model="form.summary" aria-label="故事简介" :disabled="busy" placeholder="这个故事从谁开始，又将走向哪里？" /><textarea v-else v-model="characters" aria-label="人物便签" :disabled="busy" placeholder="姓名 / 身份 / 性格 / 人物关系…" /><button v-if="section === 'characters'" class="btn ghost sm" :disabled="!characters.trim()" @click="exportNotes()">导出人物便签</button><details v-if="section === 'characters' && noteBackups.length" class="notes-backups"><summary>已保存作品的便签存档</summary><button v-for="note in noteBackups" :key="note.title" @click="exportNotes(note.characters, note.title)">下载 · {{ note.title }}</button></details></div>
        <footer class="editor-footer"><span>{{ section === 'chapter' ? '格式随正文保存 · Ctrl+Z 撤销 · Ctrl+B 加粗' : '让故事的骨架更清晰' }}</span><span>共 {{ chapters.length }} 集 · {{ totalWords.toLocaleString() }} 字</span></footer>
      </div>
      <aside class="creation-ai" aria-label="AI 创作助手"><AiStudio v-if="!compactAi" embedded :workspace-state="aiState" :insert-disabled="busy" :current-content="currentChapter.content" :work-id="createdId" @insert="insertAi" /></aside>
    </div>
    <input ref="fileInput" class="sr-only creation-file-input" type="file" accept=".docx,.txt,.md" :disabled="busy || !canCreate" @change="importFile($event.target.files[0]); $event.target.value = ''" />
    <PortalLayer v-model="directoryVisible" title="分集与资料" size="min(300px, 92vw)"><div class="creation-directory directory-drawer"><DirectoryContents /></div></PortalLayer>
    <PortalLayer v-model="aiVisible" title="AI 创作助手" size="min(370px, 96vw)"><div class="creation-ai ai-drawer"><AiStudio v-if="compactAi" embedded :workspace-state="aiState" :insert-disabled="busy" :current-content="currentChapter.content" :work-id="createdId" @insert="insertAi" /></div></PortalLayer>
    <PortalLayer v-model="settingsVisible" title="作品设置" size="min(480px, 96vw)"><div class="panel-content"><label class="field">书名<input v-model="form.title" maxlength="100" :disabled="busy" /></label><label class="field">作品分类<select v-model="form.genreId" :disabled="busy"><option value="">选择分类</option><option v-for="category in categories" :key="category.categoryId" :value="category.categoryId">{{ category.categoryName }}</option></select></label><label class="field">简介<textarea v-model="form.summary" :disabled="busy" /></label><p class="cost">封面可在保存草稿后的作品详情中补充。提交审核后，作品将在审核期间锁定编辑。</p><button class="btn sm" @click="settingsVisible = false">完成设置</button></div></PortalLayer>
  </section>
</template>
<script setup>
import { computed, defineComponent, h, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Document, User, Upload, Setting, Plus } from '@element-plus/icons-vue'
import { usePortal } from '../../utils/portal.js'
import { validateWork, validateChapter, wordCount } from '../../utils/creator.js'
import { readDraft } from '../../utils/draft.js'
import { documentText } from '../../utils/document.js'
import ScriptEditor from '../../components/ScriptEditor.vue'
import PortalLayer from '../../components/PortalLayer.vue'
import AiStudio from './AiStudio.vue'
import '../../assets/styles/creation.css'

const { api, user, canCreate, goWork, goWorks, handleError } = usePortal()
const form = reactive({ title: '', genreId: '', summary: '', scriptUrl: '', scriptName: '', scriptSize: 0 })
const newChapter = number => ({ draftId: crypto.randomUUID(), chapterTitle: `第 ${number} 集`, content: '' })
const chapters = ref([newChapter(1)])
const characters = ref('')
const noteBackups = ref([])
const aiState = reactive({ tab: 'outline', form: { workId: '', genre: '', episodes: 12, prompt: '', content: '', style: '增强画面感', chapterTitle: '' }, results: { outline: '', write: '', polish: '' } })
const activeChapter = ref(0)
const section = ref('chapter')
const currentChapter = computed(() => chapters.value[activeChapter.value])
const currentText = computed(() => section.value === 'summary' ? form.summary : section.value === 'characters' ? characters.value : currentChapter.value.content)
const totalWords = computed(() => chapters.value.reduce((count, chapter) => count + wordCount(chapter.content), 0))
const categories = ref([])
const error = ref('')
const categoryError = ref('')
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
const draftKey = `PcUser-CreationDraft:${user.value.userId}`
let savedSnapshot = ''
let completed = false
let timer
let media
let ready = false
const snapshot = () => JSON.stringify({ form, chapters: chapters.value, characters: characters.value, createdId: createdId.value })
const hasContent = () => Boolean(form.title || form.summary || characters.value || totalWords.value || createdId.value || chapters.value.length > 1)
function cacheDraft() {
  clearTimeout(timer)
  if (!ready || completed) return
  try {
    if (!hasContent()) { storage.removeItem(draftKey); draftStatus.value = '草稿尚未保存'; return }
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
  h('div', { class: 'directory-heading' }, [h('h2', '正文分集'), h('button', { title: '新建分集', 'aria-label': '新建分集', disabled: busy.value, onClick: addChapter }, [h(Plus, { class: 'directory-icon' }), '新建'])]),
  h('nav', { class: 'episode-list', 'aria-label': '正文分集' }, chapters.value.map((chapter, index) => h('div', { key: chapter.draftId, class: ['episode-card', { selected: section.value === 'chapter' && activeChapter.value === index }] }, [
    h('button', { class: 'episode-select', 'aria-current': section.value === 'chapter' && activeChapter.value === index ? 'page' : undefined, onClick: () => { activeChapter.value = index; selectSection('chapter') } }, [h('span', { class: 'episode-index' }, String(index + 1).padStart(2, '0')), h('span', { class: 'episode-name' }, chapter.chapterTitle || '未命名分集'), h('small', `${wordCount(chapter.content)} 字`)]),
    h('button', { class: 'episode-delete', title: '删除分集', 'aria-label': `删除分集：${chapter.chapterTitle || '未命名分集'}`, disabled: busy.value || chapters.value.length <= 1, onClick: () => removeChapter(index) }, '删除')
  ]))),
  h('div', { class: 'create-upload directory-upload' }, [h('button', { class: 'directory-drop', disabled: busy.value || !canCreate.value, onClick: () => fileInput.value.click(), onDragover: event => event.preventDefault(), onDrop: event => { event.preventDefault(); importFile(event.dataTransfer.files[0]) } }, [h(Upload, { class: 'upload-icon' }), h('b', importing.value ? '正在读取剧本…' : '导入本地剧本'), h('span', '点击选择，或拖拽文件到这里'), h('small', '.docx / .txt / .md · 最大 10 MB')]), form.scriptName ? h('p', { class: 'import-file-name' }, form.scriptName) : null, form.scriptName ? h('p', { class: 'cost' }, `已读取 ${totalWords.value.toLocaleString()} 字 · 导入到当前分集`) : null])
]) } })
function selectSection(value) { section.value = value; directoryVisible.value = false }
function addChapter() { if (busy.value) return; chapters.value.push(newChapter(chapters.value.length + 1)); activeChapter.value = chapters.value.length - 1; selectSection('chapter') }
async function removeChapter(index) {
  if (busy.value || chapters.value.length <= 1) return
  saving.value = true
  try {
    try { await ElMessageBox.confirm(`删除「${chapters.value[index].chapterTitle || '未命名分集'}」？此操作不可撤销。`, '删除分集', { confirmButtonText: '删除', cancelButtonText: '保留' }) } catch { return }
    const chapter = chapters.value[index]
    if (chapter.chapterId) await api.value.deleteChapter(createdId.value, chapter.chapterId)
    chapters.value.splice(index, 1)
    chapters.value.forEach((item, position) => { if (/^第\s*\d+\s*集$/.test(item.chapterTitle)) item.chapterTitle = `第 ${position + 1} 集` })
    if (index < activeChapter.value) activeChapter.value--
    else if (index === activeChapter.value) activeChapter.value = Math.min(index, chapters.value.length - 1)
    cacheDraft()
  } catch (failure) { await handleError(failure) }
  finally { saving.value = false }
}
async function loadCategories() { categoryError.value = ''; try { categories.value = await api.value.listCategories() } catch (failure) { categoryError.value = failure.message; await handleError(failure) } }
async function importFile(file) {
  if (!file || busy.value || !canCreate.value) return
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
  if (busy.value || !canCreate.value) return
  section.value = 'chapter'; await nextTick(); scriptEditor.value.appendText(content)
  aiVisible.value = false; ElMessage.success('已插入当前分集末尾')
}
function exportNotes(content = characters.value, title = form.title) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }))
  const link = document.createElement('a'); link.href = url; link.download = (title.trim() || '未命名剧本') + '-人物便签.txt'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
}
async function save(submit) {
  if (!canCreate.value || busy.value) return
  error.value = validateWork(form)
  if (!error.value) {
    for (let index = 0; index < chapters.value.length; index++) {
      const chapter = chapters.value[index]
      if (!documentText(chapter.content).trim() && !chapter.chapterId && chapters.value.length === 1 && !submit) continue
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
      createdId.value = result.workId; cacheDraft()
    } else {
      // 请求中断时后端可能已经落库；先确认已保存分集再重试，避免重复新增。
      const detail = await api.value.getWork(createdId.value)
      if (detail.work.status === 'reviewing') throw new Error('作品已在审核中，请在作品列表查看')
      for (let index = 0; index < chapters.value.length; index++) {
        const chapter = chapters.value[index]
        const remote = detail.chapters?.[index]
        if (!chapter.chapterId && remote) {
          if (remote.chapterTitle !== chapter.chapterTitle || remote.content !== chapter.content) throw new Error('作品分集已发生变化，请先在作品详情确认内容')
          chapter.chapterId = remote.chapterId
        }
      }
      await api.value.updateWork(createdId.value, form)
    }
    for (const chapter of chapters.value) {
      if (!documentText(chapter.content).trim() && !chapter.chapterId) continue
      const result = await api.value.saveChapter(createdId.value, chapter)
      if (!chapter.chapterId) {
        if (!result?.chapterId) throw new Error('分集保存响应缺少编号，请到作品详情确认保存状态')
        chapter.chapterId = result.chapterId; cacheDraft()
      }
    }
    if (submit) await api.value.submitWork(createdId.value)
    savedSnapshot = snapshot(); cacheDraft(); draftStatus.value = '作品已保存'
    ElMessage.success(submit ? '已提交内容审核' : '草稿已保存至作品')
    if (characters.value) {
      try { storage.setItem(draftKey + ':notes:' + createdId.value, JSON.stringify({ title: form.title, characters: characters.value })) }
      catch { ElMessage.warning('作品已保存，人物便签未能在本机存档，请先导出便签'); return }
    }
    completed = true; storage.removeItem(draftKey); await goWork(createdId.value)
  } catch (failure) { error.value = (createdId.value ? '作品已创建，部分操作未完成。已保留内容，请重试。' : '') + failure.message; cacheDraft(); await handleError(failure) }
  finally { saving.value = false }
}
function protectUnload(event) { cacheDraft(); if (busy.value || (storageFailed.value && hasContent())) { event.preventDefault(); event.returnValue = '' } }
onBeforeRouteLeave(async to => {
  cacheDraft()
  if (to.path === '/login' || completed) return true
  if (busy.value) return false
  if (!hasContent() || snapshot() === savedSnapshot || !storageFailed.value) return true
  try { await ElMessageBox.confirm('本机草稿保存失败，离开将丢失尚未保存的内容。', '未保存的内容', { confirmButtonText: '离开', cancelButtonText: '继续创作' }); return true } catch { return false }
})
function resizeAi() { compactAi.value = media.matches; if (!media.matches) aiVisible.value = false }
onMounted(async () => {
  try {
    for (let index = 0; index < storage.length; index++) {
      const key = storage.key(index)
      if (key?.startsWith(draftKey + ':notes:')) {
        try { const note = JSON.parse(storage.getItem(key)); if (typeof note.characters === 'string' && typeof note.title === 'string') noteBackups.value.push(note) } catch { /* 损坏的便签不影响新建作品。 */ }
      }
    }
    const draft = JSON.parse(storage.getItem(draftKey) || 'null')
    if (draft && typeof draft.form?.title === 'string' && Array.isArray(draft.chapters) && draft.chapters.length && draft.chapters.every(c => typeof c.chapterTitle === 'string' && typeof c.content === 'string')) {
      for (const key of Object.keys(form)) {
        if (key === 'genreId' && ['string', 'number'].includes(typeof draft.form[key])) form[key] = String(draft.form[key])
        else if (typeof draft.form[key] === typeof form[key]) form[key] = draft.form[key]
      }
      chapters.value = draft.chapters.map((chapter, index) => ({ ...chapter, chapterTitle: !draft.createdId && index === 0 && chapter.chapterTitle === '第一集' ? '第 1 集' : chapter.chapterTitle, draftId: crypto.randomUUID() })); characters.value = typeof draft.characters === 'string' ? draft.characters : ''; createdId.value = Number(draft.createdId) > 0 ? Number(draft.createdId) : null
      draftStatus.value = '已恢复本机草稿'
      if (createdId.value) {
        const detail = await api.value.getWork(createdId.value)
        if (detail.work.status === 'reviewing') { completed = true; storage.removeItem(draftKey); await goWork(createdId.value); return }
      }
    }
  } catch (failure) { draftStatus.value = '无法恢复草稿，请检查作品列表'; if (failure.code) await handleError(failure) }
  ready = true; initializing.value = false
  media = window.matchMedia('(max-width: 899px)'); resizeAi(); media.addEventListener('change', resizeAi)
  window.addEventListener('beforeunload', protectUnload)
  await loadCategories()
})
onBeforeUnmount(() => { cacheDraft(); clearTimeout(timer); media?.removeEventListener('change', resizeAi); window.removeEventListener('beforeunload', protectUnload) })
</script>
