<template>
  <el-dialog :model-value="modelValue" title="开始创作" width="min(600px, 94vw)" class="start-create-dialog" align-center :close-on-click-modal="true" @update:model-value="emit('update:modelValue', $event)">
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
      <button type="button" class="start-option" data-kind="import" @click="choose('import')">
        <span class="start-mark" aria-hidden="true">⇪</span>
        <span class="start-copy">
          <span class="start-name">导入剧本</span>
          <span class="start-desc">上传已完成的 .txt / .docx / .md 剧本，导入后进入工作台继续编辑与分集。</span>
        </span>
        <span class="start-go" aria-hidden="true">→</span>
      </button>
      <button type="button" class="start-option" data-kind="editor" @click="choose('editor')">
        <span class="start-mark" aria-hidden="true">✎</span>
        <span class="start-copy">
          <span class="start-name">自己编辑</span>
          <span class="start-desc">从空白作品开始，自己写第一幕；创建后可以继续补充简介、章节和版权信息。</span>
        </span>
        <span class="start-go" aria-hidden="true">→</span>
      </button>
    </div>
  </el-dialog>
</template>
<script setup>
defineProps({ modelValue: Boolean })
const emit = defineEmits(['update:modelValue', 'select'])
function choose(mode) {
  emit('select', mode)
  emit('update:modelValue', false)
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
@media (max-width: 520px) { .start-option { grid-template-columns: 34px minmax(0, 1fr); } .start-go { display: none; } }
@media (prefers-reduced-motion: reduce) { .start-option, .start-go { transition: none; } }
</style>
