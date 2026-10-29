<template>
  <div class="cert-panel">
    <div class="sub-head">
      <h3>电子证书</h3>
      <span class="count">{{ total }} 份</span>
    </div>
    <div class="toolbar">
      <input v-model.trim="workName" class="toolbar-control search" type="search" placeholder="按作品名搜索" :disabled="pending" @keydown.enter.prevent="load" />
      <button class="btn quiet sm toolbar-btn" type="button" :disabled="pending" @click="load">查询</button>
    </div>

    <LoadState :pending="pending" :error="loadError" :retry="load" :empty="!pending && !loadError && !list.length" empty-text="暂无电子证书，版权登记完成后会显示在这里" />

    <div v-if="!pending && !loadError && list.length" class="worklist">
      <CopyrightWorkCard v-for="item in list" :key="item.certId" :title="item.workName || ('作品#' + item.workId)" :cover="worksForCovers.find(w => w.workId === item.workId)?.cover" :status="certStatusLabel(item.status)">
        <p class="cost">证书编号：{{ item.certNo || '待生成' }}</p>
        <p class="cost">著作权人：{{ item.userName || '—' }}</p>
        <p class="cost">登记日期：{{ dateText(item.certTime || item.applyTime).slice(0, 10) }}</p>
        <template #actions>
          <button class="btn sm" type="button" @click="openDetail(item.certId)">查看证书</button>
          <button v-if="isCertIssued(item)" class="btn quiet sm" type="button" :disabled="busy" @click="doDownload(item)">下载证书</button>
        </template>
      </CopyrightWorkCard>
    </div>

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

const list = ref([])
const total = ref(0)
const pending = ref(false)
const loadError = ref('')
const busy = ref(false)
const workName = ref('')

const detailVisible = ref(false)
const detail = ref(null)
const detailPending = ref(false)
const detailError = ref('')

async function load() {
  pending.value = true
  loadError.value = ''
  try {
    const result = await api.value.listCopyrightCerts({
      workName: workName.value || undefined,
      pageNum: 1,
      pageSize: 50
    })
    list.value = Array.isArray(result) ? result : (result?.list || result?.rows || [])
    total.value = Number(result?.total ?? list.value.length) || 0
  } catch (failure) {
    loadError.value = failure.message
    await handleError(failure)
  } finally {
    pending.value = false
  }
}

async function openDetail(certId) {
  if (!certId) return
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
      // 鉴权失败等交给统一处理；其余继续走 Mock
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

/** 供申请详情跳转证书时调用 */
async function openById(certId) {
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

.certs { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 14px }
.cert {
  position: relative; padding: 20px 18px 18px; background: var(--paper-2, #fafafa);
  border: 1px solid var(--rule-2, #e8e8e8); border-radius: 8px; cursor: pointer;
}
.cert::after {
  content: ""; position: absolute; right: 14px; bottom: 14px; width: 46px; height: 46px;
  border: 2px solid rgba(103, 194, 58, 0.25); border-radius: 50%; pointer-events: none;
}
.cert h3 { font-size: 15px; margin: 0 0 2px }
.cert .no, .cert-detail-hero .no { font-size: 11.5px; color: var(--ink-3, #999); font-variant-numeric: tabular-nums; letter-spacing: .04em; margin: 0 }
.cert dl { display: flex; gap: 18px; margin: 13px 0 0 }
.cert dt { font-size: 11px; color: var(--ink-3, #999) }
.cert dd { margin: 1px 0 0; font-size: 13px }
.cert-status { margin: 10px 0 0 }
.cert .ops { margin-top: 14px; display: flex; gap: 7px }

.status-tag { display: inline-block; padding: 1px 8px; border-radius: 10px; font-size: 12px; font-weight: 500 }
.tone-wait { background: #fdf6ec; color: #e6a23c }
.tone-ok { background: #f0f9eb; color: #67c23a }
.tone-bad { background: #fef0f0; color: #f56c6c }
.tone-off { background: #f4f4f5; color: #909399 }

.cert-detail-hero { display: grid; grid-template-columns: 64px 1fr; gap: 14px; align-items: center; margin-bottom: 14px }
.cert-badge {
  width: 64px; height: 64px; border-radius: 50%; display: grid; place-items: center;
  background: linear-gradient(145deg, #e8f5e0, #f0f9eb); color: #3d8b40; font-size: 22px; font-weight: 700;
  border: 1px solid #c2e7b0;
}
.cert-detail-hero h3 { margin: 0 0 4px }
.detail-rows { margin-top: 4px }
.detail-rows .hash { max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.action-bar { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px }
</style>
