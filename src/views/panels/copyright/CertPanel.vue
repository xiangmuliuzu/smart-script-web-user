<template>
  <div class="cert-panel">
    <div class="sub-head">
      <h3>电子证书</h3>
      <span class="count">{{ total }} 份</span>
    </div>

    <div class="source-tabs" role="tablist" aria-label="证书来源">
      <button
        type="button"
        role="tab"
        class="source-tab"
        :class="{ on: source === 'applied' }"
        :aria-selected="source === 'applied'"
        :disabled="pending"
        @click="switchSource('applied')"
      >我申请的</button>
      <button
        type="button"
        role="tab"
        class="source-tab"
        :class="{ on: source === 'purchased' }"
        :aria-selected="source === 'purchased'"
        :disabled="pending"
        @click="switchSource('purchased')"
      >购买获得</button>
    </div>

    <div class="toolbar">
      <input
        v-model.trim="keyword"
        class="toolbar-control search"
        type="search"
        :placeholder="source === 'purchased' ? '搜索作品名 / 卖家 / 材料名' : '按作品名搜索'"
        :disabled="pending"
        @keydown.enter.prevent="load"
      />
      <button class="btn quiet sm toolbar-btn" type="button" :disabled="pending" @click="load">查询</button>
    </div>

    <LoadState
      :pending="pending"
      :error="loadError"
      :retry="load"
      :empty="!pending && !loadError && !list.length"
      :empty-text="source === 'purchased'
        ? '暂无购买获得的版权材料。确认收货后，且卖方交割时上传了版权证书才会出现。'
        : '暂无电子证书，版权登记完成后会显示在这里'"
    />

    <!-- 我申请的 -->
    <div v-if="source === 'applied' && !pending && !loadError && list.length" class="worklist">
      <CopyrightWorkCard
        v-for="item in list"
        :key="item.certId"
        :title="item.workName || ('作品#' + item.workId)"
        :cover="worksForCovers.find(w => w.workId === item.workId)?.cover"
        :status="certStatusLabel(item.status)"
      >
        <p class="cost">证书编号：{{ item.certNo || '待生成' }}</p>
        <p class="cost">著作权人：{{ item.userName || '—' }}</p>
        <p class="cost">登记日期：{{ dateText(item.certTime || item.applyTime).slice(0, 10) }}</p>
        <template #actions>
          <button class="btn sm" type="button" @click="openDetail(item.certId)">查看证书</button>
          <button v-if="isCertIssued(item)" class="btn quiet sm" type="button" :disabled="busy" @click="doDownload(item)">下载证书</button>
        </template>
      </CopyrightWorkCard>
    </div>

    <!-- 购买获得 -->
    <div v-if="source === 'purchased' && !pending && !loadError && list.length" class="worklist">
      <CopyrightWorkCard
        v-for="item in list"
        :key="item.fileId"
        :title="item.workTitle ? ('《' + item.workTitle + '》') : ('作品#' + (item.workId || ''))"
        :cover="item.workCover || worksForCovers.find(w => w.workId === item.workId)?.cover"
        status="购买获得"
      >
        <p class="cost">材料：{{ item.fileName || '未命名材料' }}</p>
        <p class="cost">卖家：{{ item.sellerName || '—' }}</p>
        <p class="cost">交割时间：{{ item.deliveryTime || '—' }}</p>
        <p class="cost">订单号：{{ item.orderNo || (item.orderId ? ('#' + item.orderId) : '—') }}</p>
        <template #actions>
          <button class="btn sm" type="button" @click="openPurchasedPreview(item)">预览</button>
          <a
            class="btn quiet sm"
            :href="resolveMedia(item.fileUrl)"
            :download="item.fileName || 'copyright'"
            target="_blank"
            rel="noopener"
            @click="onPurchasedDownloadClick(item, $event)"
          >下载</a>
        </template>
      </CopyrightWorkCard>
    </div>

    <!-- 我申请的：证书详情 -->
    <PortalLayer v-model="detailVisible" title="电子证书详情" modal big>
      <LoadState :pending="detailPending" :error="detailError" :retry="() => openDetail(detail?.certId)" />
      <template v-if="detail && !detailPending && !detailError">
        <div class="cert-detail-hero">
          <div class="cert-badge">证</div>
          <div>
            <h3>{{ detail.workName || ('作品#' + detail.workId) }}</h3>
            <p class="no">{{ detail.certNo || '—' }}</p>
            <p>
              <span class="status-tag" :class="'tone-' + certStatusTone(detail.status)">{{ certStatusLabel(detail.status) }}</span>
            </p>
          </div>
        </div>
        <ul class="rows detail-rows">
          <li><span class="k">著作权人</span><span class="v muted">{{ detail.userName || '—' }}</span></li>
          <li><span class="k">作品 ID</span><span class="v muted">{{ detail.workId || '—' }}</span></li>
          <li><span class="k">申请时间</span><span class="v muted">{{ dateText(detail.applyTime) }}</span></li>
          <li><span class="k">发证时间</span><span class="v muted">{{ dateText(detail.certTime) }}</span></li>
          <li v-if="detail.blockchainHash"><span class="k">区块链存证</span><span class="v muted hash" :title="detail.blockchainHash">{{ detail.blockchainHash }}</span></li>
          <li v-if="detail.remark"><span class="k">备注</span><span class="v muted">{{ detail.remark }}</span></li>
        </ul>
        <div class="action-bar">
          <button v-if="isCertIssued(detail)" class="btn sm" :disabled="busy" @click="doDownload(detail)">下载证书</button>
          <button v-if="detail.blockchainHash" class="btn quiet sm" type="button" @click="copyHash">复制存证哈希</button>
        </div>
      </template>
    </PortalLayer>

    <!-- 购买获得：材料预览 -->
    <PortalLayer v-model="previewVisible" :title="previewTitle" modal big>
      <div v-loading="previewLoading" class="preview-wrap">
        <template v-if="previewItem">
          <div class="preview-meta">
            <p>作品：《{{ previewItem.workTitle || '-' }}》 · 卖家：{{ previewItem.sellerName || '-' }}</p>
            <p>交割时间：{{ previewItem.deliveryTime || '-' }} · 材料：{{ previewItem.fileName || '-' }}</p>
          </div>
          <iframe v-if="previewKind === 'pdf'" class="preview-frame" :src="previewSrc" title="版权材料预览" />
          <img v-else-if="previewKind === 'image'" class="preview-image" :src="previewSrc" :alt="previewItem.fileName || '版权材料'" />
          <div v-else class="load-state">
            <p>该文件类型暂不支持在线预览，请下载后查看</p>
            <a class="btn sm" :href="previewSrc" :download="previewItem.fileName || 'copyright'" target="_blank" rel="noopener">下载到本地</a>
          </div>
          <div v-if="previewKind === 'pdf' || previewKind === 'image'" class="preview-actions">
            <a class="btn quiet sm" :href="previewSrc" :download="previewItem.fileName || 'copyright'" target="_blank" rel="noopener">下载到本地</a>
          </div>
        </template>
        <div v-else class="load-state"><p>{{ previewLoading ? '加载中…' : '版权内容不可用' }}</p></div>
      </div>
    </PortalLayer>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import PortalLayer from '../../../components/PortalLayer.vue'
import LoadState from '../../../components/LoadState.vue'
import CopyrightWorkCard from './CopyrightWorkCard.vue'
import { usePortal } from '../../../utils/portal.js'
import { dateText } from '../../../utils/creator.js'
import { mediaUrl } from '../../../utils/avatarUrl.js'
import {
  certStatusLabel, certStatusTone, isCertIssued,
  buildMockCertPdf, saveBlobFile
} from '../../../utils/copyright.js'

const { api, handleError } = usePortal()
defineProps({ worksForCovers: { type: Array, default: () => [] } })

const source = ref('applied') // applied | purchased
const list = ref([])
const total = ref(0)
const pending = ref(false)
const loadError = ref('')
const busy = ref(false)
const keyword = ref('')

const detailVisible = ref(false)
const detail = ref(null)
const detailPending = ref(false)
const detailError = ref('')

const previewVisible = ref(false)
const previewLoading = ref(false)
const previewItem = ref(null)
const previewTitle = ref('版权材料详情')
const previewSrc = ref('')
const previewKind = ref('other')

const resolveMedia = raw => mediaUrl(raw) || raw || ''

function switchSource(next) {
  if (source.value === next) return
  source.value = next
  keyword.value = ''
  load()
}

async function load() {
  pending.value = true
  loadError.value = ''
  try {
    if (source.value === 'purchased') {
      const result = await api.value.listBuyerCopyrights({
        keyword: keyword.value || undefined,
        pageNum: 1,
        pageSize: 50
      })
      list.value = Array.isArray(result) ? result : (result?.list || result?.rows || [])
      total.value = Number(result?.total ?? list.value.length) || 0
    } else {
      const result = await api.value.listCopyrightCerts({
        workName: keyword.value || undefined,
        pageNum: 1,
        pageSize: 50
      })
      list.value = Array.isArray(result) ? result : (result?.list || result?.rows || [])
      total.value = Number(result?.total ?? list.value.length) || 0
    }
  } catch (failure) {
    loadError.value = failure.message
    list.value = []
    total.value = 0
    await handleError(failure)
  } finally {
    pending.value = false
  }
}

async function openDetail(certId) {
  if (!certId) return
  source.value = 'applied'
  detailVisible.value = true
  detailPending.value = true
  detailError.value = ''
  detail.value = null
  try {
    const result = await api.value.getCopyrightCert(certId)
    if (!result) throw new Error('证书不存在或无权限访问')
    detail.value = result
  } catch (failure) {
    detailError.value = failure.message
    await handleError(failure)
  } finally {
    detailPending.value = false
  }
}

/**
 * 下载策略对齐 Admin：
 * - Admin：`/admin/.../cert/{id}/download` 直接返回 Mock PDF 字节流
 * - App/User：`/content/copyright/cert/{id}/download` 只返回 certUrl（开发期常不可达）
 * 因此：先鉴权取 URL，能拉到真实文件就用；否则回退本地 Mock PDF（与 Admin 同源逻辑）
 */
async function doDownload(item) {
  const certId = item?.certId
  if (!certId || busy.value) return
  busy.value = true
  const fileName = `证书_${item.certNo || certId}.pdf`
  try {
    let remoteUrl = item.certUrl || ''
    try {
      const result = await api.value.downloadCopyrightCert(certId)
      remoteUrl = typeof result === 'string' ? result : (result?.url || remoteUrl)
    } catch (failure) {
      if (failure?.status === 401 || failure?.code === 401) {
        await handleError(failure)
        return
      }
    }

    const blob = (await tryFetchCertBlob(remoteUrl)) || buildMockCertPdf(item)
    saveBlobFile(blob, fileName)
    ElMessage.success('证书下载成功')
  } catch (failure) {
    ElMessage.error(failure.message || '证书下载失败')
  } finally {
    busy.value = false
  }
}

async function tryFetchCertBlob(rawUrl) {
  if (!rawUrl) return null
  const url = mediaUrl(rawUrl)
  if (!url || /^https?:\/\/mock/i.test(url)) return null
  try {
    const response = await fetch(url)
    if (!response.ok) return null
    const contentType = response.headers.get('content-type') || ''
    const buffer = await response.arrayBuffer()
    if (!buffer.byteLength) return null
    if (contentType.includes('application/json')) return null
    const head = new TextDecoder('utf-8').decode(buffer.slice(0, 200))
    if (head.includes('"code"') || !head.startsWith('%PDF')) return null
    return new Blob([buffer], { type: 'application/pdf' })
  } catch {
    return null
  }
}

async function copyHash() {
  const hash = detail.value?.blockchainHash
  if (!hash) return
  try {
    await navigator.clipboard.writeText(hash)
    ElMessage.success('已复制存证哈希')
  } catch {
    ElMessage.error('复制失败，请手动选择复制')
  }
}

async function openPurchasedPreview(item) {
  if (!item?.fileId) return
  previewTitle.value = `版权材料 · ${item.fileName || ('#' + item.fileId)}`
  previewItem.value = null
  previewSrc.value = ''
  previewKind.value = 'other'
  previewVisible.value = true
  previewLoading.value = true
  try {
    const detailRow = await api.value.getBuyerCopyright(item.fileId)
    previewItem.value = detailRow || item
    previewSrc.value = resolveMedia(detailRow?.fileUrl || item.fileUrl)
    previewKind.value = detailRow?.previewKind || item.previewKind || 'other'
  } catch (failure) {
    await handleError(failure)
    previewVisible.value = false
  } finally {
    previewLoading.value = false
  }
}

function onPurchasedDownloadClick(item, event) {
  if (!item?.fileUrl) {
    event.preventDefault()
    ElMessage.warning('暂无可下载的文件地址')
  }
}

/** 供申请详情跳转证书时调用 */
async function openById(certId) {
  source.value = 'applied'
  await openDetail(certId)
}

defineExpose({ openById, load })
onMounted(load)
</script>

<style scoped>
.cert-panel .sub-head {
  display: flex; align-items: center; gap: 10px;
  padding-bottom: 8px; margin-bottom: 12px; border-bottom: 1px solid var(--rule, #eee);
}
.cert-panel .sub-head h3 { margin: 0; flex: 1; font-size: 15px }
.cert-panel .count { color: var(--ink-3, #999); font-size: 12.5px }

.cert-panel .source-tabs {
  display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap;
}
.cert-panel .source-tab {
  height: 30px; padding: 0 14px; border: 1px solid var(--rule-2, #d9d9d9);
  border-radius: 16px; background: #fff; color: var(--ink-2, #666);
  font: inherit; font-size: 13px; cursor: pointer;
}
.cert-panel .source-tab.on {
  border-color: var(--indigo, #3d5a56);
  background: var(--indigo-wash, rgba(61, 90, 86, 0.12));
  color: var(--indigo, #3d5a56); font-weight: 600;
}
.cert-panel .source-tab:disabled { opacity: 0.6; cursor: not-allowed }

.cert-panel .toolbar {
  display: flex; align-items: center; flex-wrap: wrap; gap: 8px;
  margin-bottom: 14px;
}
.cert-panel .toolbar-control {
  box-sizing: border-box; height: 32px; margin: 0; padding: 0 10px;
  font: inherit; font-size: 13px; line-height: 30px;
  color: var(--ink, #333); background: var(--paper-2, #fff);
  border: 1px solid var(--rule-2, #d9d9d9); border-radius: var(--radius, 4px);
  vertical-align: middle;
}
.cert-panel .toolbar-control:focus {
  outline: none; border-color: var(--indigo, #3d5a56);
  box-shadow: 0 0 0 3px var(--indigo-wash, rgba(61, 90, 86, 0.12));
}
.cert-panel .toolbar-control:disabled { opacity: 0.6; cursor: not-allowed }
.cert-panel input.toolbar-control.search { width: 240px; flex: 1; min-width: 160px; max-width: 320px }
.cert-panel .toolbar-btn {
  box-sizing: border-box; height: 32px; padding: 0 12px !important;
  display: inline-flex; align-items: center; justify-content: center;
}

.status-tag { display: inline-block; padding: 1px 8px; border-radius: 10px; font-size: 12px; font-weight: 500 }
.tone-wait { background: #fdf6ec; color: #e6a23c }
.tone-ok { background: #f0f9eb; color: #67c23a }
.tone-bad { background: #fef0f0; color: #f56c6c }
.tone-off { background: var(--paper-3); color: var(--ink-3) }

.cert-detail-hero { display: grid; grid-template-columns: 64px 1fr; gap: 14px; align-items: center; margin-bottom: 14px }
.cert-badge {
  width: 64px; height: 64px; border-radius: 50%; display: grid; place-items: center;
  background: linear-gradient(145deg, #e8f5e0, #f0f9eb); color: #3d8b40; font-size: 22px; font-weight: 700;
  border: 1px solid #c2e7b0;
}
.cert-detail-hero h3 { margin: 0 0 4px }
.cert-detail-hero .no { font-size: 11.5px; color: var(--ink-3, #999); font-variant-numeric: tabular-nums; letter-spacing: .04em; margin: 0 }
.detail-rows { margin-top: 4px }
.detail-rows .hash { max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.action-bar { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px }

.preview-wrap { min-height: 320px }
.preview-meta { margin-bottom: 12px; color: var(--ink-2, #666); font-size: 13px; line-height: 1.5 }
.preview-meta p { margin: 0 0 4px }
.preview-frame {
  width: 100%; height: min(70vh, 640px); border: 1px solid var(--rule, #eee);
  border-radius: 6px; background: #fff;
}
.preview-image {
  display: block; max-width: 100%; max-height: min(70vh, 640px); margin: 0 auto;
  border-radius: 6px; border: 1px solid var(--rule, #eee);
}
.preview-actions { margin-top: 12px; display: flex; justify-content: flex-end }
.load-state { padding: 40px 16px; text-align: center; color: var(--ink-3, #999) }
</style>
