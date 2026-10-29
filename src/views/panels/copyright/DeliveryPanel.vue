<template>
  <div class="delivery-panel">
    <div class="sub-head">
      <h3>版权交割</h3>
      <span class="count">{{ total }} 单</span>
    </div>
    <div class="toolbar">
      <select v-model="roleFilter" class="toolbar-control" :disabled="pending" @change="reload">
        <option value="">全部角色</option>
        <option value="seller">我转出的</option>
        <option value="buyer">我获得的</option>
      </select>
      <select v-model="statusFilter" class="toolbar-control status-filter" :disabled="pending" @change="reload">
        <option value="">全部状态</option>
        <option value="pending_upload">待卖方上传</option>
        <option value="pending_confirm">等待买家收货</option>
        <option value="completed">已完成</option>
        <option value="cancelled">已取消</option>
      </select>
      <button class="btn quiet sm toolbar-btn" type="button" :disabled="pending" @click="reload">查询</button>
    </div>

    <LoadState
      :pending="pending"
      :error="loadError"
      :retry="load"
      :empty="!pending && !loadError && !list.length"
      empty-text="暂无交割记录。需走完交易流程并完成付款后，才会在此生成交割单。"
    />

    <div v-if="!pending && !loadError && list.length" class="tbl">
      <table>
        <thead>
          <tr>
            <th>作品 / 交割单</th>
            <th style="width:110px">金额</th>
            <th style="width:160px">状态</th>
            <th style="width:140px">创建时间</th>
            <th style="width:130px"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in list" :key="item.deliveryId">
            <td>
              <b>{{ item.workTitle || ('作品#' + item.workId) }}</b>
              <p class="cost">{{ item.deliveryNo || ('交割#' + item.deliveryId) }} · {{ deliveryLicenseLabel(item.licenseType) }}</p>
              <p class="cost">买方：{{ item.buyerName || item.buyerId }} · 卖方：{{ item.sellerName || item.sellerId }}</p>
            </td>
            <td class="num">{{ moneyYuan(item.amount) }}</td>
            <td>
              <span class="status-tag" :class="'tone-' + deliveryStatusTone(item.status)">{{ deliveryStatusLabel(item.status) }}</span>
              <p v-if="deliveryStatusDescription(item.status)" class="status-desc">{{ deliveryStatusDescription(item.status) }}</p>
            </td>
            <td class="num">{{ dateText(item.createTime) }}</td>
            <td class="ops">
              <button
                class="btn sm"
                :class="actionOf(item).primary ? '' : 'quiet'"
                type="button"
                @click="openDetail(item.deliveryId)"
              >{{ actionOf(item).label }}</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="!pending && !loadError && total > pageSize" class="pager">
      <button class="btn quiet sm" type="button" :disabled="pageNum <= 1 || pending" @click="prevPage">上一页</button>
      <span class="pager-info">第 {{ pageNum }} 页</span>
      <button class="btn quiet sm" type="button" :disabled="pageNum * pageSize >= total || pending" @click="nextPage">下一页</button>
    </div>

    <PortalLayer v-model="detailVisible" title="交割详情" modal big>
      <LoadState :pending="detailPending" :error="detailError" :retry="() => openDetail(detail?.deliveryId)" />
      <template v-if="detail && !detailPending && !detailError">
        <div class="detail-hero">
          <div>
            <h3>{{ detail.workTitle || ('作品#' + detail.workId) }}</h3>
            <p class="cost">{{ detail.deliveryNo || ('交割#' + detail.deliveryId) }}</p>
            <p>
              <span class="status-tag" :class="'tone-' + deliveryStatusTone(detail.status)">{{ deliveryStatusLabel(detail.status) }}</span>
            </p>
            <p v-if="deliveryStatusDescription(detail.status)" class="status-desc">{{ deliveryStatusDescription(detail.status) }}</p>
          </div>
        </div>

        <ul class="rows detail-rows">
          <li><span class="k">订单号</span><span class="v muted">{{ detail.orderNo || detail.orderId || '—' }}</span></li>
          <li><span class="k">授权类型</span><span class="v muted">{{ deliveryLicenseLabel(detail.licenseType) }}</span></li>
          <li><span class="k">交易金额</span><span class="v muted">{{ moneyYuan(detail.amount) }}</span></li>
          <li><span class="k">买方</span><span class="v muted">{{ detail.buyerName || detail.buyerId || '—' }}</span></li>
          <li><span class="k">卖方</span><span class="v muted">{{ detail.sellerName || detail.sellerId || '—' }}</span></li>
          <li v-if="detail.contractNo"><span class="k">合同编号</span><span class="v muted">{{ detail.contractNo }}</span></li>
          <li v-if="detail.certNo"><span class="k">版权证书号</span><span class="v muted">{{ detail.certNo }}</span></li>
          <li v-if="detail.remark"><span class="k">备注</span><span class="v muted">{{ detail.remark }}</span></li>
        </ul>

        <section v-if="detailFiles.length" class="block">
          <h4>已提交材料</h4>
          <ul class="file-list">
            <li v-for="(file, index) in detailFiles" :key="index">
              <div>
                <b>{{ file.fileName || '未命名文件' }}</b>
                <p class="cost">{{ deliveryFileTypeLabel(file.fileType) }} · {{ fileSizeText(file.fileSize) }}</p>
              </div>
              <a v-if="file.fileUrl" class="btn quiet sm" :href="mediaUrl(file.fileUrl)" target="_blank" rel="noopener">打开</a>
            </li>
          </ul>
        </section>

        <section v-if="canUpload" class="block">
          <h4>上传交割材料</h4>
          <p class="hint">须至少包含 1 个「版权证书」。先选类型再选文件，确认无误后提交。</p>
          <div class="upload-chips">
            <button
              v-for="type in DELIVERY_FILE_TYPES"
              :key="type.value"
              class="btn quiet sm"
              type="button"
              :disabled="busy"
              @click="pickFile(type.value)"
            >
              + {{ type.label }}
            </button>
            <input ref="fileInputRef" class="hidden-input" type="file" @change="onFileChosen" />
          </div>
          <ul v-if="pendingFiles.length" class="file-list pending">
            <li v-for="(file, index) in pendingFiles" :key="index">
              <div>
                <b>{{ file.fileName }}</b>
                <p class="cost">{{ deliveryFileTypeLabel(file.fileType) }} · {{ fileSizeText(file.fileSize) }}</p>
              </div>
              <button class="btn ghost sm" type="button" :disabled="busy" @click="removePending(index)">移除</button>
            </li>
          </ul>
          <textarea
            v-model.trim="uploadRemark"
            class="remark"
            rows="2"
            maxlength="200"
            placeholder="备注（选填）"
            :disabled="busy"
          />
        </section>

        <section class="block">
          <h4>交割进度</h4>
          <ol class="timeline">
            <li v-for="(event, index) in timeline" :key="index">
              <span class="time">{{ event.time }}</span>
              <span class="event">{{ event.event }}</span>
            </li>
          </ol>
        </section>

        <div class="action-bar">
          <button v-if="canUpload" class="btn sm" type="button" :disabled="busy" @click="submitUpload">提交交割材料</button>
          <button v-if="canConfirm" class="btn sm" type="button" :disabled="busy" @click="doConfirm">确认收货</button>
        </div>
      </template>
    </PortalLayer>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import PortalLayer from '../../../components/PortalLayer.vue'
import LoadState from '../../../components/LoadState.vue'
import { usePortal } from '../../../utils/portal.js'
import { dateText, money } from '../../../utils/creator.js'
import { avatarUrl } from '../../../utils/avatarUrl.js'
import {
  DELIVERY_FILE_TYPES,
  deliveryStatusLabel,
  deliveryStatusTone,
  deliveryStatusDescription,
  deliveryFileTypeLabel,
  deliveryLicenseLabel,
  deliveryActionMeta
} from '../../../utils/copyright.js'

const { api, user, handleError } = usePortal()

const list = ref([])
const total = ref(0)
const pending = ref(false)
const loadError = ref('')
const pageNum = ref(1)
const pageSize = 10
const roleFilter = ref('')
const statusFilter = ref('')

const detailVisible = ref(false)
const detail = ref(null)
const detailPending = ref(false)
const detailError = ref('')
const busy = ref(false)

const pendingFiles = ref([])
const uploadRemark = ref('')
const fileInputRef = ref(null)
const pickingType = ref('cert')

const userId = computed(() => Number(user.value?.userId))
const detailFiles = computed(() => Array.isArray(detail.value?.files) ? detail.value.files : [])
const canUpload = computed(() =>
  detail.value
  && Number(detail.value.sellerId) === userId.value
  && detail.value.status === 'pending_upload'
)
const canConfirm = computed(() =>
  detail.value
  && Number(detail.value.buyerId) === userId.value
  && detail.value.status === 'pending_confirm'
)
const timeline = computed(() => {
  const d = detail.value
  if (!d) return []
  const events = [{ time: dateText(d.createTime), event: '交割单已创建' }]
  if (d.uploadTime) events.push({ time: dateText(d.uploadTime), event: '卖方已提交交割材料' })
  if (d.confirmTime) events.push({ time: dateText(d.confirmTime), event: '买方确认收货' })
  if (d.completedTime) events.push({ time: dateText(d.completedTime), event: '交割完成' })
  if (d.status === 'cancelled') events.push({ time: dateText(d.createTime), event: '交割已取消' })
  return events
})

const moneyYuan = value => money(value)
const mediaUrl = raw => avatarUrl(raw) || raw
const actionOf = item => deliveryActionMeta(item, userId.value) || { label: '详情', primary: false }
const fileSizeText = size => {
  const n = Number(size) || 0
  if (n < 1024) return n + ' B'
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB'
  return (n / (1024 * 1024)).toFixed(1) + ' MB'
}

async function load() {
  pending.value = true
  loadError.value = ''
  try {
    const result = await api.value.listDeliveries({
      role: roleFilter.value || undefined,
      status: statusFilter.value || undefined,
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

async function openDetail(deliveryId) {
  if (!deliveryId) return
  detailVisible.value = true
  detailPending.value = true
  detailError.value = ''
  detail.value = null
  pendingFiles.value = []
  uploadRemark.value = ''
  try {
    const result = await api.value.getDelivery(deliveryId)
    if (!result) throw new Error('交割单不存在或无权限访问')
    detail.value = result
  } catch (failure) {
    detailError.value = failure.message
    await handleError(failure)
  } finally {
    detailPending.value = false
  }
}

async function openByOrder(orderId) {
  if (!orderId) return
  detailVisible.value = true
  detailPending.value = true
  detailError.value = ''
  detail.value = null
  pendingFiles.value = []
  uploadRemark.value = ''
  try {
    const result = await api.value.getDeliveryByOrder(orderId)
    if (!result) throw new Error('该订单暂无交割单')
    detail.value = result
  } catch (failure) {
    detailError.value = failure.message
    await handleError(failure)
  } finally {
    detailPending.value = false
  }
}

function pickFile(fileType) {
  pickingType.value = fileType
  fileInputRef.value?.click()
}

async function onFileChosen(event) {
  const file = event.target?.files?.[0]
  event.target.value = ''
  if (!file) return
  busy.value = true
  try {
    const result = await api.value.upload(file, 'copyright')
    const url = result?.url
    if (!url) throw new Error('文件上传响应缺少地址')
    pendingFiles.value.push({
      fileName: file.name,
      fileType: pickingType.value,
      fileUrl: url,
      fileSize: file.size
    })
    ElMessage.success('已添加：' + file.name)
  } catch (failure) {
    await handleError(failure)
  } finally {
    busy.value = false
  }
}

function removePending(index) {
  pendingFiles.value.splice(index, 1)
}

async function submitUpload() {
  if (!detail.value?.deliveryId) return
  if (!pendingFiles.value.length) {
    ElMessage.warning('请至少上传 1 个文件')
    return
  }
  if (!pendingFiles.value.some(f => f.fileType === 'cert')) {
    ElMessage.warning('必须上传版权证书文件')
    return
  }
  busy.value = true
  try {
    const updated = await api.value.uploadDelivery(detail.value.deliveryId, {
      files: pendingFiles.value,
      remark: uploadRemark.value || undefined
    })
    detail.value = updated
    pendingFiles.value = []
    uploadRemark.value = ''
    ElMessage.success('交割材料已提交，等待买方确认')
    await load()
  } catch (failure) {
    await handleError(failure)
  } finally {
    busy.value = false
  }
}

async function doConfirm() {
  if (!detail.value?.deliveryId) return
  try {
    await ElMessageBox.confirm('确认已收到交割材料？确认后订单将完成，此操作不可撤销。', '确认收货', { type: 'warning' })
  } catch {
    return
  }
  busy.value = true
  try {
    const updated = await api.value.confirmDelivery(detail.value.deliveryId)
    detail.value = updated
    ElMessage.success('已确认收货，交割完成')
    await load()
  } catch (failure) {
    await handleError(failure)
  } finally {
    busy.value = false
  }
}

defineExpose({ openDetail, openByOrder, reload: load })

onMounted(load)
</script>

<style scoped>
.delivery-panel .sub-head {
  display: flex; align-items: center; gap: 10px;
  padding-bottom: 8px; margin-bottom: 12px; border-bottom: 1px solid var(--rule, #eee);
}
.delivery-panel .sub-head h3 { margin: 0; flex: 1; font-size: 15px }
.delivery-panel .count { color: var(--ink-3, #999); font-size: 12.5px }

.delivery-panel .toolbar {
  display: flex; align-items: center; flex-wrap: wrap; gap: 8px;
  margin-bottom: 14px;
}
.delivery-panel .toolbar-control {
  box-sizing: border-box; height: 32px; margin: 0; padding: 0 10px;
  font: inherit; font-size: 13px; line-height: 30px;
  color: var(--ink, #333); background: var(--paper-2, #fff);
  border: 1px solid var(--rule-2, #d9d9d9); border-radius: var(--radius, 4px);
}
.delivery-panel .toolbar-control:focus {
  outline: none; border-color: var(--indigo, #3d5a56);
  box-shadow: 0 0 0 3px var(--indigo-wash, rgba(61, 90, 86, 0.12));
}
.delivery-panel .toolbar-control:disabled { opacity: 0.6; cursor: not-allowed }
.delivery-panel select.toolbar-control { width: 148px; appearance: auto }
.delivery-panel select.toolbar-control.status-filter { width: 160px }
.delivery-panel .toolbar-btn {
  box-sizing: border-box; height: 32px; padding: 0 12px !important;
  display: inline-flex; align-items: center; justify-content: center;
}

.delivery-panel .tbl table { width: 100%; border-collapse: collapse }
.delivery-panel .tbl th, .delivery-panel .tbl td {
  padding: 12px 10px; border-bottom: 1px solid var(--rule, #eee);
  text-align: left; vertical-align: top;
}
.delivery-panel .tbl th { font-size: 12px; color: var(--ink-3, #999); font-weight: 500 }
.delivery-panel .tbl .num { font-variant-numeric: tabular-nums; color: var(--ink-2, #666); font-size: 13px }
.delivery-panel .tbl .ops { white-space: nowrap }
.delivery-panel .cost { margin: 4px 0 0; color: var(--ink-3, #999); font-size: 12px }
.delivery-panel .status-desc { margin: 6px 0 0; color: var(--ink-3, #999); font-size: 12px; line-height: 1.45 }

.status-tag { display: inline-block; padding: 1px 8px; border-radius: 10px; font-size: 12px; font-weight: 500 }
.tone-ok { background: #f0f9eb; color: #67c23a }
.tone-wait { background: #ecf5ff; color: #409eff }
.tone-warn { background: #fdf6ec; color: #e6a23c }
.tone-off { background: #f4f4f5; color: #909399 }

.detail-hero { margin-bottom: 12px }
.detail-hero h3 { margin: 0 0 6px }
.detail-rows { margin-top: 8px }
.block {
  margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--rule, #eee);
}
.block h4 { margin: 0 0 8px; font-size: 13px; color: var(--ink-2, #666); font-weight: 500 }
.hint { margin: 0 0 10px; font-size: 12.5px; color: var(--ink-3, #999); line-height: 1.5 }
.upload-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 10px }
.hidden-input { display: none }
.file-list { list-style: none; margin: 0; padding: 0 }
.file-list li {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 10px 0; border-bottom: 1px solid var(--rule, #eee);
}
.file-list li:last-child { border-bottom: 0 }
.remark {
  width: 100%; box-sizing: border-box; margin-top: 10px; padding: 8px 10px;
  font: inherit; font-size: 13px; border: 1px solid var(--rule-2, #d9d9d9);
  border-radius: var(--radius, 4px); resize: vertical;
}
.timeline { margin: 0; padding-left: 18px }
.timeline li { margin: 6px 0; font-size: 13px; color: var(--ink-2, #666) }
.timeline .time { display: inline-block; min-width: 140px; color: var(--ink-3, #999); margin-right: 8px }
.action-bar { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px }
.pager {
  display: flex; align-items: center; justify-content: flex-end; gap: 10px;
  margin-top: 14px;
}
.pager-info { font-size: 12.5px; color: var(--ink-3, #999) }
</style>
