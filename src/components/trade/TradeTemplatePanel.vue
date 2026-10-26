<template>
  <div v-if="visible" class="template-panel">
    <div class="template-head">
      <b>选择消息</b>
    </div>
    <div class="template-tabs">
      <button v-for="t in TABS" :key="t.label" type="button" class="template-tab" :class="{ active: activeLabel === t.label }" @click="switchTab(t.label)">{{ t.label }}</button>
    </div>
    <div class="template-body">
      <LoadState :pending="pending" :error="error" :retry="load" />
      <p v-if="!pending && !error && !filtered.length" class="cost template-empty">暂无可用定型文</p>
      <div v-for="(t, i) in filtered" :key="t.templateId" class="template-item" :class="{ expanded: expandedIndex === i }">
        <div class="template-text" @click="onTap(t, i)">
          <template v-if="t.hasAmount">{{ priceParts(t).before }}<span class="price-slot">{{ expandedIndex === i ? '______' : '金额' }}</span>{{ priceParts(t).after }}</template>
          <template v-else>{{ t.content }}</template>
        </div>
        <div v-if="t.hasAmount && expandedIndex === i" class="price-row">
          <span class="yen-sign">¥</span>
          <input ref="priceEl" v-model="priceText" class="price-input" type="number" min="0" step="0.01" placeholder="输入金额" @keyup.enter="sendPrice(t)">
          <button class="btn sm" type="button" :disabled="sending" @click="sendPrice(t)">{{ sending ? '发送中…' : '发送' }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import LoadState from '../LoadState.vue'
import { usePortal } from '../../utils/portal.js'

const props = defineProps({
  visible: Boolean,
  sessionId: Number,
  inquiryId: Number,
  isBuyer: Boolean,
  licenseType: String,
})
const emit = defineEmits(['update:visible', 'sent'])
const { api, handleError } = usePortal()

// 与 APP 端 trade_template_sheet 同口径：三 Tab 合并 price_param + price_text
const TABS = [
  { label: '价格协商', categories: ['price_param', 'price_text'] },
  { label: '交易进展', categories: ['progress'] },
  { label: '通用沟通', categories: ['general'] },
]

const templates = ref([])
const pending = ref(false)
const error = ref('')
const activeLabel = ref(TABS[0].label)
const expandedIndex = ref(-1)
const priceText = ref('')
const sending = ref(false)
const priceEl = ref(null)

const activeTab = computed(() => TABS.find(t => t.label === activeLabel.value) || TABS[0])
const filtered = computed(() => templates.value.filter(t => activeTab.value.categories.includes(t.category) && visibleToMe(t)))

/** 按当前用户买卖角色过滤定型文。 */
function visibleToMe(t) {
  if (t.role === 'buyer') return props.isBuyer
  if (t.role === 'seller') return !props.isBuyer
  return true
}

function priceParts(t) {
  const [before = '', after = ''] = String(t.content || '').split('{price}')
  return { before, after }
}

watch(() => props.visible, v => {
  if (!v) return
  expandedIndex.value = -1
  priceText.value = ''
  load()
}, { immediate: true })

async function load() {
  if (pending.value) return
  pending.value = true; error.value = ''
  try {
    templates.value = await api.value.listTradeTemplates()
  } catch (e) {
    error.value = e.message; await handleError(e)
  } finally {
    pending.value = false
  }
}

function switchTab(label) {
  activeLabel.value = label
  expandedIndex.value = -1
  priceText.value = ''
}

async function onTap(t, i) {
  if (!t.hasAmount) {
    await sendText(t)
    return
  }
  expandedIndex.value = expandedIndex.value === i ? -1 : i
  priceText.value = ''
  await nextTick()
  const el = Array.isArray(priceEl.value) ? priceEl.value[0] : priceEl.value
  el?.focus()
}

/** 纯文字定型文：点击即发送。 */
async function sendText(t) {
  if (sending.value) return
  sending.value = true
  try {
    const msg = await api.value.sendChat(props.sessionId, t.content)
    emit('sent', msg || null)
  } catch (e) {
    await handleError(e)
  } finally {
    sending.value = false
  }
}

/** 含价格定型文：替换 {price} 发消息，并同步报价（失败不阻断消息）。 */
async function sendPrice(t) {
  if (sending.value) return
  const raw = String(priceText.value || '').trim()
  const yuan = parseFloat(raw)
  if (!raw || isNaN(yuan) || yuan <= 0) { ElMessage.warning('请输入有效金额'); return }
  const amountFen = Math.round(yuan * 100)
  const content = String(t.content).replaceAll('{price}', raw)
  sending.value = true
  try {
    const msg = await api.value.sendChat(props.sessionId, content)
    emit('sent', msg || null)
    await syncQuote(amountFen)
    expandedIndex.value = -1
    priceText.value = ''
  } catch (e) {
    await handleError(e)
  } finally {
    sending.value = false
  }
}

/** 同步报价：卖方新建报价，买方发起议价（与 APP 一致）。 */
async function syncQuote(amountFen) {
  const inquiryId = Number(props.inquiryId) || 0
  if (!inquiryId) return
  try {
    const body = { inquiryId, price: amountFen, licenseType: props.licenseType || 'non_exclusive' }
    if (props.isBuyer) await api.value.counterOffer(body)
    else await api.value.createQuote(body)
  } catch { /* 报价同步失败不阻断已发出的消息 */ }
}
</script>

<style scoped>
.template-panel { border-top: 1px solid #ebeef5; background: #fafbfc; display: flex; flex-direction: column; max-height: 260px }
.template-head { display: flex; align-items: center; justify-content: space-between; padding: 6px 12px 0 }
.template-head b { font-size: 13px }
.template-tabs { display: flex; gap: 16px; padding: 0 12px; border-bottom: 1px solid #ebeef5 }
.template-tab { border: 0; background: transparent; padding: 8px 0; font-size: 13px; color: #606266; cursor: pointer; border-bottom: 2px solid transparent }
.template-tab.active { color: #409eff; font-weight: 600; border-bottom-color: #409eff }
.template-body { flex: 1; min-height: 0; overflow-y: auto; padding: 8px 12px }
.template-empty { text-align: center; padding: 16px 0; font-size: 12px }
.template-item { background: #fff; border: 1px solid #ebeef5; border-radius: 6px; margin-bottom: 6px; overflow: hidden }
.template-item.expanded { border-color: #409eff }
.template-text { padding: 9px 12px; font-size: 13px; line-height: 1.5; color: #303133; cursor: pointer; word-break: break-word }
.template-item:not(.expanded) .template-text:hover { background: #f5f7fa }
.price-slot { color: #409eff; font-weight: 500; padding: 0 4px; border-bottom: 1px solid #409eff; margin: 0 2px }
.price-row { display: flex; align-items: center; gap: 8px; padding: 0 12px 10px }
.price-row .yen-sign { font-size: 16px; font-weight: 600; color: #409eff }
.price-input { flex: 1; padding: 5px 10px; border: 1px solid #dcdfe6; border-radius: 4px; font-size: 14px; outline: none }
.price-input:focus { border-color: #409eff }
</style>
