<template>
  <div class="placement-pad">
    <div class="pad-toolbar">
      <button class="btn sm ghost" type="button" :disabled="current <= 0" @click="go(current - 1)">上一页</button>
      <span class="page-indicator">第 {{ current + 1 }} / {{ pages.length }} 页</span>
      <button class="btn sm ghost" type="button" :disabled="current >= pages.length - 1" @click="go(current + 1)">下一页</button>
      <span class="pad-tip">拖动签名 / 印章到签署位置，拖右下角圆点缩放；翻页可放到任意页。</span>
    </div>

    <div ref="stageEl" class="pad-stage">
      <img v-if="pages[current]" class="page-img" :src="resolveUrl(pages[current])" alt="" draggable="false" />
      <div
        v-for="chip in chipsOnCurrent"
        :key="chip.kind"
        class="stamp"
        :class="{ active: chip.kind === activeKind }"
        :style="stampStyle(chip)"
        @pointerdown.prevent="startMove($event, chip)"
      >
        <img :src="chip.src" alt="" draggable="false" />
        <span class="stamp-tag">{{ chip.kind === 'signature' ? '签名' : '印章' }}</span>
        <span class="resize-handle" @pointerdown.stop.prevent="startResize($event, chip)"></span>
      </div>
      <p v-if="!chips.length" class="pad-empty">请先在下方手写签名或选择印章，再回到此处拖动定位。</p>
    </div>

    <div class="pad-foot">
      <span class="cost">{{ hint }}</span>
      <button class="btn sm" type="button" :disabled="!canConfirm" @click="confirm">{{ confirmLabel }}</button>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { avatarUrl } from '../../utils/avatarUrl.js'

const props = defineProps({
  pages: { type: Array, default: () => [] },
  signatureSrc: { type: String, default: null },
  sealSrc: { type: String, default: null },
  confirmLabel: { type: String, default: '确认落章并完成签署' },
  hint: { type: String, default: '' }
})
const emit = defineEmits(['confirm'])

const stageEl = ref(null)
const current = ref(0)
// chips：每类（签名/印章）一枚，坐标以页面比例存储（x/y 左上角，w 宽度，均相对渲染盒）
const chips = ref([])
const activeKind = ref('')

const DEFAULTS = {
  signature: { x: 0.08, y: 0.72, w: 0.28 },
  seal: { x: 0.6, y: 0.68, w: 0.2 }
}

const chipsOnCurrent = computed(() => chips.value.filter(c => c.page === current.value))
const canConfirm = computed(() => chips.value.length > 0)

function resolveUrl(raw) {
  return avatarUrl(raw) || raw
}

function go(i) {
  current.value = Math.max(0, Math.min(i, (props.pages.length || 1) - 1))
}

// 依据父级传入的签名/印章预览同步 chips：出现则默认落位当前页，消失则移除
watch(
  () => [props.signatureSrc, props.sealSrc],
  () => {
    syncChip('signature', props.signatureSrc)
    syncChip('seal', props.sealSrc)
  },
  { immediate: true }
)

function syncChip(kind, src) {
  const idx = chips.value.findIndex(c => c.kind === kind)
  if (!src) {
    if (idx >= 0) chips.value.splice(idx, 1)
    return
  }
  if (idx >= 0) {
    chips.value[idx].src = src
    return
  }
  const d = DEFAULTS[kind]
  chips.value.push({ kind, src, page: current.value, x: d.x, y: d.y, w: d.w })
  activeKind.value = kind
}

function stampStyle(chip) {
  return {
    left: chip.x * 100 + '%',
    top: chip.y * 100 + '%',
    width: chip.w * 100 + '%'
  }
}

function stageRect() {
  return stageEl.value ? stageEl.value.getBoundingClientRect() : { width: 1, height: 1 }
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(v, max))
}

function startMove(e, chip) {
  activeKind.value = chip.kind
  const rect = stageRect()
  const startX = e.clientX
  const startY = e.clientY
  const origX = chip.x
  const origY = chip.y
  const move = ev => {
    const dx = (ev.clientX - startX) / rect.width
    const dy = (ev.clientY - startY) / rect.height
    chip.x = clamp(origX + dx, 0, 1 - chip.w)
    chip.y = clamp(origY + dy, 0, 0.99)
  }
  const up = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}

function startResize(e, chip) {
  activeKind.value = chip.kind
  const rect = stageRect()
  const startX = e.clientX
  const origW = chip.w
  const move = ev => {
    const dx = (ev.clientX - startX) / rect.width
    chip.w = clamp(origW + dx, 0.03, 1 - chip.x)
  }
  const up = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}

function getPlacements() {
  return chips.value.map(c => ({
    kind: c.kind,
    page: c.page,
    x: round4(c.x),
    y: round4(c.y),
    w: round4(c.w)
  }))
}

function round4(v) {
  return Math.round(v * 10000) / 10000
}

function confirm() {
  if (!canConfirm.value) return
  emit('confirm', getPlacements())
}

defineExpose({ getPlacements })
</script>

<style scoped>
.placement-pad { display: flex; flex-direction: column; gap: 8px }
.pad-toolbar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font-size: 12px }
.page-indicator { color: #606266 }
.pad-tip { color: #909399; font-size: 12px }
.pad-stage { position: relative; border: 1px solid #ebeef5; border-radius: 6px; background: #f4f4f5; overflow: hidden; min-height: 200px; touch-action: none }
.page-img { display: block; width: 100%; height: auto; user-select: none }
.stamp { position: absolute; cursor: move; border: 1px dashed transparent; border-radius: 4px; box-sizing: border-box }
.stamp.active { border-color: #409eff }
.stamp img { display: block; width: 100%; height: auto; pointer-events: none; user-select: none }
.stamp-tag { position: absolute; left: 0; top: -16px; font-size: 10px; color: #409eff; background: #fff; padding: 0 4px; border-radius: 3px; pointer-events: none; white-space: nowrap }
.resize-handle { position: absolute; right: -6px; bottom: -6px; width: 12px; height: 12px; border-radius: 50%; background: #409eff; border: 2px solid #fff; cursor: nwse-resize }
.pad-empty { position: absolute; inset: 0; display: grid; place-items: center; color: #909399; font-size: 13px; text-align: center; padding: 0 20px }
.pad-foot { display: flex; align-items: center; justify-content: space-between; gap: 8px }
.pad-foot .cost { font-size: 12px; color: #909399 }
.btn.sm.ghost { padding: 3px 10px; font-size: 12px; border: 1px solid #dcdfe6; background: #fff; border-radius: 4px; cursor: pointer }
.btn.sm.ghost:disabled { opacity: .5; cursor: not-allowed }
.btn.sm { padding: 4px 14px; font-size: 13px; border: 0; background: #409eff; color: #fff; border-radius: 4px; cursor: pointer }
.btn.sm:disabled { opacity: .6; cursor: not-allowed }
</style>
