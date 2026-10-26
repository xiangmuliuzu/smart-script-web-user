<template>
  <PortalLayer :model-value="modelValue" title="签署合同" modal big :before-close="close" @update:model-value="v => !v && close()">
    <div class="sign-dialog" v-loading="loading">
      <!-- 合同正文预览（HTML 原样渲染，含已签方签字盖章） -->
      <div class="sign-preview">
        <iframe v-if="content" class="contract-frame" :srcdoc="content" sandbox="allow-same-origin"></iframe>
        <div v-else class="load-state"><p>{{ loading ? '合同加载中…' : '合同内容不可用' }}</p></div>
      </div>

      <!-- 签署区：手写签名 + 印章（二者择一即可，也可都用） -->
      <div class="sign-area">
        <p class="sign-hint cost">签署后不可撤销，手写签名与印章至少选择一项。</p>

        <div class="sign-block">
          <div class="block-head">
            <b>手写签名</b>
            <button class="btn sm ghost" type="button" @click="clearCanvas">清除</button>
          </div>
          <canvas ref="padEl" class="sign-pad" @pointerdown="onPointerDown" @pointermove="onPointerMove" @pointerup="onPointerUp" @pointerleave="onPointerUp"></canvas>
        </div>

        <div class="sign-block">
          <div class="block-head">
            <b>使用印章</b>
            <span class="cost">{{ approvedSeals.length ? '点击选择，已选：' + (selectedSeal?.sealName || '无') : '暂无审核通过的印章' }}</span>
          </div>
          <div v-if="approvedSeals.length" class="seal-list">
            <div v-for="s in approvedSeals" :key="s.sealId" class="seal-item" :class="{ active: selectedSeal?.sealId === s.sealId }" @click="toggleSeal(s)">
              <img :src="mediaUrl(s.sealImageUrl)" :alt="s.sealName" />
              <span>{{ s.sealName }}</span>
            </div>
          </div>
        </div>

        <div class="sign-actions">
          <span class="cost">{{ roleLabel }}</span>
          <button class="btn" type="button" :disabled="submitting || (!hasSignature && !selectedSeal)" @click="submit">
            {{ submitting ? '签署中…' : '确认签署' }}
          </button>
        </div>
      </div>
    </div>
  </PortalLayer>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import PortalLayer from '../PortalLayer.vue'
import { usePortal } from '../../utils/portal.js'
import { avatarUrl, contractHtml } from '../../utils/avatarUrl.js'

const props = defineProps({ modelValue: Boolean, contract: Object, userId: Number })
const emit = defineEmits(['update:modelValue', 'signed'])
const { api, handleError } = usePortal()

const loading = ref(false)
const submitting = ref(false)
const content = ref('')
const approvedSeals = ref([])
const selectedSeal = ref(null)
const padEl = ref(null)
const hasSignature = ref(false)

const contractId = computed(() => Number(props.contract?.contractId) || 0)
const isBuyer = computed(() => Number(props.contract?.buyerId) === props.userId)
const roleLabel = computed(() => (isBuyer.value ? '以买方身份签署' : '以卖方身份签署'))
const mediaUrl = raw => avatarUrl(raw)

let ctx = null
let drawing = false
onBeforeUnmount(() => { ctx = null })

watch(() => props.modelValue, async v => {
  if (!v) return
  content.value = ''
  hasSignature.value = false
  selectedSeal.value = null
  await Promise.all([loadContent(), loadSeals()])
  await nextTick()
  initCanvas()
})

async function loadContent() {
  loading.value = true
  try {
    const detail = await api.value.getContractByOrder(props.contract.orderId)
    content.value = contractHtml(detail?.content)
  } catch (e) {
    await handleError(e)
  } finally {
    loading.value = false
  }
}

async function loadSeals() {
  try {
    const seals = await api.value.listMySeals()
    approvedSeals.value = seals.filter(s => s.reviewStatus === 'approved' && s.sealStatus === 'enabled')
  } catch {
    approvedSeals.value = []
  }
}

function initCanvas() {
  const canvas = padEl.value
  if (!canvas) return
  const ratio = window.devicePixelRatio || 1
  const rect = canvas.getBoundingClientRect()
  canvas.width = rect.width * ratio
  canvas.height = rect.height * ratio
  ctx = canvas.getContext('2d')
  ctx.scale(ratio, ratio)
  ctx.lineWidth = 2.4
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = '#1b1a18'
  hasSignature.value = false
}

function pointOf(e) {
  const rect = padEl.value.getBoundingClientRect()
  return { x: e.clientX - rect.left, y: e.clientY - rect.top }
}
function onPointerDown(e) {
  if (!ctx) return
  drawing = true
  const p = pointOf(e)
  ctx.beginPath()
  ctx.moveTo(p.x, p.y)
}
function onPointerMove(e) {
  if (!drawing || !ctx) return
  const p = pointOf(e)
  ctx.lineTo(p.x, p.y)
  ctx.stroke()
  hasSignature.value = true
}
function onPointerUp() { drawing = false }

function clearCanvas() {
  const canvas = padEl.value
  if (!canvas || !ctx) return
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  hasSignature.value = false
}

function toggleSeal(seal) {
  selectedSeal.value = selectedSeal.value?.sealId === seal.sealId ? null : seal
}

/** 画布导出 PNG Blob；无笔迹返回 null。 */
function signatureBlob() {
  return new Promise(resolve => {
    if (!hasSignature.value || !padEl.value) return resolve(null)
    padEl.value.toBlob(blob => resolve(blob), 'image/png')
  })
}

/** 下载印章图片为 Blob：走静态资源归一化地址，不经业务鉴权头。 */
async function sealBlob(seal) {
  if (!seal?.sealImageUrl) return null
  try {
    const resp = await fetch(avatarUrl(seal.sealImageUrl))
    if (!resp.ok) return null
    const blob = await resp.blob()
    if (!blob.type.startsWith('image/')) return null
    return blob
  } catch {
    return null
  }
}

async function submit() {
  if (submitting.value) return
  submitting.value = true
  try {
    const form = new FormData()
    const sign = await signatureBlob()
    if (sign) form.append('signatureImage', sign, `signature_${Date.now()}.png`)
    const seal = selectedSeal.value ? await sealBlob(selectedSeal.value) : null
    if (seal) form.append('sealImage', seal, `seal_${Date.now()}.png`)
    if (!form.has('signatureImage') && !form.has('sealImage')) {
      ElMessage.warning('手写签名或印章至少选择一项')
      return
    }
    await api.value.signContract(contractId.value, form)
    ElMessage.success('签署成功')
    emit('signed')
    close()
  } catch (e) {
    // 后端业务错误（如实名未完成、重复签署）直接展示 message
    ElMessage.error(e.message || '签署失败')
  } finally {
    submitting.value = false
  }
}

function close() {
  emit('update:modelValue', false)
}
</script>

<style scoped>
.sign-dialog { display: flex; flex-direction: column; gap: 12px }
.sign-preview { border: 1px solid #ebeef5; border-radius: 6px; overflow: hidden; background: #fff }
.contract-frame { width: 100%; height: 320px; border: 0; display: block }
.sign-area { border: 1px solid #ebeef5; border-radius: 6px; padding: 12px; background: #fafbfc }
.sign-hint { margin: 0 0 10px; font-size: 12px }
.sign-block { margin-bottom: 12px }
.block-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 6px }
.block-head b { font-size: 13px }
.block-head .cost { font-size: 12px }
.sign-pad { width: 100%; height: 140px; background: #fff; border: 1px dashed #dcdfe6; border-radius: 6px; touch-action: none; cursor: crosshair }
.seal-list { display: flex; gap: 10px; flex-wrap: wrap }
.seal-item { width: 92px; border: 1px solid #ebeef5; border-radius: 6px; padding: 6px; text-align: center; cursor: pointer; background: #fff; transition: border-color .15s }
.seal-item:hover { border-color: #409eff }
.seal-item.active { border-color: #409eff; box-shadow: 0 0 0 2px rgba(64, 158, 255, .15) }
.seal-item img { width: 56px; height: 56px; object-fit: contain; display: block; margin: 0 auto 4px }
.seal-item span { font-size: 12px; color: #606266; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.sign-actions { display: flex; align-items: center; justify-content: space-between; gap: 8px }
.sign-actions .cost { font-size: 12px }
</style>
