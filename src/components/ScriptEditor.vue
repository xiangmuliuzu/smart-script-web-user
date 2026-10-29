<template>
  <div class="script-editor" :class="{ 'script-editor-compact': compact }">
    <div v-show="!readOnly" class="document-toolbar-frame">
      <button type="button" class="toolbar-scroll-arrow" aria-label="向左滚动工具栏" :disabled="atStart" @click="scrollTools(-1)">‹</button>
    <div ref="toolbar" class="document-toolbar" role="toolbar" aria-label="文档编辑工具" tabindex="0" @scroll="updateScroll" @mousedown.capture="positionPickers" @keydown.capture="toolbarKey">
      <div class="document-tools-row">
        <button type="button" aria-label="撤销" title="撤销 Ctrl+Z" :disabled="disabled" @mousedown.prevent @click="quill.history.undo()">↶</button>
        <button type="button" aria-label="重做" title="重做 Ctrl+Shift+Z" :disabled="disabled" @mousedown.prevent @click="quill.history.redo()">↷</button>
        <span class="tool-divider" />
        <select class="ql-font" aria-label="字体" title="字体"><option selected value="">默认字体</option><option value="songti">宋体</option><option value="heiti">黑体</option><option value="kaiti">楷体</option><option value="fangsong">仿宋</option><option value="arial">Arial</option><option value="times">Times New Roman</option></select>
        <select class="ql-size" aria-label="字号" title="字号"><option value="12px">12</option><option value="14px">14</option><option selected value="">16</option><option value="18px">18</option><option value="20px">20</option><option value="24px">24</option><option value="28px">28</option><option value="32px">32</option></select>
        <span class="tool-divider" />
        <button type="button" class="ql-bold" aria-label="加粗" title="加粗 Ctrl+B" />
        <button type="button" class="ql-italic" aria-label="斜体" title="斜体 Ctrl+I" />
        <button type="button" class="ql-underline" aria-label="下划线" title="下划线 Ctrl+U" />
        <button type="button" class="ql-strike" aria-label="删除线" title="删除线" />
        <select class="ql-color" aria-label="文字颜色" title="文字颜色" />
        <select class="ql-background" aria-label="高亮颜色" title="高亮颜色" />
        <button type="button" class="ql-clean" aria-label="清除格式" title="清除格式" />
      </div>
      <div class="document-tools-row paragraph-tools">
        <select class="ql-header" aria-label="段落样式" title="段落样式"><option selected value="">正文</option><option value="1">标题 1</option><option value="2">标题 2</option><option value="3">标题 3</option></select>
        <select class="ql-align" aria-label="对齐方式" title="对齐方式"><option selected value="">左对齐</option><option value="center">居中</option><option value="right">右对齐</option><option value="justify">两端对齐</option></select>
        <button type="button" class="ql-list" value="ordered" aria-label="编号列表" title="编号列表" />
        <button type="button" class="ql-list" value="bullet" aria-label="项目符号" title="项目符号" />
        <button type="button" class="ql-indent" value="-1" aria-label="减少缩进" title="减少缩进" />
        <button type="button" class="ql-indent" value="+1" aria-label="增加缩进" title="增加缩进" />
        <button type="button" class="ql-blockquote" aria-label="引用段落" title="引用段落" />
        <select class="ql-lineheight" aria-label="行距" title="行距"><option value="1.5">1.5 倍</option><option selected value="">2 倍</option><option value="2.5">2.5 倍</option></select>
        <span class="tool-divider" />
        <button v-for="tool in tools" :key="tool.label" type="button" class="screenplay-tool" :disabled="disabled" @mousedown.prevent @click="insert(tool.text)">{{ tool.label }}</button>
      </div>
    </div>
      <button type="button" class="toolbar-scroll-arrow" aria-label="向右滚动工具栏" :disabled="atEnd" @click="scrollTools(1)">›</button>
    </div>
    <div class="script-paper">
      <input v-if="!hideTitle" class="episode-title" aria-label="分集标题" :value="title" maxlength="100" :disabled="disabled" :readonly="readOnly" placeholder="输入分集标题" @input="$emit('update:title', $event.target.value)" />
      <div ref="editor" class="rich-document" />
    </div>
  </div>
</template>
<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Quill from 'quill'
import DOMPurify from 'dompurify'
import 'quill/dist/quill.snow.css'
import { isFormattedDocument, documentPrefix } from '../utils/document.js'

const Font = Quill.import('attributors/class/font')
Font.whitelist = ['songti', 'heiti', 'kaiti', 'fangsong', 'arial', 'times']
const Size = Quill.import('attributors/style/size')
Size.whitelist = ['12px', '14px', '18px', '20px', '24px', '28px', '32px']
Quill.register(Font, true); Quill.register(Size, true)
const { StyleAttributor, Scope } = Quill.import('parchment')
Quill.register(new StyleAttributor('lineheight', 'line-height', { scope: Scope.BLOCK, whitelist: ['1.5', '2', '2.5'] }), true)
const props = defineProps({ modelValue: { type: String, default: '' }, title: String, disabled: Boolean, readOnly: Boolean, hideTitle: Boolean, compact: Boolean, label: { type: String, default: '分集正文' } })
const emit = defineEmits(['update:modelValue', 'update:title'])
const editor = ref(null)
const toolbar = ref(null)
const atStart = ref(true)
const atEnd = ref(false)
let resizeObserver
let quill
let lastEmitted = ''
const tools = [
  { label: '＋ 场景头', text: '1-1  日  内  场景名称\n人物：\n' },
  { label: '＋ 人物对话', text: '人物：（语气）\n' },
  { label: '△ 动作', text: '△ ' },
  { label: '【内心 OS】', text: '【人物 OS：】' }
]
const sanitize = html => DOMPurify.sanitize(html, { ALLOWED_TAGS: ['div', 'p', 'br', 'span', 'strong', 'em', 'u', 's', 'sub', 'sup', 'h1', 'h2', 'h3', 'ol', 'ul', 'li', 'blockquote'], ALLOWED_ATTR: ['class', 'style'], ALLOW_DATA_ATTR: false })
function load(value, source = 'silent') {
  if (isFormattedDocument(value)) quill.setContents(quill.clipboard.convert({ html: sanitize(value) }), source)
  else quill.setText(value, source)
}
function updateScroll() {
  atStart.value = toolbar.value.scrollLeft <= 1
  atEnd.value = toolbar.value.scrollLeft + toolbar.value.clientWidth >= toolbar.value.scrollWidth - 1
  positionPickers()
}
function scrollTools(direction) { toolbar.value.scrollBy({ left: direction * Math.max(180, toolbar.value.clientWidth * .65), behavior: 'smooth' }) }
function toolbarKey(event) {
  positionPickers()
  if (event.target === toolbar.value && ['ArrowLeft', 'ArrowRight'].includes(event.key)) { event.preventDefault(); scrollTools(event.key === 'ArrowRight' ? 1 : -1) }
}
function positionPickers() {
  requestAnimationFrame(() => {
    if (!toolbar.value) return
    toolbar.value.querySelectorAll('.ql-picker.ql-expanded').forEach(picker => {
      const options = picker.querySelector('.ql-picker-options')
      const anchor = picker.getBoundingClientRect()
      options.style.position = 'fixed'
      options.style.top = `${anchor.bottom + 4}px`
      options.style.left = `${Math.max(8, Math.min(anchor.left, innerWidth - options.offsetWidth - 8))}px`
    })
  })
}
function change() {
  lastEmitted = quill.getText().trim() ? documentPrefix + quill.getSemanticHTML() + '</div>' : ''
  emit('update:modelValue', lastEmitted)
}
function setDisabled(value) {
  quill.enable(!value)
  quill.root.setAttribute('aria-readonly', String(value))
  toolbar.value.querySelectorAll('button,select,.ql-picker').forEach(control => {
    if (control.matches('button,select')) control.disabled = value
    control.setAttribute('aria-disabled', String(value))
  })
}
function insert(text) {
  if (!quill || props.disabled || props.readOnly) return
  const range = quill.getSelection() || { index: quill.getLength() - 1, length: 0 }
  const prefix = range.index > 0 && quill.getText(range.index - 1, 1) !== '\n' ? '\n' : ''
  quill.history.cutoff(); quill.deleteText(range.index, range.length, 'user'); quill.insertText(range.index, prefix + text, 'user'); quill.setSelection(range.index + prefix.length + text.length, 0, 'user'); quill.history.cutoff()
}
function appendText(text) {
  if (!quill || props.disabled || props.readOnly) return
  const index = quill.getLength() - 1
  quill.history.cutoff(); quill.insertText(index, (index ? '\n\n' : '') + text, 'user'); quill.setSelection(quill.getLength() - 1, 0); quill.history.cutoff()
}
defineExpose({ appendText })
onMounted(() => {
  quill = new Quill(editor.value, { theme: 'snow', placeholder: '在这里写下第一幕。也可以导入剧本，或让 AI 帮你展开灵感。', formats: ['font', 'size', 'bold', 'italic', 'underline', 'strike', 'color', 'background', 'header', 'align', 'list', 'indent', 'blockquote', 'lineheight'], modules: { toolbar: toolbar.value, history: { delay: 700, maxStack: 100, userOnly: true } } })
  quill.root.setAttribute('role', 'textbox'); quill.root.setAttribute('aria-label', props.label); quill.root.setAttribute('aria-multiline', 'true')
  load(props.modelValue); quill.history.clear(); quill.on('text-change', change); setDisabled(props.disabled || props.readOnly)
  // Quill 的字体选择器使用可见标签；赋予键盘焦点和可访问名称。
  toolbar.value.querySelectorAll('.ql-picker').forEach(picker => {
    const label = picker.querySelector('.ql-picker-label')
    label.setAttribute('aria-label', picker.getAttribute('aria-label'))
  })
  resizeObserver = new ResizeObserver(updateScroll); resizeObserver.observe(toolbar.value); updateScroll()
})
watch(() => props.modelValue, value => {
  if (!quill || value === lastEmitted) return
  load(value, 'api')
})
watch(() => [props.disabled, props.readOnly], ([disabled, readOnly]) => { if (quill) { setDisabled(disabled || readOnly); if (!readOnly) updateScroll() } })
onBeforeUnmount(() => { resizeObserver?.disconnect(); quill?.off('text-change', change) })
</script>
