<template>
  <el-dialog :model-value="modelValue" title="开始创作" width="min(600px, 94vw)" class="start-create-dialog" align-center :close-on-click-modal="!busy" :close-on-press-escape="!busy" :show-close="!busy" @update:model-value="onVisible" @closed="reset">
    <template v-if="step === 'choose'">
      <p class="start-hint">AI 起稿会先确认作品资料，再进入工作台逐章创作；也可以直接导入已完成的剧本。</p>
      <div class="start-options">
        <button type="button" class="start-option" data-kind="ai" @click="choose('ai')">
          <span class="start-mark" aria-hidden="true">✦</span>
          <span class="start-copy">
            <span class="start-name">AI 起稿</span>
            <span class="start-desc">先填写作品设定，AI 整理故事核心、世界规则、人物与物品；确认资料后进入工作台逐章创作。</span>
          </span>
          <span class="start-go" aria-hidden="true">→</span>
        </button>
        <button type="button" class="start-option" data-kind="import" @click="start('import')">
          <span class="start-mark" aria-hidden="true">⇪</span>
          <span class="start-copy">
            <span class="start-name">导入剧本</span>
            <span class="start-desc">上传已完成的 .txt / .docx / .md 剧本，导入后进入工作台继续编辑与分集。</span>
          </span>
          <span class="start-go" aria-hidden="true">→</span>
        </button>
        <button type="button" class="start-option" data-kind="editor" @click="start('editor')">
          <span class="start-mark" aria-hidden="true">✎</span>
          <span class="start-copy">
            <span class="start-name">自己编辑</span>
            <span class="start-desc">从空白作品开始，自己写第一幕；创建后直接进入工作台写第 1 章。</span>
          </span>
          <span class="start-go" aria-hidden="true">→</span>
        </button>
      </div>
    </template>

    <form v-else class="start-form" @submit.prevent="submit">
      <button type="button" class="start-back" :disabled="busy" @click="back">← 返回选择</button>
      <h3 class="start-form-title">{{ step === 'import' ? '导入本地剧本' : '新建空白作品' }}</h3>

      <label class="field">
        <span class="field-label">书名<i class="req" aria-hidden="true">*</i></span>
        <input v-model="form.title" maxlength="100" required placeholder="给自己的故事起个名字" aria-label="书名" :disabled="busy" />
      </label>
      <label class="field">
        <span class="field-label">简介<small>{{ form.summary.length }} / 500</small></span>
        <textarea v-model="form.summary" maxlength="500" rows="3" placeholder="一句话讲清主角、冲突与走向（选填）" aria-label="简介" :disabled="busy" />
      </label>

      <section v-if="step === 'import'" class="start-upload" aria-label="导入本地剧本">
        <div
          class="drop"
          :class="{ over: dragging, done: Boolean(file) }"
          :aria-disabled="busy"
          role="button"
          tabindex="0"
          @click="!busy && fileInput?.click()"
          @keydown.enter.prevent="!busy && fileInput?.click()"
          @keydown.space.prevent="!busy && fileInput?.click()"
          @dragover.prevent="dragging = true"
          @dragleave.prevent="dragging = false"
          @drop.prevent="onDrop($event.dataTransfer?.files?.[0])"
        >
          <span class="drop-glyph" aria-hidden="true">⇪</span>
          <b>{{ file ? file.name : '导入本地剧本' }}</b>
          <span>{{ file ? `已读取 ${wordCount(text).toLocaleString()} 字` : '点击选择，或拖拽文件到这里' }}</span>
          <small>.docx / .txt / .md · 最大 10 MB</small>
        </div>
        <input ref="fileInput" class="sr-only" type="file" accept=".docx,.txt,.md" :disabled="busy" @change="onPick($event.target.files?.[0]); $event.target.value = ''" />
      </section>

      <p v-if="formError" class="start-error note bad" role="alert">{{ formError }}</p>
      <div class="start-actions">
        <button type="button" class="btn quiet" :disabled="busy" @click="back">取消</button>
        <button type="submit" class="btn" :disabled="busy || !form.title.trim()">
          {{ busy ? busyText : step === 'import' ? '导入并开始写作' : '创建并开始写作' }}
        </button>
      </div>
    </form>
  </el-dialog>
</template>
<script setup>
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { readDraft } from '../../utils/draft.js'
import { wordCount } from '../../utils/creator.js'
import { usePortal } from '../../utils/portal.js'

defineProps({ modelValue: Boolean })
const emit = defineEmits(['update:modelValue'])
const { api, handleError } = usePortal()
const router = useRouter()

const step = ref('choose')
const form = reactive({ title: '', summary: '' })
const file = ref(null)
const text = ref('')
const dragging = ref(false)
const busy = ref(false)
const busyText = ref('')
const formError = ref('')
const fileInput = ref(null)
// 从文件名预填的书名；用户手动改过后不再被下一次选择覆盖。
const autoTitle = ref('')
const FIRST_CHAPTER = 1

function onVisible(value) {
  // 提交中不允许关闭，防止创建请求回来时弹窗已重置。
  if (!value && busy.value) return
  emit('update:modelValue', value)
}
function choose(mode) {
  if (mode === 'ai') {
    emit('update:modelValue', false)
    return router.push('/works/create/ai')
  }
  start(mode)
}
function start(mode) {
  step.value = mode
  formError.value = ''
}
// 供「我的作品」消费 ?start=import 时直接落到导入表单。
function startAt(mode) {
  if (mode !== 'import' && mode !== 'editor') return
  reset()
  start(mode)
}
defineExpose({ startAt })
function back() {
  if (busy.value) return
  step.value = 'choose'
  formError.value = ''
  file.value = null
  text.value = ''
  autoTitle.value = ''
}
function reset() {
  step.value = 'choose'
  form.title = ''
  form.summary = ''
  file.value = null
  text.value = ''
  autoTitle.value = ''
}
async function onPick(picked) { if (picked) await readFile(picked) }
async function onDrop(picked) { dragging.value = false; if (picked) await readFile(picked) }
async function readFile(picked) {
  formError.value = ''
  // 书名留空或仍是上一份文件预填的名字时，才用新文件名覆盖（不覆盖作者手动改过的书名）。
  const previousAutoTitle = autoTitle.value
  try {
    const content = await readDraft(picked)
    if (!content.trim()) throw new Error('草稿中没有可导入的正文')
    file.value = picked
    text.value = content
    const title = picked.name.replace(/\.[^.]+$/, '').slice(0, 100)
    if (!form.title.trim() || form.title === previousAutoTitle) form.title = title
    autoTitle.value = title
  } catch (failure) {
    file.value = null
    text.value = ''
    formError.value = failure.message || '读取失败，请重新选择文件'
  }
}
function validate() {
  const title = form.title.trim()
  if (!title) return '请填写书名'
  if (title.length > 100) return '书名不能超过 100 字'
  if (form.summary.length > 500) return '简介不能超过 500 字'
  if (step.value === 'import' && !file.value) return '请先选择要导入的剧本文件'
  if (step.value === 'import' && !text.value.trim()) return '草稿中没有可导入的正文'
  return ''
}

/** 新流程统一落到工作台第 1 章正文：作品详情与旧编辑页之外的唯一编辑入口。 */
function enterStudio(workId) {
  return `/works/${workId}/studio?view=chapter&chapter=${FIRST_CHAPTER}&tab=text`
}

// 建第 1 章失败不阻断：工作台已有「新建章节」兜底，提示后仍进入写作。
async function ensureFirstChapter(workId, content) {
  try {
    const created = await api.value.saveChapter(workId, { chapterNo: FIRST_CHAPTER, chapterTitle: `第 ${FIRST_CHAPTER} 章`, content, summary: '' })
    if (!created?.chapterId) throw new Error('新建章节响应缺少编号')
  } catch (failure) {
    ElMessage.warning(`作品已创建，第 ${FIRST_CHAPTER} 章暂未建好：${failure?.message || '请在工作台新建章节'}。`)
  }
}

async function submit() {
  if (busy.value) return
  const problem = validate()
  if (problem) { formError.value = problem; return }
  busy.value = true
  formError.value = ''
  const title = form.title.trim()
  const summary = form.summary.trim()
  try {
    let workId
    let content = ''
    if (step.value === 'import') {
      busyText.value = '正在上传剧本…'
      const uploaded = await api.value.upload(file.value, 'script')
      if (!uploaded?.url) throw new Error('上传响应缺少文件地址，请重试')
      busyText.value = '正在创建作品…'
      const result = await api.value.createWork({ title, summary, scriptUrl: uploaded.url, scriptName: file.value.name, scriptSize: file.value.size })
      workId = Number(result?.workId || result?.id)
      if (!Number.isSafeInteger(workId) || workId < 1) throw new Error('创建响应缺少作品编号，请重试')
      content = text.value
    } else {
      busyText.value = '正在创建作品…'
      const result = await api.value.createWork({ title, summary })
      workId = Number(result?.workId || result?.id)
      if (!Number.isSafeInteger(workId) || workId < 1) throw new Error('创建响应缺少作品编号，请重试')
    }
    busyText.value = '正在建立第 1 章…'
    await ensureFirstChapter(workId, content)
    emit('update:modelValue', false)
    // 先关弹窗再离开：works/index.vue 的 v-model 监听会把内部步骤复位。
    await router.push(enterStudio(workId))
  } catch (failure) {
    formError.value = failure.message || '创建作品失败，请稍后重试'
    if (failure?.status) await handleError(failure)
  } finally {
    busy.value = false
    busyText.value = ''
  }
}
</script>
<style scoped>
:global(.start-create-dialog .el-dialog__header) { padding: 20px 24px 0; }
:global(.start-create-dialog .el-dialog__title) { font-family: var(--serif); font-size: 19px; letter-spacing: .05em; }
:global(.start-create-dialog .el-dialog__body) { padding: 10px 24px 24px; }
.start-hint { margin: 0 0 18px; font-size: 12.5px; color: var(--ink-3); }
.start-options { display: flex; flex-direction: column; border-top: 1px solid var(--rule); }
.start-option { display: grid; grid-template-columns: 40px minmax(0, 1fr) 20px; align-items: center; gap: 16px; width: 100%; padding: 18px 10px 18px 2px; border: 0; border-bottom: 1px solid var(--rule); background: none; text-align: left; transition: background .18s ease, padding .18s ease; }
.start-option:hover, .start-option:focus-visible { background: var(--indigo-wash); padding-left: 12px; padding-right: 14px; }
.start-option:focus-visible { outline: 2px solid var(--indigo); outline-offset: -2px; }
.start-mark { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 50%; font-size: 15px; color: #fff; background: var(--indigo); }
.start-option[data-kind='ai'] .start-mark { background: var(--cinnabar); }
.start-option[data-kind='import'] .start-mark { background: var(--bamboo); }
.start-copy { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.start-name { font-family: var(--serif); font-size: 17px; letter-spacing: .04em; color: var(--ink); }
.start-desc { font-size: 12.5px; line-height: 1.7; color: var(--ink-2); }
.start-go { font-size: 15px; color: var(--ink-3); transition: transform .18s ease, color .18s ease; }
.start-option:hover .start-go, .start-option:focus-visible .start-go { transform: translateX(4px); color: var(--indigo); }

.start-form { display: flex; flex-direction: column; gap: 14px; }
.start-back { align-self: flex-start; border: 0; padding: 0; background: none; color: var(--ink-3); font: inherit; font-size: 12.5px; cursor: pointer; }
.start-back:hover:not(:disabled) { color: var(--indigo); }
.start-back:disabled { cursor: not-allowed; opacity: .5; }
.start-back:focus-visible { outline: 2px solid var(--indigo); outline-offset: 3px; }
.start-form-title { margin: 0; font-family: var(--serif); font-size: 16px; font-weight: 600; color: var(--ink); }
.start-form .field { display: flex; flex-direction: column; gap: 6px; margin: 0; font-size: 12.5px; color: var(--ink-2); }
.start-form .field-label { display: flex; align-items: baseline; justify-content: space-between; gap: 6px; }
.start-form .field-label small { font-size: 11px; color: var(--ink-3); }
.start-form .field-label .req { font-style: normal; color: var(--cinnabar); margin-right: auto; }
.start-form .field input, .start-form .field textarea { width: 100%; box-sizing: border-box; padding: 9px 11px; border: 1px solid var(--rule-2); background: #fff; color: var(--ink); font: inherit; font-size: 13px; resize: vertical; }
.start-form .field input:focus, .start-form .field textarea:focus { outline: 2px solid var(--indigo); outline-offset: -1px; }

.start-upload .drop { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 20px 14px; border: 1px dashed var(--rule-2); background: var(--paper, #faf7f2); color: var(--ink-2); text-align: center; cursor: pointer; transition: border-color .18s ease, background .18s ease; }
.start-upload .drop:hover, .start-upload .drop.over { border-color: var(--indigo); background: var(--indigo-wash); }
.start-upload .drop.done { border-style: solid; border-color: var(--bamboo); }
.start-upload .drop:focus-visible { outline: 2px solid var(--indigo); outline-offset: 2px; }
.drop-glyph { font-size: 18px; color: var(--ink-3); }
.start-upload b { font-size: 13.5px; color: var(--ink); overflow-wrap: anywhere; }
.start-upload span { font-size: 12px; }
.start-upload small { font-size: 11px; color: var(--ink-3); }
.start-error { margin: 0; }
.start-actions { display: flex; justify-content: flex-end; gap: 10px; padding-top: 4px; }
@media (max-width: 520px) { .start-option { grid-template-columns: 34px minmax(0, 1fr); } .start-go { display: none; } }
@media (prefers-reduced-motion: reduce) { .start-option, .start-go, .start-upload .drop { transition: none; } }
</style>
