<template>
  <div class="contract-editor">
    <div v-show="!readOnly" ref="toolbar" class="editor-toolbar" role="toolbar" aria-label="合同条款编辑工具" @mousedown.capture="positionPickers">
      <select class="ql-header" aria-label="段落样式" title="段落样式">
        <option selected value="">正文</option>
        <option value="1">标题 1</option>
        <option value="2">标题 2</option>
        <option value="3">标题 3</option>
      </select>
      <select class="ql-size" aria-label="字号" title="字号">
        <option value="12px">12</option>
        <option selected value="">14</option>
        <option value="18px">18</option>
        <option value="20px">20</option>
        <option value="24px">24</option>
        <option value="28px">28</option>
        <option value="32px">32</option>
      </select>
      <span class="tool-divider" />
      <button type="button" class="ql-bold" aria-label="加粗" title="加粗 Ctrl+B" />
      <button type="button" class="ql-italic" aria-label="斜体" title="斜体 Ctrl+I" />
      <button type="button" class="ql-underline" aria-label="下划线" title="下划线 Ctrl+U" />
      <button type="button" class="ql-strike" aria-label="删除线" title="删除线" />
      <select class="ql-color" aria-label="文字颜色" title="文字颜色" />
      <select class="ql-background" aria-label="高亮颜色" title="高亮颜色" />
      <span class="tool-divider" />
      <select class="ql-align" aria-label="对齐方式" title="对齐方式">
        <option selected value="">左对齐</option>
        <option value="center">居中</option>
        <option value="right">右对齐</option>
        <option value="justify">两端对齐</option>
      </select>
      <select class="ql-lineheight" aria-label="行距" title="行距">
        <option value="1.5">1.5 倍</option>
        <option selected value="">1.8 倍</option>
        <option value="2">2 倍</option>
        <option value="2.5">2.5 倍</option>
      </select>
      <button type="button" class="ql-list" value="ordered" aria-label="编号列表" title="编号列表" />
      <button type="button" class="ql-list" value="bullet" aria-label="项目符号" title="项目符号" />
      <button type="button" class="ql-blockquote" aria-label="引用段落" title="引用段落" />
      <span class="tool-divider" />
      <button type="button" class="ql-clean" aria-label="清除格式" title="清除格式" />
    </div>
    <div ref="editor" class="editor-body" />
    <div class="editor-foot">
      <span class="foot-hint">{{ hint }}</span>
      <span class="foot-count">{{ words.toLocaleString() }} 字</span>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Quill from 'quill'
import DOMPurify from 'dompurify'
import 'quill/dist/quill.snow.css'
import { contractDocumentPrefix, isContractDocument, contractDocumentText } from '../../utils/contractDocument.js'

// 合同富文本要进 iframe 预览、APP WebView 与 openhtmltopdf，因此只放行能被这些渲染器消费的标签与行内样式。
// 注意：这里不覆写全局 attributor（剧本编辑器共用同一份 Quill 注册表），
// 对齐等 class 产物在导出 HTML 时统一转成行内样式，PDF 侧才有对应表现。
const Size = Quill.import('attributors/style/size')
Size.whitelist = ['12px', '14px', '18px', '20px', '24px', '28px', '32px']
Quill.register(Size, true)
const { StyleAttributor, Scope } = Quill.import('parchment')
Quill.register(new StyleAttributor('lineheight', 'line-height', { scope: Scope.BLOCK, whitelist: ['1.5', '2', '2.5'] }), true)

const props = defineProps({
  modelValue: { type: String, default: '' },
  disabled: Boolean,
  readOnly: Boolean,
  hint: { type: String, default: '格式随合同正文一起生成 PDF；任一方签署后内容锁定。' }
})
const emit = defineEmits(['update:modelValue'])

const editor = ref(null)
const toolbar = ref(null)
const words = computed(() => contractDocumentText(props.modelValue).replace(/\s/g, '').length)
const allowedTags = ['div', 'p', 'br', 'span', 'strong', 'em', 'u', 's', 'sub', 'sup', 'h1', 'h2', 'h3', 'ol', 'ul', 'li', 'blockquote']
const sanitize = html => DOMPurify.sanitize(html, { ALLOWED_TAGS: allowedTags, ALLOWED_ATTR: ['style'], ALLOW_DATA_ATTR: false })

let quill
let lastEmitted = ''

const alignClassToStyle = { justify: 'justify', center: 'center', right: 'right' }
const alignStyleToClass = { justify: 'ql-align-justify', center: 'ql-align-center', right: 'ql-align-right', left: '' }

function eachStyled(html, handler) {
  const host = document.createElement('div')
  host.innerHTML = html
  host.querySelectorAll('p, h1, h2, h3, li, blockquote, div, span').forEach(el => {
    handler(el)
    if (el.getAttribute('class') === '') el.removeAttribute('class')
    if (el.getAttribute('style') === '') el.removeAttribute('style')
  })
  return host.innerHTML
}

// 导出：Quill 默认用 class 表达对齐，预览与 PDF 渲染器只认行内样式
function toRenderHtml(html) {
  return eachStyled(html, el => {
    const aligned = Array.from(el.classList).filter(cls => cls.startsWith('ql-align-'))
    if (aligned.length === 0) return
    aligned.forEach(cls => {
      const value = alignClassToStyle[cls.replace('ql-align-', '')]
      if (value) el.style.setProperty('text-align', value)
      el.classList.remove(cls)
    })
  })
}

// 回填：APP 端与历史富文本存的是行内 text-align，还原成 class 才能被编辑态识别
function toEditorHtml(html) {
  return eachStyled(html, el => {
    const value = (el.style.getPropertyValue('text-align') || '').toLowerCase()
    if (!value) return
    const cls = alignStyleToClass[value]
    if (cls) el.classList.add(cls)
    el.style.removeProperty('text-align')
  })
}

// 历史纯文本（含模板默认条款）按后端纯文本分支的口径回填：「第…条」行是小标题，其余是段落。
function plainToHtml(text) {
  const host = document.createElement('div')
  String(text).split(/\r?\n/).forEach(raw => {
    const line = raw.trim()
    if (!line) return
    const el = document.createElement(/^第[一二三四五六七八九十百千0-9]+条/.test(line) ? 'h3' : 'p')
    el.textContent = line
    host.appendChild(el)
  })
  return host.innerHTML
}

// 带标记的按富文本回填，历史纯文本按小标题+段落回填，两种口径都与渲染结果一致
function load(value, source = 'silent') {
  if (isContractDocument(value)) {
    const body = value.slice(contractDocumentPrefix.length, -'</div>'.length)
    quill.setContents(quill.clipboard.convert({ html: toEditorHtml(sanitize(body)) }), source)
  } else if (!value) quill.setText('', source)
  else quill.setContents(quill.clipboard.convert({ html: plainToHtml(value) }), source)
}

function change() {
  lastEmitted = quill.getText().trim() ? contractDocumentPrefix + toRenderHtml(quill.getSemanticHTML()) + '</div>' : ''
  emit('update:modelValue', lastEmitted)
}

function setDisabled(value) {
  quill.enable(!value)
  quill.root.setAttribute('aria-readonly', String(value))
  toolbar.value.classList.toggle('is-locked', !!value)
  toolbar.value.querySelectorAll('button,select').forEach(control => { control.disabled = !!value })
}

// 弹窗内是滚动容器，下拉面板改固定定位避免被裁切
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

onMounted(() => {
  quill = new Quill(editor.value, {
    theme: 'snow',
    placeholder: '请输入合同正文条款',
    formats: ['size', 'bold', 'italic', 'underline', 'strike', 'color', 'background', 'header', 'align', 'list', 'blockquote', 'lineheight'],
    modules: { toolbar: toolbar.value, history: { delay: 700, maxStack: 100, userOnly: true } }
  })
  quill.root.setAttribute('role', 'textbox')
  quill.root.setAttribute('aria-label', '合同正文条款')
  quill.root.setAttribute('aria-multiline', 'true')
  load(props.modelValue)
  quill.history.clear()
  quill.on('text-change', change)
  setDisabled(props.disabled || props.readOnly)
  toolbar.value.querySelectorAll('.ql-picker').forEach(picker => {
    picker.querySelector('.ql-picker-label')?.setAttribute('aria-label', picker.getAttribute('aria-label'))
  })
})

watch(() => props.modelValue, value => {
  if (!quill || value === lastEmitted) return
  load(value, 'api')
})
watch(() => [props.disabled, props.readOnly], ([disabled, readOnly]) => { if (quill) setDisabled(disabled || readOnly) })
onBeforeUnmount(() => quill?.off('text-change', change))
</script>

<style scoped>
.contract-editor { display: flex; flex-direction: column; width: 100%; }
.editor-toolbar { display: flex; align-items: center; flex-wrap: wrap; gap: 4px; padding: 6px 8px; background: #faf9f5; border: 1px solid #dcdfe6; border-bottom: 0; border-radius: 6px 6px 0 0; }
.editor-toolbar :deep(.ql-formats) { margin: 0; display: inline-flex; align-items: center; }
.editor-toolbar :deep(button) { width: 28px; height: 26px; padding: 3px 4px; }
.editor-toolbar :deep(.ql-picker.ql-header) { width: 78px; }
.editor-toolbar :deep(.ql-picker.ql-size) { width: 58px; }
.editor-toolbar :deep(.ql-picker.ql-align) { width: 74px; }
.editor-toolbar :deep(.ql-picker.ql-lineheight) { width: 68px; }
.editor-toolbar :deep(.ql-picker-label) { font-size: 12px; }
.editor-toolbar :deep(.ql-picker.ql-size .ql-picker-label::before), .editor-toolbar :deep(.ql-picker.ql-size .ql-picker-item::before) { content: '14'; }
.editor-toolbar :deep(.ql-picker.ql-size [data-value]::before) { content: attr(data-value); font-size: 12px; }
.editor-toolbar :deep(.ql-picker.ql-header .ql-picker-label::before), .editor-toolbar :deep(.ql-picker.ql-header .ql-picker-item::before) { content: '正文'; }
.editor-toolbar :deep(.ql-picker.ql-header [data-value]::before) { content: '标题 ' attr(data-value); }
.editor-toolbar :deep(.ql-picker.ql-lineheight .ql-picker-label::before), .editor-toolbar :deep(.ql-picker.ql-lineheight .ql-picker-item::before) { content: '1.8 倍'; }
.editor-toolbar :deep(.ql-picker.ql-lineheight [data-value]::before) { content: attr(data-value) ' 倍'; }
.editor-toolbar :deep(.ql-picker-options) { z-index: 1200; max-height: 240px; overflow-y: auto; }
.editor-toolbar.is-locked :deep(.ql-picker) { pointer-events: none; opacity: .45; }
.tool-divider { width: 1px; height: 18px; background: #e4e7ed; margin: 0 3px; }
.editor-body { flex: 1; min-height: 0; background: #fff; border: 1px solid #dcdfe6; border-radius: 0 0 6px 6px; box-sizing: border-box; }
.editor-body :deep(.ql-container) { border: 0; }
/* 编辑区排版与后端合同文档同一口径（ContractHtmlSupport 的 body 与 .clause-rich 规则），
   ContractCjk 是 PDF 内嵌字体，浏览器侧用同族宋体近似，编辑器里看到的就是签约时看到的。
   字号字体必须写在 .ql-editor 上，Quill 自带样式在该元素上有同名声明，只放容器会被盖掉。 */
.editor-body :deep(.ql-editor) { min-height: 300px; max-height: 46vh; overflow-y: auto; padding: 12px 14px; font-family: SimSun, 'Songti SC', serif; font-size: 14px; line-height: 1.8; color: #000; text-align: justify; box-sizing: border-box; }
.editor-body :deep(.ql-editor.ql-blank::before) { left: 14px; right: 14px; font-style: normal; color: #a8abb2; }
.editor-body :deep(.ql-editor p) { margin: 15px 0; text-indent: 28px; }
.editor-body :deep(.ql-editor h1), .editor-body :deep(.ql-editor h2), .editor-body :deep(.ql-editor h3) { font-weight: bold; margin: 20px 0 10px; }
.editor-body :deep(.ql-editor h1) { font-size: 20px; }
.editor-body :deep(.ql-editor h2) { font-size: 17px; }
.editor-body :deep(.ql-editor h3) { font-size: 16px; }
.editor-body :deep(.ql-editor ul), .editor-body :deep(.ql-editor ol) { margin: 15px 0; padding-left: 28px; }
/* Quill 2 用绝对定位的 .ql-ui 自绘列表符号，会把符号挤到正文起点、与合同上的项目符号位置不一致；
   这里改回浏览器原生 list-item 记号，和 openhtmltopdf 渲染的 <ol>/<ul> 保持同一缩进（正文起于 28px）。 */
.editor-body :deep(.ql-editor li) { list-style-type: disc; list-style-position: outside; padding-left: 0; margin-bottom: 4px; }
.editor-body :deep(.ql-editor ol > li) { list-style-type: decimal; }
.editor-body :deep(.ql-editor li > .ql-ui) { display: none; }
.editor-body :deep(.ql-editor blockquote) { margin: 15px 0 15px 16px; padding-left: 12px; border-left: 3px solid #999; color: #444; }
.editor-foot { display: flex; justify-content: space-between; gap: 10px; margin-top: 6px; font-size: 12px; color: #909399; }
</style>
