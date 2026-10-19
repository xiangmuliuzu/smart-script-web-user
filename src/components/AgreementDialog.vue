<template>
  <el-dialog :model-value="Boolean(agreement)" :title="document?.title || agreement?.title || '协议内容'" width="min(680px, calc(100vw - 32px))" append-to-body destroy-on-close @update:model-value="value => !value && emit('close')">
    <article class="agreement-content" tabindex="0" aria-label="协议正文">
      <p v-if="agreement?.version" class="agreement-version">版本：{{ agreement.version }}</p>
      <template v-if="document">
        <section v-for="section in document.sections" :key="section.title">
          <h3>{{ section.title }}</h3>
          <p v-for="paragraph in section.paragraphs" :key="paragraph">{{ paragraph }}</p>
        </section>
      </template>
      <p v-else>当前协议内容暂不可用，请稍后重试。</p>
    </article>
    <template #footer>
      <el-button @click="emit('close')">关闭</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed } from 'vue'
import { agreementDocuments } from '../content/agreements.js'

const props = defineProps({ agreement: { type: Object, default: null } })
const emit = defineEmits(['close'])
const document = computed(() => agreementDocuments[props.agreement?.type] || null)
</script>

<style scoped>
.agreement-content { max-height: 60vh; overflow-y: auto; color: var(--el-text-color-regular); line-height: 1.85; overflow-wrap: anywhere; }
.agreement-version { margin-top: 0; color: var(--el-text-color-secondary); font-size: 12px; }
.agreement-content h3 { margin: 20px 0 8px; font-size: 15px; color: var(--el-text-color-primary); }
.agreement-content p { margin: 0 0 12px; }
</style>
