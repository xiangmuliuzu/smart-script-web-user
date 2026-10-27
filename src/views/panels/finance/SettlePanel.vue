<template>
  <div class="settle-panel">
    <LoadState :pending="overviewPending && !overview" :error="overviewError" :retry="loadOverview" />
    <div v-if="overview && !overviewError" class="stats finance-stats" role="group" aria-label="收益总览">
      <div class="stat" style="cursor:default"><span class="k">总收益</span><span class="n money">{{ yuanText(overview.totalIncome) }}</span></div>
      <div class="stat" style="cursor:default"><span class="k">待结算收益</span><span class="n">{{ yuanText(overview.pendingSettleAmount) }}</span></div>
      <div class="stat" style="cursor:default"><span class="k">可提现</span><span class="n">{{ yuanText(overview.availableAmount) }}</span></div>
      <div class="stat" style="cursor:default"><span class="k">已提现</span><span class="n">{{ yuanText(overview.withdrawnAmount) }}</span></div>
    </div>

    <div class="sub-tabs" role="tablist" aria-label="结算分类">
      <button role="tab" type="button" :aria-selected="view === 'settle'" @click="view = 'settle'">待结算</button>
      <button role="tab" type="button" :aria-selected="view === 'bills'" @click="view = 'bills'">收益明细</button>
    </div>

    <template v-if="view === 'settle'">
      <div class="toolbar">
        <select v-model="settleStatus" class="toolbar-control" :disabled="listPending" @change="reloadList">
          <option value="pending">待确认</option>
          <option value="disputed">有异议</option>
          <option value="confirmed">已入账</option>
          <option value="">全部</option>
        </select>
        <button class="btn quiet sm toolbar-btn" type="button" :disabled="listPending" @click="loadList">刷新</button>
      </div>
      <LoadState :pending="listPending" :error="listError" :retry="loadList" :empty="!listPending && !listError && !list.length" empty-text="暂无结算记录" />
      <div v-if="!listPending && !listError && list.length" class="tbl">
        <table>
          <thead>
            <tr>
              <th>作品 / 订单</th>
              <th style="width:120px" class="num">订单金额</th>
              <th style="width:110px" class="num">平台抽成</th>
              <th style="width:110px" class="num">作者实得</th>
              <th style="width:90px">状态</th>
              <th style="width:130px">时间</th>
              <th style="width:90px"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in list" :key="item.settleId">
              <td>
                <b>{{ item.workTitle || item.settleNo || '结算单' }}</b>
                <p class="cost">{{ item.orderNo || '—' }}{{ item.status === 'pending' ? ' · 待确认' : '' }}</p>
              </td>
              <td class="num">{{ fenText(item.totalAmount) }}</td>
              <td class="num">{{ fenText(item.platformFee) }}</td>
              <td class="num">{{ fenText(item.sellerAmount) }}</td>
              <td><span class="status-tag" :class="'tone-' + settleStatusTone(item.status)">{{ settleStatusLabel(item.status) }}</span></td>
              <td class="num">{{ dateText(item.createdAt) }}</td>
              <td class="ops"><button class="btn quiet sm" type="button" @click="openSettle(item.settleId)">查看</button></td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <template v-else>
      <div class="toolbar">
        <select v-model="billType" class="toolbar-control" :disabled="listPending" @change="reloadList">
          <option value="">全部</option>
          <option value="income">收入</option>
          <option value="withdraw">提现</option>
        </select>
        <select v-model="period" class="toolbar-control" :disabled="statsPending" @change="loadStats">
          <option value="week">本周</option>
          <option value="month">本月</option>
          <option value="year">本年</option>
        </select>
        <button class="btn quiet sm toolbar-btn" type="button" :disabled="listPending" @click="loadList">刷新</button>
      </div>
      <div v-if="stats" class="period-stats">
        <span>收入合计 {{ yuanText(stats.incomeAmount) }}</span>
        <span>提现合计 {{ yuanText(stats.withdrawAmount) }}</span>
        <span v-if="stats.periodStart" class="cost">{{ stats.periodStart }} ~ {{ stats.periodEnd }}</span>
      </div>
      <LoadState :pending="listPending" :error="listError" :retry="loadList" :empty="!listPending && !listError && !list.length" empty-text="暂无已到账收益记录" />
      <div v-if="!listPending && !listError && list.length" class="tbl">
        <table>
          <thead>
            <tr>
              <th>来源</th>
              <th>关联</th>
              <th style="width:120px" class="num">金额</th>
              <th style="width:140px">时间</th>
              <th style="width:90px"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in list" :key="item.billId">
              <td>
                <b>{{ billTypeLabel(item.incomeSource, item.billType) }}</b>
                <p class="cost">{{ item.billNo || '—' }}</p>
              </td>
              <td>{{ item.workTitle || item.orderNo || '无关联订单' }}</td>
              <td class="num">{{ fenText(item.amount, { signed: true }) }}</td>
              <td class="num">{{ dateText(item.createdAt) }}</td>
              <td class="ops"><button class="btn quiet sm" type="button" @click="openBill(item.billId)">查看</button></td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <div v-if="!listPending && !listError && total > pageSize" class="pager">
      <button class="btn quiet sm" type="button" :disabled="pageNum <= 1 || listPending" @click="prevPage">上一页</button>
      <span class="pager-info">第 {{ pageNum }} 页</span>
      <button class="btn quiet sm" type="button" :disabled="pageNum * pageSize >= total || listPending" @click="nextPage">下一页</button>
    </div>

    <PortalLayer v-model="settleVisible" title="结算确认" modal big>
      <LoadState :pending="detailPending" :error="detailError" :retry="() => openSettle(settleDetail?.settleId)" />
      <template v-if="settleDetail && !detailPending && !detailError">
        <div class="detail-hero">
          <p class="cost">{{ settleStatusLabel(settleDetail.status) }}</p>
          <h3>{{ fenText(settleDetail.sellerAmount) }}</h3>
          <p class="cost">作者实得（确认后入账）</p>
        </div>
        <ul class="rows detail-rows">
          <li><span class="k">结算单号</span><span class="v muted">{{ settleDetail.settleNo || '—' }}</span></li>
          <li><span class="k">订单号</span><span class="v muted">{{ settleDetail.orderNo || '—' }}</span></li>
          <li><span class="k">作品</span><span class="v muted">{{ settleDetail.workTitle || '—' }}</span></li>
          <li><span class="k">订单总额</span><span class="v muted">{{ fenText(settleDetail.totalAmount) }}</span></li>
          <li><span class="k">平台抽成</span><span class="v muted">{{ fenText(settleDetail.platformFee) }}</span></li>
          <li><span class="k">抽成比例</span><span class="v muted">{{ splitRateLabel(settleDetail.splitRate) }}</span></li>
          <li><span class="k">作者实得</span><span class="v muted">{{ fenText(settleDetail.sellerAmount) }}</span></li>
          <li><span class="k">创建时间</span><span class="v muted">{{ dateText(settleDetail.createdAt) }}</span></li>
        </ul>
        <p class="cost explain">订单完成后先进入待结算。作者实得 = 订单总额 − 平台抽成。仅在确认无误后入账。</p>
        <ul v-if="settleDetail.status === 'disputed'" class="rows detail-rows">
          <li><span class="k">异议原因</span><span class="v muted">{{ settleDetail.disputeReason || '—' }}</span></li>
          <li><span class="k">异议时间</span><span class="v muted">{{ dateText(settleDetail.disputeTime) }}</span></li>
        </ul>
        <ul v-if="settleDetail.status === 'confirmed'" class="rows detail-rows">
          <li><span class="k">确认时间</span><span class="v muted">{{ dateText(settleDetail.confirmTime) }}</span></li>
          <li><span class="k">关联账单</span><span class="v muted">{{ settleDetail.billId ? '#' + settleDetail.billId : '—' }}</span></li>
        </ul>
        <div class="action-bar">
          <button v-if="canConfirmSettle(settleDetail.status)" class="btn sm" type="button" :disabled="busy" @click="confirmSettle">确认入账</button>
          <button v-if="canDisputeSettle(settleDetail.status)" class="btn quiet sm" type="button" :disabled="busy" @click="disputeSettle">提出异议</button>
        </div>
      </template>
    </PortalLayer>

    <PortalLayer v-model="billVisible" title="收益详情" modal big>
      <LoadState :pending="detailPending" :error="detailError" :retry="() => openBill(billDetail?.billId)" />
      <template v-if="billDetail && !detailPending && !detailError">
        <div class="detail-hero">
          <p class="cost">{{ billTypeLabel(billDetail.incomeSource, billDetail.billType) }}</p>
          <h3>{{ fenText(billDetail.amount, { signed: true }) }}</h3>
        </div>
        <ul class="rows detail-rows">
          <li><span class="k">流水号</span><span class="v muted">{{ billDetail.billNo || '—' }}</span></li>
          <li><span class="k">备注</span><span class="v muted">{{ billDetail.remark || '—' }}</span></li>
          <li><span class="k">入账时间</span><span class="v muted">{{ dateText(billDetail.createdAt) }}</span></li>
          <li><span class="k">变动后余额</span><span class="v muted">{{ fenText(billDetail.balanceAfter) }}</span></li>
        </ul>
        <template v-if="billDetail.orderNo">
          <h4 class="block-title">订单关联</h4>
          <ul class="rows detail-rows">
            <li><span class="k">订单号</span><span class="v muted">{{ billDetail.orderNo }}</span></li>
            <li><span class="k">作品</span><span class="v muted">{{ billDetail.workTitle || '—' }}</span></li>
            <li><span class="k">订单状态</span><span class="v muted">{{ billDetail.orderStatus || '—' }}</span></li>
            <li><span class="k">付款时间</span><span class="v muted">{{ dateText(billDetail.payTime) }}</span></li>
            <li><span class="k">完成时间</span><span class="v muted">{{ dateText(billDetail.completeTime) }}</span></li>
          </ul>
          <h4 class="block-title">分成核算</h4>
          <ul class="rows detail-rows">
            <li><span class="k">订单总额</span><span class="v muted">{{ fenText(billDetail.totalAmount) }}</span></li>
            <li><span class="k">平台抽成</span><span class="v muted">{{ fenText(billDetail.platformFee) }}</span></li>
            <li><span class="k">抽成比例</span><span class="v muted">{{ splitRateLabel(billDetail.splitRate) }}</span></li>
            <li><span class="k">作者实得</span><span class="v muted">{{ fenText(billDetail.sellerAmount ?? billDetail.amount) }}</span></li>
          </ul>
        </template>
        <p v-else class="cost explain">无关联订单</p>
      </template>
    </PortalLayer>
  </div>
</template>

<script setup>
import { onMounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import PortalLayer from '../../../components/PortalLayer.vue'
import LoadState from '../../../components/LoadState.vue'
import { usePortal } from '../../../utils/portal.js'
import { dateText } from '../../../utils/creator.js'
import {
  billTypeLabel,
  canConfirmSettle,
  canDisputeSettle,
  fenText,
  settleStatusLabel,
  settleStatusTone,
  splitRateLabel,
  yuanText
} from '../../../utils/finance.js'

const { api, handleError } = usePortal()
const pageSize = 20
const view = ref('settle')
const overview = ref(null)
const overviewPending = ref(false)
const overviewError = ref('')
const list = ref([])
const total = ref(0)
const pageNum = ref(1)
const listPending = ref(false)
const listError = ref('')
const settleStatus = ref('')
const billType = ref('')
const period = ref('month')
const stats = ref(null)
const statsPending = ref(false)
const settleVisible = ref(false)
const billVisible = ref(false)
const settleDetail = ref(null)
const billDetail = ref(null)
const detailPending = ref(false)
const detailError = ref('')
const busy = ref(false)

async function loadOverview() {
  overviewPending.value = true
  overviewError.value = ''
  try {
    overview.value = await api.value.getIncomeOverview() || {}
  } catch (failure) {
    overview.value = null
    overviewError.value = failure.message
    await handleError(failure)
  } finally {
    overviewPending.value = false
  }
}

async function loadStats() {
  statsPending.value = true
  try {
    stats.value = await api.value.getIncomeStats(period.value) || null
  } catch (failure) {
    stats.value = null
    await handleError(failure)
  } finally {
    statsPending.value = false
  }
}

async function loadList() {
  listPending.value = true
  listError.value = ''
  try {
    const result = view.value === 'settle'
      ? await api.value.listIncomeSettles({ status: settleStatus.value || undefined, pageNum: pageNum.value, pageSize })
      : await api.value.listIncomeDetails({ billType: billType.value || undefined, pageNum: pageNum.value, pageSize })
    list.value = Array.isArray(result) ? result : (result?.list || result?.rows || [])
    total.value = Number(result?.total ?? list.value.length) || 0
  } catch (failure) {
    list.value = []
    total.value = 0
    listError.value = failure.message
    await handleError(failure)
  } finally {
    listPending.value = false
  }
}

function reloadList() {
  pageNum.value = 1
  return loadList()
}

function prevPage() {
  if (pageNum.value <= 1) return
  pageNum.value -= 1
  loadList()
}

function nextPage() {
  if (pageNum.value * pageSize >= total.value) return
  pageNum.value += 1
  loadList()
}

async function openSettle(settleId) {
  if (!settleId) return
  settleVisible.value = true
  billVisible.value = false
  settleDetail.value = null
  detailPending.value = true
  detailError.value = ''
  try {
    settleDetail.value = await api.value.getIncomeSettle(settleId)
  } catch (failure) {
    detailError.value = failure.message
    await handleError(failure)
  } finally {
    detailPending.value = false
  }
}

async function openBill(billId) {
  if (!billId) return
  billVisible.value = true
  settleVisible.value = false
  billDetail.value = null
  detailPending.value = true
  detailError.value = ''
  try {
    billDetail.value = await api.value.getIncomeBillDetail(billId)
  } catch (failure) {
    detailError.value = failure.message
    await handleError(failure)
  } finally {
    detailPending.value = false
  }
}

async function confirmSettle() {
  const id = settleDetail.value?.settleId
  if (!id || busy.value) return
  try {
    await ElMessageBox.confirm('确认后将按订单分成入账，作者实得进入可提现余额，并写入收益明细。', '确认入账', { type: 'warning' })
  } catch {
    return
  }
  busy.value = true
  try {
    settleDetail.value = await api.value.confirmIncomeSettle(id)
    ElMessage.success('已确认，收益已到账')
    await Promise.all([loadOverview(), loadList()])
  } catch (failure) {
    await handleError(failure)
  } finally {
    busy.value = false
  }
}

async function disputeSettle() {
  const id = settleDetail.value?.settleId
  if (!id || busy.value) return
  let reason = ''
  try {
    const result = await ElMessageBox.prompt('请说明异议原因（1–500 字）', '提出异议', {
      inputType: 'textarea',
      inputValidator: value => {
        const text = (value || '').trim()
        if (!text) return '请填写异议原因'
        if (text.length > 500) return '异议原因最多 500 字'
        return true
      }
    })
    reason = String(result.value || '').trim()
  } catch {
    return
  }
  busy.value = true
  try {
    settleDetail.value = await api.value.disputeIncomeSettle(id, reason)
    ElMessage.success('已提交异议')
    await Promise.all([loadOverview(), loadList()])
  } catch (failure) {
    await handleError(failure)
  } finally {
    busy.value = false
  }
}

watch(view, () => {
  pageNum.value = 1
  loadList()
  if (view.value === 'bills') loadStats()
})

onMounted(async () => {
  await loadOverview()
  await loadList()
})
</script>

<style scoped>
.finance-stats { margin: 4px 0 18px }
.sub-tabs { display: flex; gap: 16px; margin-bottom: 14px; border-bottom: 1px solid var(--rule, #eee) }
.sub-tabs button {
  background: none; border: 0; border-bottom: 2px solid transparent; padding: 8px 0;
  color: var(--ink-2, #666); cursor: pointer; font: inherit; font-size: 14px;
}
.sub-tabs button[aria-selected='true'] { border-bottom-color: var(--indigo, #2c4a52); color: var(--ink, #333); font-weight: 500 }
.settle-panel .toolbar { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 14px }
.settle-panel .toolbar-control {
  box-sizing: border-box; height: 32px; margin: 0; padding: 0 10px;
  font: inherit; font-size: 13px; line-height: 30px;
  color: var(--ink, #333); background: var(--paper-2, #fff);
  border: 1px solid var(--rule-2, #d9d9d9); border-radius: var(--radius, 4px);
}
.settle-panel select.toolbar-control { width: 128px; appearance: auto }
.settle-panel .toolbar-btn { box-sizing: border-box; height: 32px; padding: 0 12px !important; display: inline-flex; align-items: center }
.period-stats { display: flex; flex-wrap: wrap; gap: 16px; margin: -4px 0 14px; font-size: 13px; color: var(--ink-2, #666) }
.settle-panel .tbl table { width: 100%; border-collapse: collapse }
.settle-panel .tbl th, .settle-panel .tbl td { padding: 12px 10px; border-bottom: 1px solid var(--rule, #eee); text-align: left; vertical-align: top }
.settle-panel .tbl th { font-size: 12px; color: var(--ink-3, #999); font-weight: 500 }
.settle-panel .tbl .num { font-variant-numeric: tabular-nums; color: var(--ink-2, #666); font-size: 13px }
.settle-panel .tbl .ops { white-space: nowrap }
.settle-panel .cost { margin: 4px 0 0; color: var(--ink-3, #999); font-size: 12px }
.explain { margin: 12px 0 0; line-height: 1.6 }
.status-tag { display: inline-block; padding: 1px 8px; border-radius: 10px; font-size: 12px; font-weight: 500 }
.tone-wait { background: #fdf6ec; color: #e6a23c }
.tone-ok { background: #f0f9eb; color: #67c23a }
.tone-bad { background: #fef0f0; color: #f56c6c }
.tone-off { background: #f4f4f5; color: #909399 }
.detail-hero { margin-bottom: 12px }
.detail-hero h3 { margin: 0 0 4px; font-size: 26px }
.detail-rows { margin-top: 8px }
.block-title { margin: 18px 0 8px; font-size: 13px; color: var(--ink-2, #666); font-weight: 500 }
.action-bar { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px }
.pager { display: flex; align-items: center; justify-content: flex-end; gap: 10px; margin-top: 14px }
.pager-info { font-size: 12.5px; color: var(--ink-3, #999) }
</style>
