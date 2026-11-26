<template>
  <aside class="ai-panel" :class="{ closed: !modelValue }" aria-label="AI 创作" :aria-hidden="!modelValue">
    <div class="ai-panel-inner">
      <div class="ai-panel-head">
        <div>
          <h2>{{ mode === 'text' ? 'AI 创作 · 章节文本' : 'AI 创作 · 章节分镜' }}</h2>
          <div class="ctx">{{ chapterLabel }}</div>
        </div>
        <button class="collapse" type="button" title="收起" aria-label="收起 AI 创作" @click="emit('update:modelValue', false)">»</button>
      </div>
      <div class="ai-panel-body">
        <template v-if="applied">
          <p class="typing">已{{ mode === 'text' ? '插入正文' : '应用到分镜页' }}，可直接保存本章。</p>
          <div class="ai-actions">
            <button class="btn sm" type="button" @click="reset">继续生成</button>
            <button class="btn quiet sm" type="button" @click="emit('update:modelValue', false)">收起</button>
          </div>
        </template>
        <template v-else-if="preview || generating">
          <div class="ai-result" aria-live="polite">
            <div class="rh">{{ generating ? '正在生成…' : (mode === 'text' ? `AI 草稿 · 第 ${chapterNo} 章` : `AI 分镜 · 第 ${chapterNo} 章`) }}</div>
            <div class="preview">{{ preview }}</div>
          </div>
          <p v-if="error" class="note bad" role="alert">{{ error }}</p>
          <div class="ai-actions">
            <button class="btn sm" type="button" :disabled="generating || !preview.trim() || !canEdit" @click="apply">
              {{ mode === 'text' ? '插入到正文' : '应用到分镜页' }}
            </button>
            <button class="btn sm ghost" type="button" :disabled="generating" @click="generate">重新生成</button>
            <button class="btn quiet sm" type="button" :disabled="generating" @click="reset">丢弃</button>
          </div>
          <p class="notice-line">AI 结果只在你确认后写入，不会直接覆盖已有内容。</p>
        </template>
        <template v-else>
          <div class="ai-label">参考范围</div>
          <div class="refs" role="group" aria-label="参考范围">
            <span class="ref" :class="{ on: refs.work }" tabindex="0" role="checkbox" :aria-checked="refs.work" @click="refs.work = !refs.work" @keydown.enter.prevent="refs.work = !refs.work"><i aria-hidden="true"></i>作品资料</span>
            <span class="ref" :class="{ on: refs.summary }" tabindex="0" role="checkbox" :aria-checked="refs.summary" @click="refs.summary = !refs.summary" @keydown.enter.prevent="refs.summary = !refs.summary"><i aria-hidden="true"></i>内容概要</span>
            <span class="ref" :class="{ on: refs.prev }" tabindex="0" role="checkbox" :aria-checked="refs.prev" @click="refs.prev = !refs.prev" @keydown.enter.prevent="refs.prev = !refs.prev"><i aria-hidden="true"></i>上一章</span>
          </div>
          <div class="ai-label">{{ mode === 'text' ? '写作要求' : '分镜要求' }}</div>
          <textarea
            v-model="instruction"
            aria-label="写作要求"
            :placeholder="mode === 'text' ? '例如：把冲突提前，结尾更悬疑，保持人物对白自然。' : '例如：按本章生成 5 个分镜，标注景别与运镜。'"
          />
          <div class="chips">
            <button v-for="chip in chips" :key="chip" class="chip" type="button" @click="fillAi(chip)">{{ chip }}</button>
          </div>
          <button class="btn block" type="button" :disabled="!canEdit" style="margin-top: 6px" @click="generate">
            ✦ {{ mode === 'text' ? '生成正文草稿' : '生成章节分镜' }}
          </button>
          <p v-if="!canEdit" class="notice-line">作品审核中或当前账号无编辑权限，AI 创作暂不可用。</p>
          <div class="ai-result">
            <div class="rh">结果预览</div>
            生成结果会先显示在这里，确认后再{{ mode === 'text' ? '插入正文' : '应用到分镜页' }}，不会直接覆盖你的内容。
          </div>
          <p v-if="quotaText" class="notice-line">{{ quotaText }}</p>
        </template>
      </div>
    </div>
  </aside>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import { usePortal } from '../../../utils/portal.js'
import { studioStoryboardScript, studioWritePrompt } from '../../../utils/blueprint.js'

// 右侧滑出式 AI 创作抽屉：文本/分镜两种模式，生成结果先预览、确认后才写入
const props = defineProps({
  modelValue: Boolean,
  mode: { type: String, default: 'text' },
  work: Object,
  blueprint: Object,
  chapter: Object,
  ledger: Object,
  prevChapter: { type: String, default: '' },
  chapterNo: { type: Number, default: 1 },
  canEdit: Boolean,
  quotaText: { type: String, default: '' },
  currentContent: { type: String, default: '' }
})
const emit = defineEmits(['update:modelValue', 'apply'])
const { api } = usePortal()

const refs = ref({ work: true, summary: true, prev: false })
const instruction = ref('')
const preview = ref('')
const generating = ref(false)
const error = ref('')
const applied = ref(false)
const lastRecordId = ref(null)

const TEXT_CHIPS = ['加强冲突', '补充声音细节', '保持人物一致', '结尾留悬念']
const SHOT_CHIPS = ['整体节奏克制', '突出声音线索', '增加一个空镜']
const chips = computed(() => props.mode === 'text' ? TEXT_CHIPS : SHOT_CHIPS)
const chapterLabel = computed(() => `第 ${props.chapterNo} 章 · ${props.chapter?.chapterTitle || '未命名章节'}`)

// 切 Tab / 切章时清空预览，避免把上一章的结果插到新章。
watch(() => [props.mode, props.chapterNo], () => reset())
watch(() => props.modelValue, open => { if (!open) { /* 保留预览，便于再次打开继续确认 */ } })

function reset() {
  preview.value = ''
  error.value = ''
  applied.value = false
  generating.value = false
  lastRecordId.value = null
  instruction.value = ''
}

function fillAi(text) {
  instruction.value = instruction.value ? `${instruction.value}；${text}` : text
}

function promptFor() {
  return studioWritePrompt({
    mode: props.mode === 'text' ? 'text' : 'storyboard',
    refs: refs.value,
    work: props.work,
    blueprint: props.blueprint,
    chapter: props.chapter,
    ledger: props.ledger,
    prevChapter: props.prevChapter,
    instruction: instruction.value
  })
}

async function generate() {
  if (generating.value || !props.canEdit) return
  error.value = ''
  preview.value = ''
  applied.value = false
  generating.value = true
  try {
    if (!api.value?.generateStream) throw new Error('AI 服务暂不可用')
    if (props.mode === 'text') {
      const result = await api.value.generateStream('write', {
        prompt: promptFor(),
        type: 'script',
        workId: props.work?.workId || undefined
      }, delta => { preview.value += delta })
      if (result?.recordId) lastRecordId.value = result.recordId
      if (!preview.value.trim() && result?.content) preview.value = result.content
    } else {
      const script = studioStoryboardScript({
        refs: refs.value,
        work: props.work,
        blueprint: props.blueprint,
        chapter: props.chapter,
        ledger: props.ledger,
        prevChapter: props.prevChapter,
        currentContent: props.currentContent,
        instruction: instruction.value
      })
      const result = await api.value.generateStream('storyboard', {
        script,
        workId: props.work?.workId || undefined,
        chapterTitle: props.chapter?.chapterTitle || undefined
      }, delta => { preview.value += delta })
      if (result?.recordId) lastRecordId.value = result.recordId
      if (!preview.value.trim() && result?.content) preview.value = result.content
    }
    if (!preview.value.trim()) throw new Error('本次未返回生成内容，请重试')
  } catch (failure) {
    // 已收到的内容保留，方便用户手工取用；错误只提示不吞掉正文。
    error.value = preview.value.trim()
      ? `生成中断，已保留收到的内容：${failure.message || '请重试'}`
      : (failure.message || 'AI 生成失败，请稍后重试')
  } finally {
    generating.value = false
  }
}

function apply() {
  if (!preview.value.trim()) return
  emit('apply', { mode: props.mode, content: preview.value, recordId: lastRecordId.value })
  applied.value = true
}
</script>
