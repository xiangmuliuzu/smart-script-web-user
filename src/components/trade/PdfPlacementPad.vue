<template>
  <div class="placement-pad">
    <div class="pad-toolbar">
      <button class="btn sm ghost" type="button" :disabled="current <= 0" @click="go(current - 1)">上一页</button>
      <span class="page-indicator">第 {{ current + 1 }} / {{ pages.length }} 页</span>
      <button class="btn sm ghost" type="button" :disabled="current >= pages.length - 1" @click="go(current + 1)">下一页</button>
      <span class="pad-tip">拖动签名 / 印章到签署位置；拖四角控制点等比缩放，拖顶部圆点旋转（按住 Shift 按 15° 吸附）；翻页可放到任意页。</span>
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
        <span class="stamp-tag">{{ chip.kind === 'signature' ? '签名' : '印章' }}{{ angleText(chip) }}</span>
        <span class="corner nw" @pointerdown.stop.prevent="startScale($event, chip, -1)"></span>
        <span class="corner ne" @pointerdown.stop.prevent="startScale($event, chip, 1)"></span>
        <span class="corner sw" @pointerdown.stop.prevent="startScale($event, chip, -1)"></span>
        <span class="corner se" @pointerdown.stop.prevent="startScale($event, chip, 1)"></span>
        <span class="rotate-stem"></span>
        <span class="rotate-handle" @pointerdown.stop.prevent="startRotate($event, chip)"></span>
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
// chips：每类（签名/印章）一枚。x/y 为未旋转浮块左上角、w 为宽度，均相对渲染盒的比例；
// rot 为绕浮块中心的顺时针角度（度），与后端落章的 rot 同义。
const chips = ref([])
const activeKind = ref('')

const DEFAULTS = {
  signature: { x: 0.08, y: 0.72, w: 0.28, rot: 0 },
  seal: { x: 0.6, y: 0.68, w: 0.2, rot: 0 }
}
// 缩放/旋转后仍要保证落章坐标落在后端校验范围内
const MIN_W = 0.03
const SNAP_DEG = 15

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
  chips.value.push({ kind, src, page: current.value, x: d.x, y: d.y, w: d.w, rot: d.rot })
  activeKind.value = kind
}

function stampStyle(chip) {
  return {
    left: chip.x * 100 + '%',
    top: chip.y * 100 + '%',
    width: chip.w * 100 + '%',
    transform: `rotate(${chip.rot}deg)`
  }
}

function angleText(chip) {
  return chip.rot ? ' ' + Math.round(chip.rot) + '°' : ''
}

function stageRect() {
  return stageEl.value ? stageEl.value.getBoundingClientRect() : { width: 1, height: 1 }
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(v, max))
}

// 高度不单独存字段：由图片自身宽高比推出（后端落章同理），换算成占渲染盒高度的比例
function heightFrac(chip, pointerEvent) {
  const img = pointerEvent && pointerEvent.target ? pointerEvent.target.closest('.stamp') : null
  const node = img ? img.querySelector('img') : null
  const rect = stageRect()
  if (!node || !node.naturalWidth || !rect.height) return 0
  return chip.w * (node.naturalHeight / node.naturalWidth) * (rect.width / rect.height)
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
  drag(move)
}

// 四角等比缩放：绕中心缩放（与绕中心旋转配套），沿章自身“宽度方向”的位移才生效，
// 因此旋转过之后斜着拖角也符合直觉；左侧两角取反方向。
function startScale(e, chip, sign) {
  activeKind.value = chip.kind
  const rect = stageRect()
  const startX = e.clientX
  const startY = e.clientY
  const origW = chip.w
  const origX = chip.x
  const origY = chip.y
  const origH = heightFrac(chip, e)
  const centerX = origX + origW / 2
  const centerY = origY + origH / 2
  const rad = (chip.rot * Math.PI) / 180
  const axisX = Math.cos(rad)
  const axisY = Math.sin(rad)
  const move = ev => {
    const px = ev.clientX - startX
    const py = ev.clientY - startY
    // 位移投影到章自身的“宽度方向”（屏幕坐标 y 向下，CSS 顺时针角直接用 cos/sin）
    const along = ((px * axisX + py * axisY) / rect.width) * sign
    const w = clamp(origW + along, MIN_W, 1)
    chip.w = w
    chip.x = clamp(centerX - w / 2, 0, 1 - w)
    const h = w * (origH / origW)
    chip.y = clamp(centerY - h / 2, 0, 0.99 - h)
  }
  drag(move)
}

// 顶部圆点旋转：以浮块中心为轴，Shift 吸附到 15°
function startRotate(e, chip) {
  activeKind.value = chip.kind
  const el = e.target.closest('.stamp')
  const box = el ? el.getBoundingClientRect() : stageRect()
  const centerX = box.left + box.width / 2
  const centerY = box.top + box.height / 2
  const startAngle = angleOf(e.clientX, e.clientY, centerX, centerY)
  const origRot = chip.rot
  const move = ev => {
    let next = origRot + (angleOf(ev.clientX, ev.clientY, centerX, centerY) - startAngle)
    if (ev.shiftKey) next = Math.round(next / SNAP_DEG) * SNAP_DEG
    chip.rot = clamp(wrapDegrees(next), -180, 180)
  }
  drag(move)
}

function angleOf(x, y, cx, cy) {
  return (Math.atan2(y - cy, x - cx) * 180) / Math.PI
}

function wrapDegrees(deg) {
  let value = deg
  while (value > 180) value -= 360
  while (value < -180) value += 360
  return value
}

function drag(move) {
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
    w: round4(c.w),
    rot: round2(c.rot)
  }))
}

function round4(v) {
  return Math.round(v * 10000) / 10000
}

function round2(v) {
  return Math.round(v * 100) / 100
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
.page-indicator { color: var(--ink-2) }
.pad-tip { color: var(--ink-3); font-size: 12px }
.pad-stage { position: relative; border: 1px solid #ebeef5; border-radius: 6px; background: var(--paper-3); overflow: hidden; min-height: 200px; touch-action: none }
.page-img { display: block; width: 100%; height: auto; user-select: none }
.stamp { position: absolute; cursor: move; border: 1px dashed transparent; border-radius: 4px; box-sizing: border-box }
.stamp.active { border-color: var(--cinnabar) }
.stamp img { display: block; width: 100%; height: auto; pointer-events: none; user-select: none }
.stamp-tag { position: absolute; left: 0; top: -16px; font-size: 10px; color: var(--cinnabar); background: #fff; padding: 0 4px; border-radius: 3px; pointer-events: none; white-space: nowrap }
.corner { position: absolute; width: 10px; height: 10px; background: #fff; border: 2px solid var(--indigo); border-radius: 2px; box-sizing: border-box }
.corner.nw { left: -6px; top: -6px; cursor: nwse-resize }
.corner.ne { right: -6px; top: -6px; cursor: nesw-resize }
.corner.sw { left: -6px; bottom: -6px; cursor: nesw-resize }
.corner.se { right: -6px; bottom: -6px; cursor: nwse-resize }
.rotate-stem { position: absolute; left: 50%; top: -22px; width: 1px; height: 22px; background: var(--indigo); pointer-events: none }
.rotate-handle { position: absolute; left: 50%; top: -32px; width: 14px; height: 14px; margin-left: -7px; border-radius: 50%; background: var(--indigo); border: 2px solid #fff; cursor: grab }
.pad-empty { position: absolute; inset: 0; display: grid; place-items: center; color: var(--ink-3); font-size: 13px; text-align: center; padding: 0 20px }
.pad-foot { display: flex; align-items: center; justify-content: space-between; gap: 8px }
.pad-foot .cost { font-size: 12px; color: var(--ink-3) }
.btn.sm.ghost { padding: 3px 10px; font-size: 12px; border: 1px solid #dcdfe6; background: #fff; border-radius: 4px; cursor: pointer }
.btn.sm.ghost:disabled { opacity: .5; cursor: not-allowed }
.btn.sm { padding: 4px 14px; font-size: 13px; border: 0; background: var(--indigo); color: #fff; border-radius: 4px; cursor: pointer }
.btn.sm:disabled { opacity: .6; cursor: not-allowed }
</style>
