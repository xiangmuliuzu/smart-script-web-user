<template>
  <article class="copyright-card">
    <div class="cover">
      <img v-if="coverUrl && !coverFailed" :src="coverUrl" alt="" @error="coverFailed = true" />
      <span v-else>{{ title.slice(0, 1) }}</span>
    </div>
    <div class="content">
      <div class="card-info">
        <div class="title-row"><h3>{{ title }}</h3><span v-if="status" class="status">{{ status }}</span></div>
        <slot />
      </div>
      <div class="card-footer">
        <el-popover v-model:visible="open" trigger="click" placement="bottom-end" :width="160" :show-arrow="false" popper-class="copyright-actions-popover">
          <template #reference><button type="button" class="more" :aria-label="title + '的操作'" :aria-expanded="open">···</button></template>
          <div class="actions" @click="closeOnAction"><slot name="actions" /></div>
        </el-popover>
      </div>
    </div>
  </article>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { avatarUrl } from '../../../utils/avatarUrl.js'

const props = defineProps({ title: { type: String, required: true }, cover: String, status: String })
const open = ref(false)
const coverFailed = ref(false)
const coverUrl = computed(() => avatarUrl(props.cover || ''))
watch(coverUrl, () => { coverFailed.value = false })
function closeOnAction(event) {
  if (event.target.closest('button:not(:disabled)')) open.value = false
}
</script>

<style scoped>
.copyright-card { display: grid; grid-template-columns: 140px minmax(0, 1fr); height: calc(140px * 297 / 210 + 2px); background: var(--paper-2); border: 1px solid var(--rule); border-radius: var(--radius); overflow: hidden; }
.cover { position: relative; display: grid; place-items: center; width: 100%; aspect-ratio: 210 / 297; overflow: hidden; background: #e9e5da; border-right: 1px solid var(--rule); color: rgba(27, 26, 24, .18); font: 36px var(--serif); }
.cover img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.content { min-width: 0; min-height: 0; padding: 12px 16px; display: flex; flex-direction: column; }
.card-info { min-height: 0; overflow-y: auto; overflow-wrap: anywhere; }
.content :deep(p) { margin: 4px 0 0; line-height: 1.45; }
.title-row { display: flex; align-items: baseline; flex-wrap: wrap; gap: 10px; }
.title-row h3 { margin: 0; font-size: 18px; overflow-wrap: anywhere; }
.status { color: var(--indigo); font-size: 12px; }
.card-footer { display: flex; justify-content: flex-end; margin-top: auto; }
.more { width: 38px; height: 32px; border: 1px solid var(--rule); border-radius: var(--radius); background: transparent; color: var(--ink); font-size: 20px; line-height: 1; cursor: pointer; }
.more:focus-visible { outline: 2px solid var(--indigo); outline-offset: 2px; }
.actions { display: grid; gap: 6px; }
.actions :deep(button) { justify-content: flex-start; width: 100%; padding: 9px 12px; border: 0; border-radius: 2px; background: transparent; color: var(--ink); text-align: left; }
.actions :deep(button:hover:not(:disabled)) { background: var(--indigo-wash); color: var(--indigo); }
@media (max-width: 1100px) { .copyright-card { grid-template-columns: 124px minmax(0, 1fr); height: calc(124px * 297 / 210 + 2px); } }
@media (max-width: 620px) { .copyright-card { grid-template-columns: 108px minmax(0, 1fr); height: calc(108px * 297 / 210 + 2px); } .content { padding: 10px 12px; } }
</style>
