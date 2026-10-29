<template>
  <div class="assets-panel">
    <div class="sub-head">
      <h3>版权资产</h3>
      <span class="count">{{ total }} 部</span>
    </div>
    <div class="toolbar">
      <select v-model="statusFilter" class="toolbar-control" :disabled="pending" @change="reload">
        <option value="">全部上架状态</option>
        <option value="on_shelf">已上架</option>
        <option value="off_shelf">已下架</option>
      </select>
      <input
        v-model.trim="keyword"
        class="toolbar-control search"
        type="search"
        placeholder="按作品名搜索"
        :disabled="pending"
        @keydown.enter.prevent="reload"
      />
      <button class="btn quiet sm toolbar-btn" type="button" :disabled="pending" @click="reload">查询</button>
    </div>

    <LoadState
      :pending="pending"
      :error="loadError"
      :retry="load"
      :empty="!pending && !loadError && !list.length"
      empty-text="暂无版权资产。审核通过并已发布的作品会出现在这里。"
    />

    <div v-if="!pending && !loadError && list.length" class="worklist">
      <CopyrightWorkCard v-for="item in list" :key="item.workId" :title="item.title || ('作品#' + item.workId)" :cover="worksForCovers.find(w => w.workId === item.workId)?.cover" :status="shelfStatusLabel(item.status)">
        <p class="cost">作品类型：{{ workTypeLabel(item.workType) }}</p>
        <p class="cost">题材：{{ item.genreName || '未分类' }}</p>
        <p class="cost">作品编号：{{ item.workId }}</p>
        <p class="cost">创建时间：{{ dateText(item.createTime) }}</p>
        <template #actions>
          <button class="btn quiet sm" type="button" @click="openDetail(item.workId)">详情</button>
          <button class="btn quiet sm" type="button" @click="openHistory(item)">授权历史</button>
          <button v-if="canToggleShelf(item)" class="btn sm" type="button" :disabled="busyWorkId !== null" @click="toggleShelf(item)">{{ item.status === 'on_shelf' ? '下架' : '上架' }}</button>
        </template>
      </CopyrightWorkCard>
    </div>

    <div v-if="!pending && !loadError && total > pageSize" class="pager">
      <button class="btn quiet sm" type="button" :disabled="pageNum <= 1 || pending" @click="prevPage">上一页</button>
      <span class="pager-info">第 {{ pageNum }} 页</span>
      <button class="btn quiet sm" type="button" :disabled="pageNum * pageSize >= total || pending" @click="nextPage">下一页</button>
    </div>

    <PortalLayer v-model="detailVisible" title="版权资产详情" modal big>
      <LoadState :pending="detailPending" :error="detailError" :retry="() => openDetail(detail?.workId)" />
      <template v-if="detail && !detailPending && !detailError">
        <div class="detail-hero">
          <h3>{{ detail.title || ('作品#' + detail.workId) }}</h3>
          <p>
            <span class="status-tag" :class="'tone-' + shelfStatusTone(detail.status)">{{ shelfStatusLabel(detail.status) }}</span>
          </p>
        </div>
        <ul class="rows detail-rows">
          <li><span class="k">作品编号</span><span class="v muted">{{ detail.workId || '—' }}</span></li>
          <li><span class="k">作者</span><span class="v muted">{{ detail.authorName || '—' }}</span></li>
          <li><span class="k">题材</span><span class="v muted">{{ detail.genreName || '—' }}</span></li>
          <li><span class="k">作品类型</span><span class="v muted">{{ workTypeLabel(detail.workType) }}</span></li>
          <li><span class="k">创建时间</span><span class="v muted">{{ dateText(detail.createTime) }}</span></li>
        </ul>
        <section class="summary-block">
          <h4>作品简介</h4>
          <p>{{ detail.summary || '暂无简介' }}</p>
        </section>
        <div class="action-bar">
          <button class="btn quiet sm" type="button" @click="openHistory(detail)">授权历史</button>
          <button
            v-if="canToggleShelf(detail)"
            class="btn sm"
            type="button"
            :disabled="busyWorkId !== null"
            @click="toggleShelf(detail)"
          >
            {{ detail.status === 'on_shelf' ? '下架' : '上架' }}
          </button>
        </div>
      </template>
    </PortalLayer>

    <PortalLayer v-model="historyVisible" :title="historyTitle" modal big>
      <LoadState
        :pending="historyPending"
        :error="historyError"
        :retry="loadHistory"
        :empty="!historyPending && !historyError && !historyRows.length"
        empty-text="暂无关联授权订单"
      />
      <div v-if="!historyPending && !historyError && historyRows.length" class="tbl history-tbl">
        <table>
          <thead>
            <tr>
              <th>订单编号</th>
              <th style="width:100px">买方</th>
              <th style="width:100px">授权类型</th>
              <th style="width:100px">订单金额</th>
              <th style="width:90px">状态</th>
              <th style="width:140px">付款时间</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in historyRows" :key="row.orderId || row.orderNo">
              <td class="num">{{ row.orderNo || '—' }}</td>
              <td>{{ row.buyerName || '—' }}</td>
              <td>{{ row.licenseType || '—' }}</td>
              <td class="num">{{ amountText(row.totalAmount) }}</td>
              <td>{{ row.status || '—' }}</td>
              <td class="num">{{ dateText(row.payTime) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-if="!historyPending && historyTotal > historyPageSize" class="pager">
        <button class="btn quiet sm" type="button" :disabled="historyPageNum <= 1 || historyPending" @click="prevHistoryPage">上一页</button>
        <span class="pager-info">第 {{ historyPageNum }} 页</span>
        <button class="btn quiet sm" type="button" :disabled="historyPageNum * historyPageSize >= historyTotal || historyPending" @click="nextHistoryPage">下一页</button>
      </div>
    </PortalLayer>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import PortalLayer from '../../../components/PortalLayer.vue'
import LoadState from '../../../components/LoadState.vue'
import CopyrightWorkCard from './CopyrightWorkCard.vue'
import { usePortal } from '../../../utils/portal.js'
import { dateText } from '../../../utils/creator.js'
import {
  canToggleShelf,
  shelfStatusLabel,
  shelfStatusTone,
  workTypeLabel
} from '../../../utils/copyright.js'

const { api, handleError } = usePortal()
defineProps({ worksForCovers: { type: Array, default: () => [] } })

const list = ref([])
const total = ref(0)
const pending = ref(false)
const loadError = ref('')
const statusFilter = ref('')
const keyword = ref('')
const pageNum = ref(1)
const pageSize = 20
const busyWorkId = ref(null)

const detailVisible = ref(false)
const detail = ref(null)
const detailPending = ref(false)
const detailError = ref('')

const historyVisible = ref(false)
const historyWorkId = ref(null)
const historyWorkTitle = ref('')
const historyRows = ref([])
const historyTotal = ref(0)
const historyPending = ref(false)
const historyError = ref('')
const historyPageNum = ref(1)
const historyPageSize = 10

const historyTitle = computed(() => {
  const name = historyWorkTitle.value
  return name ? `授权历史 · ${name}` : '授权历史'
})

function amountText(value) {
  if (value == null || value === '') return '—'
  const num = Number(value)
  if (!Number.isFinite(num)) return String(value)
  return num.toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

async function load() {
  pending.value = true
  loadError.value = ''
  try {
    const result = await api.value.listCopyrightAssets({
      status: statusFilter.value || undefined,
      keyword: keyword.value || undefined,
      pageNum: pageNum.value,
      pageSize
    })
    list.value = Array.isArray(result) ? result : (result?.list || result?.rows || [])
    total.value = Number(result?.total ?? list.value.length) || 0
  } catch (failure) {
    list.value = []
    total.value = 0
    loadError.value = failure.message
    await handleError(failure)
  } finally {
    pending.value = false
  }
}

function reload() {
  pageNum.value = 1
  return load()
}

function prevPage() {
  if (pageNum.value <= 1) return
  pageNum.value -= 1
  load()
}

function nextPage() {
  if (pageNum.value * pageSize >= total.value) return
  pageNum.value += 1
  load()
}

async function openDetail(workId) {
  if (!workId) return
  detailVisible.value = true
  detailPending.value = true
  detailError.value = ''
  detail.value = null
  try {
    const result = await api.value.getCopyrightAsset(workId)
    if (!result) throw new Error('资产不存在或无权限访问')
    detail.value = result
  } catch (failure) {
    detailError.value = failure.message
    await handleError(failure)
  } finally {
    detailPending.value = false
  }
}

async function openHistory(item) {
  if (!item?.workId) return
  historyWorkId.value = item.workId
  historyWorkTitle.value = item.title || `作品#${item.workId}`
  historyPageNum.value = 1
  historyVisible.value = true
  await loadHistory()
}

async function loadHistory() {
  if (!historyWorkId.value) return
  historyPending.value = true
  historyError.value = ''
  try {
    const result = await api.value.listCopyrightAuthorizationHistory(historyWorkId.value, {
      pageNum: historyPageNum.value,
      pageSize: historyPageSize
    })
    historyRows.value = Array.isArray(result) ? result : (result?.list || result?.rows || [])
    historyTotal.value = Number(result?.total ?? historyRows.value.length) || 0
  } catch (failure) {
    historyRows.value = []
    historyTotal.value = 0
    historyError.value = failure.message
    await handleError(failure)
  } finally {
    historyPending.value = false
  }
}

function prevHistoryPage() {
  if (historyPageNum.value <= 1) return
  historyPageNum.value -= 1
  loadHistory()
}

function nextHistoryPage() {
  if (historyPageNum.value * historyPageSize >= historyTotal.value) return
  historyPageNum.value += 1
  loadHistory()
}

async function toggleShelf(item) {
  if (!canToggleShelf(item) || busyWorkId.value != null) return
  const nextStatus = item.status === 'on_shelf' ? 'off_shelf' : 'on_shelf'
  const action = nextStatus === 'on_shelf' ? '上架' : '下架'
  try {
    await ElMessageBox.confirm(
      `确定将「${item.title || ('作品#' + item.workId)}」${action}吗？此操作与平台全局上架状态一致。`,
      `确认${action}`,
      { type: 'warning' }
    )
  } catch {
    return
  }
  busyWorkId.value = item.workId
  try {
    await api.value.updateCopyrightAssetStatus(item.workId, nextStatus)
    ElMessage.success(`已${action}`)
    item.status = nextStatus
    if (detail.value?.workId === item.workId) detail.value.status = nextStatus
    const row = list.value.find(entry => entry.workId === item.workId)
    if (row) row.status = nextStatus
  } catch (failure) {
    await handleError(failure)
  } finally {
    busyWorkId.value = null
  }
}

onMounted(load)
</script>

<style scoped>
.assets-panel .sub-head {
  display: flex; align-items: center; gap: 10px;
  padding-bottom: 8px; margin-bottom: 12px; border-bottom: 1px solid var(--rule, #eee);
}
.assets-panel .sub-head h3 { margin: 0; flex: 1; font-size: 15px }
.assets-panel .count { color: var(--ink-3, #999); font-size: 12.5px }

.assets-panel .toolbar {
  display: flex; align-items: center; flex-wrap: wrap; gap: 8px;
  margin-bottom: 14px;
}
.assets-panel .toolbar-control {
  box-sizing: border-box; height: 32px; margin: 0; padding: 0 10px;
  font: inherit; font-size: 13px; line-height: 30px;
  color: var(--ink, #333); background: var(--paper-2, #fff);
  border: 1px solid var(--rule-2, #d9d9d9); border-radius: var(--radius, 4px);
  vertical-align: middle;
}
.assets-panel .toolbar-control:focus {
  outline: none; border-color: var(--indigo, #3d5a56);
  box-shadow: 0 0 0 3px var(--indigo-wash, rgba(61, 90, 86, 0.12));
}
.assets-panel .toolbar-control:disabled { opacity: 0.6; cursor: not-allowed }
.assets-panel select.toolbar-control { width: 148px; appearance: auto }
.assets-panel input.toolbar-control.search { width: 200px; flex: 1; min-width: 140px; max-width: 260px }
.assets-panel .toolbar-btn {
  box-sizing: border-box; height: 32px; padding: 0 12px !important;
  display: inline-flex; align-items: center; justify-content: center;
}

.assets-panel .tbl table { width: 100%; border-collapse: collapse }
.assets-panel .tbl th, .assets-panel .tbl td {
  padding: 12px 10px; border-bottom: 1px solid var(--rule, #eee);
  text-align: left; vertical-align: top;
}
.assets-panel .tbl th { font-size: 12px; color: var(--ink-3, #999); font-weight: 500 }
.assets-panel .tbl .num { font-variant-numeric: tabular-nums; color: var(--ink-2, #666); font-size: 13px }
.assets-panel .tbl .ops { white-space: nowrap }
.assets-panel .tbl .ops .btn + .btn { margin-left: 6px }
.assets-panel .cost { margin: 4px 0 0; color: var(--ink-3, #999); font-size: 12px }

.status-tag { display: inline-block; padding: 1px 8px; border-radius: 10px; font-size: 12px; font-weight: 500 }
.tone-ok { background: #f0f9eb; color: #67c23a }
.tone-off { background: #f4f4f5; color: #909399 }

.detail-hero { margin-bottom: 12px }
.detail-hero h3 { margin: 0 0 8px }
.detail-rows { margin-top: 8px }
.summary-block {
  margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--rule, #eee);
}
.summary-block h4 { margin: 0 0 8px; font-size: 13px; color: var(--ink-2, #666); font-weight: 500 }
.summary-block p { margin: 0; line-height: 1.6; white-space: pre-wrap; word-break: break-word }
.action-bar { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px }

.pager {
  display: flex; align-items: center; justify-content: flex-end; gap: 10px;
  margin-top: 14px;
}
.pager-info { font-size: 12.5px; color: var(--ink-3, #999) }
.history-tbl { margin-top: 4px }
</style>
