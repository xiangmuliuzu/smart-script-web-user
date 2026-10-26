<template>
  <div class="contract-panel">
    <div class="filter-bar">
      <select v-model="role" class="filter-select" @change="reload"><option value="">我的全部</option><option value="seller">我卖出的</option><option value="buyer">我买入的</option></select>
      <select v-model="status" class="filter-select" @change="reload"><option value="">全部状态</option><option value="pending">待签署</option><option value="partial_signed">部分签署</option><option value="completed">已完成</option></select>
    </div>
    <LoadState :pending="pending" :error="error" :retry="load" />
    <div v-if="!pending && !error && !contracts.length" class="load-state"><p>暂无合同</p></div>
    <div v-for="c in contracts" :key="c.contractId" class="contract-card">
      <div class="contract-cover">
        <img v-if="c.workCover" :src="coverUrl(c.workCover)" alt="" />
        <span v-else class="glyph">{{ (c.workTitle || '合').slice(0, 1) }}</span>
      </div>
      <div class="contract-body">
        <div class="contract-top">
          <b>《{{ c.workTitle || '合同#' + c.contractId }}》</b>
          <span class="status-tag" :class="'tag-' + c.status">{{ contractStatusLabel(c.status) }}</span>
          <span class="mine-role cost">{{ isBuyerOf(c) ? '我是买方' : '我是卖方' }}</span>
        </div>
        <p class="contract-meta">合同编号：{{ c.contractNo || '#' + c.contractId }} · 订单号：{{ c.orderNo || '#' + c.orderId }}</p>
        <p class="contract-meta">金额：{{ money(c.amount) }} · 授权：{{ licenseLabel(c.licenseType) }}</p>
        <p class="contract-meta sign-line">
          <span :class="signedClass(c.buyerSignStatus)">买方{{ signedText(c.buyerSignStatus) }}</span>
          <span :class="signedClass(c.sellerSignStatus)">卖方{{ signedText(c.sellerSignStatus) }}</span>
        </p>
        <div class="contract-foot">
          <span class="cost">创建于 {{ c.createdAt || '-' }}</span>
          <div class="foot-actions">
            <button class="btn sm quiet" @click="openPreview(c)">查看合同</button>
            <button v-if="canSign(c)" class="btn sm" @click="openSign(c)">签署合同</button>
            <a v-if="c.status === 'completed' && c.signedPdfUrl" class="btn sm ghost" :href="mediaUrl(c.signedPdfUrl)" target="_blank" rel="noopener">下载 PDF</a>
          </div>
        </div>
      </div>
    </div>
    <div v-if="total > PAGE_SIZE" class="pagination-bar">
      <button class="btn sm ghost" :disabled="pageNum <= 1" @click="pageNum--; load()">上一页</button>
      <span class="cost">第 {{ pageNum }} 页 / 共 {{ Math.ceil(total / PAGE_SIZE) }} 页</span>
      <button class="btn sm ghost" :disabled="pageNum * PAGE_SIZE >= total" @click="pageNum++; load()">下一页</button>
    </div>

    <PortalLayer v-model="previewVisible" :title="previewTitle" modal big>
      <div v-loading="previewLoading" class="preview-wrap">
        <iframe v-if="previewContent" class="contract-frame" :srcdoc="previewContent" sandbox="allow-same-origin"></iframe>
        <div v-else class="load-state"><p>{{ previewLoading ? '合同加载中…' : '合同内容不可用' }}</p></div>
      </div>
    </PortalLayer>

    <ContractSignDialog v-model="signVisible" :contract="signingContract" :user-id="userId" @signed="onSigned" />
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import PortalLayer from '../PortalLayer.vue'
import LoadState from '../LoadState.vue'
import ContractSignDialog from './ContractSignDialog.vue'
import { usePortal } from '../../utils/portal.js'
import { money, asList } from '../../utils/creator.js'
import { avatarUrl, contractHtml } from '../../utils/avatarUrl.js'

const props = defineProps({ userId: Number })
const { api, handleError } = usePortal()

const PAGE_SIZE = 10
const contracts = ref([])
const pending = ref(false)
const error = ref('')
const role = ref('')
const status = ref('')
const pageNum = ref(1)
const total = ref(0)

const previewVisible = ref(false)
const previewLoading = ref(false)
const previewContent = ref('')
const previewTitle = ref('合同预览')
const signVisible = ref(false)
const signingContract = ref(null)

// 合同 amount 接口直接返回元（未转分），展示不除 100
const licenseLabel = t => ({ exclusive: '独家授权', non_exclusive: '非独家授权', adaptation: '改编授权' })[t] || t || '未指定'
const contractStatusLabel = s => ({ pending: '待签署', partial_signed: '部分签署', completed: '已完成' })[s] || s || '-'
const isBuyerOf = c => Number(c?.buyerId) === props.userId
const isSigned = v => Number(v) === 1
const signedText = v => (isSigned(v) ? '已签' : '未签')
const signedClass = v => (isSigned(v) ? 'sign-done' : 'sign-todo')
const mediaUrl = raw => avatarUrl(raw)
// 封面历史数据绝对与相对混存，统一经 avatarUrl 归一到当前 API 前缀
const coverUrl = raw => avatarUrl(raw) || raw

/** 我可签署：合同未完成 且 我这一侧未签。 */
function canSign(c) {
  if (!c || c.status === 'completed') return false
  return isBuyerOf(c) ? !isSigned(c.buyerSignStatus) : !isSigned(c.sellerSignStatus)
}

async function load() {
  pending.value = true; error.value = ''
  try {
    const result = await api.value.listContracts({ role: role.value, status: status.value, pageNum: pageNum.value, pageSize: PAGE_SIZE })
    contracts.value = asList(result)
    total.value = Number(result?.total) || 0
  } catch (e) {
    error.value = e.message; await handleError(e)
  } finally {
    pending.value = false
  }
}
function reload() { pageNum.value = 1; load() }
function refresh() { load() }

async function openPreview(c) {
  previewTitle.value = `合同预览 · ${c.contractNo || '#' + c.contractId}`
  previewContent.value = ''
  previewVisible.value = true
  previewLoading.value = true
  try {
    const detail = await api.value.getContractByOrder(c.orderId)
    previewContent.value = contractHtml(detail?.content)
  } catch (e) {
    await handleError(e)
  } finally {
    previewLoading.value = false
  }
}

function openSign(c) {
  signingContract.value = c
  signVisible.value = true
}

async function onSigned() {
  await refresh()
}

onMounted(load)
defineExpose({ refresh, openSignById })
/** 供订单 Tab 跳转：按合同行直接打开签署（同页联动）。 */
function openSignById(contract) {
  if (!contract) return
  openSign(contract)
}
</script>

<style scoped>
.contract-card { display: flex; gap: 12px; border: 1px solid #ebeef5; border-radius: 6px; padding: 12px; margin-bottom: 10px; background: #fff; transition: box-shadow .15s }
.contract-card:hover { box-shadow: 0 1px 4px rgba(0,0,0,.06) }
.contract-cover { width: 108px; height: 146px; flex-shrink: 0; align-self: flex-start; border-radius: 4px; overflow: hidden; background: linear-gradient(160deg, #E9E5DA 0%, #DAD5C7 100%); display: grid; place-items: center; border: 1px solid #ebeef5 }
.contract-cover img { width: 100%; height: 100%; object-fit: cover }
.contract-cover .glyph { font-size: 32px; color: rgba(27,26,24,.18); font-weight: 600 }
.contract-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px }
.contract-top { display: flex; align-items: center; gap: 8px; flex-wrap: wrap }
.contract-top b { font-size: 14px }
.mine-role { font-size: 12px }
.contract-meta { font-size: 12.5px; color: #606266; margin: 0 }
.sign-line { display: flex; gap: 12px }
.sign-done { color: #67c23a; font-weight: 500 }
.sign-todo { color: #e6a23c }
.contract-foot { display: flex; align-items: center; justify-content: space-between; margin-top: auto; padding-top: 6px; gap: 8px }
.contract-foot .cost { font-size: 12px; color: #909399 }
.foot-actions { display: flex; gap: 8px; align-items: center }
.foot-actions a { text-decoration: none }
.preview-wrap { min-height: 200px }
.contract-frame { width: 100%; height: min(68vh, 720px); border: 0; display: block; background: #fff }
.filter-bar { display: flex; gap: 8px; align-items: center; margin-bottom: 12px; flex-wrap: wrap }
.filter-select { padding: 4px 8px; border: 1px solid #dcdfe6; border-radius: 4px; font-size: 13px; background: #fff }
.pagination-bar { display: flex; gap: 8px; align-items: center; justify-content: center; padding: 8px 0; margin-top: 4px }
.status-tag { display: inline-block; padding: 1px 8px; border-radius: 10px; font-size: 12px; font-weight: 500 }
.tag-pending { background: #fdf6ec; color: #e6a23c }
.tag-partial_signed { background: #ecf5ff; color: #409eff }
.tag-completed { background: #f0f9eb; color: #67c23a }
</style>
