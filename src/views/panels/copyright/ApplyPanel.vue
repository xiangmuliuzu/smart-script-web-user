<template>
  <div class="apply-panel">
    <div class="sub-head">
      <h3>我的申请</h3>
      <span class="count">{{ total }} 条</span>
      <button class="btn sm" :disabled="busy" @click="openCreate">发起申请</button>
    </div>
    <div class="toolbar">
      <select v-model="statusFilter" class="toolbar-control" :disabled="pending" @change="load">
        <option value="">全部状态</option>
        <option v-for="(label, key) in APPLY_STATUS" :key="key" :value="key">{{ label }}</option>
      </select>
      <input v-model.trim="workName" class="toolbar-control search" type="search" placeholder="按作品名搜索" :disabled="pending" @keydown.enter.prevent="load" />
      <button class="btn quiet sm toolbar-btn" type="button" :disabled="pending" @click="load">查询</button>
    </div>

    <LoadState :pending="pending" :error="loadError" :retry="load" :empty="!pending && !loadError && !list.length" empty-text="暂无版权申请记录">
      <button class="btn sm" :disabled="busy" @click="openCreate">立即申请</button>
    </LoadState>

    <div v-if="!pending && !loadError && list.length" class="worklist">
      <CopyrightWorkCard v-for="item in list" :key="item.applyId" :title="item.workName || ('作品#' + item.workId)" :cover="item.workCoverUrl || worksForCovers.find(w => w.workId === item.workId)?.cover" :status="applyStatusLabel(item.status)">
        <p class="cost">作品类型：{{ workTypeLabel(item.workType) }}</p>
        <p v-if="item.centerName" class="cost">版权中心：{{ item.centerName }}</p>
        <p class="cost">申请编号：{{ item.applyNo || '—' }}</p>
        <p class="cost">提交时间：{{ dateText(item.submitTime || item.createTime) }}</p>
        <p v-if="item.status === 'rejected' && item.rejectReason" class="cost reject-tip">{{ item.rejectReason }}</p>
        <template #actions>
          <button class="btn quiet sm" type="button" @click="openDetail(item.applyId)">查看申请</button>
          <button v-if="canResubmit(item)" class="btn sm" type="button" @click="openResubmit(item)">重新提交</button>
        </template>
      </CopyrightWorkCard>
    </div>

    <!-- 发起 / 重新提交 -->
    <PortalLayer v-model="formVisible" :title="resubmitId ? '重新提交申请' : '发起版权申请'" modal big size="min(700px, 94vw)" :before-close="closeForm">
      <form class="apply-form" @submit.prevent="submitForm">
        <div v-if="!resubmitId" class="field">
          <span class="field-label">选择作品</span>
          <select v-model="form.workId" required :disabled="formBusy || worksLoading" @change="formDirty = true">
            <option value="">{{ worksLoading ? '加载作品中…' : '请选择要登记版权的作品' }}</option>
            <option v-for="work in works" :key="work.workId || work.id" :value="String(work.workId || work.id)">{{ work.title || work.workName || ('作品#' + (work.workId || work.id)) }}</option>
          </select>
          <p v-if="!worksLoading && !works.length" class="cost">暂无可选作品，请先在「我的作品」中创建作品</p>
        </div>
        <div v-else class="field">
          <span class="field-label">原申请作品</span>
          <input :value="form.workName" disabled />
        </div>

        <div class="field">
          <span class="field-label">作品类型</span>
          <div class="type-chips">
            <button v-for="item in WORK_TYPES" :key="item.value" type="button" class="chip" :class="{ on: form.workType === item.value }" :disabled="formBusy" @click="form.workType = item.value; formDirty = true">{{ item.label }}</button>
          </div>
        </div>

        <div v-if="!resubmitId" class="field">
          <span class="field-label">版权中心</span>
          <select v-model="form.copyrightCenter" required :disabled="formBusy || centersLoading" @change="formDirty = true">
            <option value="">{{ centersLoading ? '加载中…' : '请选择版权中心' }}</option>
            <option v-for="center in centers" :key="center.centerCode" :value="center.centerCode">{{ center.centerName || center.centerCode }}</option>
          </select>
        </div>

        <div class="field">
          <span class="field-label">作品完成时间</span>
          <input v-model="form.completeTime" type="date" required :disabled="formBusy" @change="formDirty = true" />
        </div>

        <div class="field">
          <span class="field-label">申请材料</span>
          <p class="cost">支持图片（jpg/png）、文档（pdf/doc/docx）和文本（txt），最多 20 个文件</p>
          <label class="drop upload-control apply-drop">
            <input type="file" accept="image/png,image/jpeg,.pdf,.doc,.docx,.txt" multiple :disabled="formBusy || form.materials.length >= 20" @change="onMaterials($event.target.files); $event.target.value = ''" />
            <span>{{ formBusy && uploadingMaterial ? '正在上传材料…' : '点击上传申请材料' }}</span>
          </label>
          <ul v-if="form.materials.length" class="material-list">
            <li v-for="(item, index) in form.materials" :key="item.url + index">
              <button type="button" class="text-button material-name" :title="item.name" @click="openPreview(item.url, item.name)">{{ item.name }}</button>
              <button type="button" class="btn quiet sm" :disabled="formBusy" @click="form.materials.splice(index, 1); formDirty = true">移除</button>
            </li>
          </ul>
        </div>

        <div class="field">
          <span class="field-label">{{ resubmitId ? '修改说明' : '备注说明（选填）' }}</span>
          <textarea v-model="form.remark" maxlength="500" rows="3" :placeholder="resubmitId ? '请说明本次修改内容' : '选填'" :disabled="formBusy" @input="formDirty = true" />
        </div>

        <p v-if="realNameTip" class="note bad">{{ realNameTip }}</p>
        <p v-if="formError" class="note bad" role="alert">{{ formError }}</p>
        <button class="btn" :disabled="formBusy">{{ formBusy ? '提交中…' : (resubmitId ? '重新提交' : '提交申请') }}</button>
      </form>
    </PortalLayer>

    <!-- 详情 -->
    <PortalLayer v-model="detailVisible" title="申请详情" modal big>
      <LoadState :pending="detailPending" :error="detailError" :retry="() => openDetail(detail?.applyId)" />
      <template v-if="detail && !detailPending && !detailError">
        <div class="detail-hero">
          <div>
            <h3>{{ detail.workName || ('作品#' + detail.workId) }}</h3>
            <p>
              <span class="status-tag" :class="'tone-' + applyStatusTone(detail.status)">{{ applyStatusLabel(detail.status) }}</span>
            </p>
            <p class="cost">{{ applyStatusDescription(detail) }}</p>
          </div>
        </div>
        <ul class="rows detail-rows">
          <li><span class="k">申请编号</span><span class="v muted">{{ detail.applyNo || '—' }}</span></li>
          <li><span class="k">作品类型</span><span class="v muted">{{ workTypeLabel(detail.workType) }}</span></li>
          <li><span class="k">版权中心</span><span class="v muted">{{ detail.centerName || detail.copyrightCenter || '—' }}</span></li>
          <li><span class="k">提交时间</span><span class="v muted">{{ dateText(detail.submitTime || detail.createTime) }}</span></li>
          <li v-if="detail.certNo"><span class="k">证书编号</span><span class="v muted">{{ detail.certNo }}</span></li>
          <li v-if="detail.remark"><span class="k">备注</span><span class="v muted">{{ detail.remark }}</span></li>
          <li v-if="detail.rejectReason"><span class="k">驳回原因</span><span class="v muted">{{ detail.rejectReason }}</span></li>
        </ul>
        <div class="sub-head sub"><h3>申请材料</h3></div>
        <ul v-if="detailMaterials.length" class="material-list">
          <li v-for="(item, index) in detailMaterials" :key="item.url + index">
            <span class="material-name" :title="item.name">{{ item.name }}</span>
            <div class="material-actions">
              <button type="button" class="text-button" @click="openPreview(item.url, item.name)">在线预览</button>
              <button type="button" class="text-button" @click="downloadMaterial(item.url, item.name)">下载</button>
            </div>
          </li>
        </ul>
        <p v-else class="cost">暂无申请材料</p>
        <div class="action-bar">
          <button v-if="canResubmit(detail)" class="btn sm" :disabled="busy" @click="openResubmit(detail)">重新提交</button>
          <button v-if="isCertificated(detail) && detail.certId" class="btn sm" :disabled="busy" @click="emit('open-cert', detail.certId)">查看电子证书</button>
          <button v-if="canDeleteApply(detail)" class="btn sm ghost" :disabled="busy" @click="doDelete">删除申请</button>
        </div>
      </template>
    </PortalLayer>

    <PortalLayer v-model="previewVisible" :title="previewTitle" modal big>
      <div v-loading="previewLoading" class="preview-body">
        <div v-if="previewError" class="preview-fallback">
          <p class="note bad">{{ previewError }}</p>
          <button class="btn sm" type="button" @click="retryPreview">重试</button>
          <button class="btn sm ghost" type="button" @click="downloadMaterial(previewRaw, previewTitle)">下载文件</button>
        </div>
        <div v-else-if="previewKind === 'image'" class="preview-frame">
          <img :src="previewSrc" alt="预览" @error="previewError = '图片加载失败，请尝试下载查看'" @load="previewLoading = false" />
        </div>
        <iframe v-else-if="previewKind === 'pdf'" class="preview-frame pdf" :src="previewSrc" title="PDF 预览" @load="previewLoading = false" />
        <pre v-else-if="previewKind === 'text'" class="preview-text">{{ previewText }}</pre>
        <div v-else class="preview-fallback">
          <p class="cost">{{ previewKind === 'office' ? 'Word 等 Office 文档暂不支持在线预览，请下载后打开。' : '该文件格式暂不支持在线预览，请下载后查看。' }}</p>
          <button class="btn sm" type="button" @click="downloadMaterial(previewRaw, previewTitle)">下载文件</button>
        </div>
      </div>
    </PortalLayer>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import PortalLayer from '../../../components/PortalLayer.vue'
import LoadState from '../../../components/LoadState.vue'
import CopyrightWorkCard from './CopyrightWorkCard.vue'
import { usePortal } from '../../../utils/portal.js'
import { dateText, validateFile } from '../../../utils/creator.js'
import { mediaUrl, decodeTextBuffer } from '../../../utils/avatarUrl.js'
import { fileNameFromUrl as sealFileName, materialKind } from '../../../utils/seal.js'
import {
  APPLY_STATUS, WORK_TYPES,
  applyStatusLabel, applyStatusTone, applyStatusDescription, workTypeLabel,
  canResubmit, canDeleteApply, isCertificated,
  copyrightMaterialItems, materialsToJson, guessFileType
} from '../../../utils/copyright.js'

const emit = defineEmits(['open-cert'])
defineProps({ worksForCovers: { type: Array, default: () => [] } })
const { api, handleError } = usePortal()

const list = ref([])
const total = ref(0)
const pending = ref(false)
const loadError = ref('')
const busy = ref(false)
const statusFilter = ref('')
const workName = ref('')

const works = ref([])
const worksLoading = ref(false)
const centers = ref([])
const centersLoading = ref(false)
const realNameTip = ref('')

const formVisible = ref(false)
const resubmitId = ref(null)
const form = reactive({
  workId: '',
  workName: '',
  workType: 'script',
  copyrightCenter: '',
  completeTime: '',
  remark: '',
  materials: []
})
const formError = ref('')
const formBusy = ref(false)
const formDirty = ref(false)
const uploadingMaterial = ref(false)

const detailVisible = ref(false)
const detail = ref(null)
const detailPending = ref(false)
const detailError = ref('')
const detailMaterials = computed(() => {
  const d = detail.value
  if (!d) return []
  const merged = [
    ...copyrightMaterialItems(d.originalityProof),
    ...copyrightMaterialItems(d.authorIdentityDoc),
    ...copyrightMaterialItems(d.creationProcess),
    ...copyrightMaterialItems(d.otherProof),
    ...copyrightMaterialItems(d.identityProofUrl),
    ...copyrightMaterialItems(d.creationProofUrl),
    ...copyrightMaterialItems(d.otherMaterialsUrls),
    ...copyrightMaterialItems(d.workFileUrl || d.attachmentUrl || d.fileUrl)
  ]
  const seen = new Set()
  return merged.filter(item => {
    if (seen.has(item.url)) return false
    seen.add(item.url)
    return true
  })
})

const previewVisible = ref(false)
const previewTitle = ref('材料预览')
const previewRaw = ref('')
const previewText = ref('')
const previewLoading = ref(false)
const previewError = ref('')
const previewSrc = computed(() => mediaUrl(previewRaw.value))
const previewKind = computed(() => materialKind(previewRaw.value))

async function load() {
  pending.value = true
  loadError.value = ''
  try {
    const result = await api.value.listCopyrightApplications({
      status: statusFilter.value || undefined,
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

async function ensureWorks() {
  worksLoading.value = true
  try { works.value = await api.value.listWorks() }
  catch (failure) { await handleError(failure); works.value = [] }
  finally { worksLoading.value = false }
}

async function ensureCenters() {
  centersLoading.value = true
  try { centers.value = await api.value.listCopyrightCenters() }
  catch (failure) { await handleError(failure); centers.value = [] }
  finally { centersLoading.value = false }
}

async function checkRealName() {
  realNameTip.value = ''
  try {
    const info = await api.value.getRealName()
    const status = info?.status || ''
    if (status !== 'APPROVED') {
      realNameTip.value = status === 'PENDING'
        ? '实名认证审核中，审核通过后再提交版权申请更稳妥。'
        : '建议先完成实名认证后再提交版权申请。可在「账号」中办理。'
    }
  } catch { /* 实名接口失败不阻断申请表单 */ }
}

function resetForm() {
  resubmitId.value = null
  form.workId = ''
  form.workName = ''
  form.workType = 'script'
  form.copyrightCenter = ''
  form.completeTime = ''
  form.remark = ''
  form.materials = []
  formError.value = ''
  formDirty.value = false
  realNameTip.value = ''
}

async function openCreate() {
  resetForm()
  formVisible.value = true
  await Promise.all([ensureWorks(), ensureCenters(), checkRealName()])
}

async function openResubmit(item) {
  if (!item?.applyId) return
  resetForm()
  resubmitId.value = item.applyId
  formVisible.value = true
  detailVisible.value = false
  formBusy.value = true
  try {
    const detailData = await api.value.getCopyrightApplication(item.applyId)
    const source = detailData || item
    form.workId = String(source.workId || '')
    form.workName = source.workName || ('作品#' + source.workId)
    form.workType = source.workType || 'script'
    form.copyrightCenter = source.copyrightCenter || ''
    form.completeTime = String(source.workCompletionDate || '').slice(0, 10)
    form.materials = [
      ...copyrightMaterialItems(source.originalityProof),
      ...copyrightMaterialItems(source.authorIdentityDoc),
      ...copyrightMaterialItems(source.creationProcess),
      ...copyrightMaterialItems(source.otherProof)
    ]
    form.remark = ''
    await checkRealName()
  } catch (failure) {
    formError.value = failure.message
    await handleError(failure)
  } finally {
    formBusy.value = false
  }
}

async function openDetail(applyId) {
  if (!applyId) return
  detailVisible.value = true
  detailPending.value = true
  detailError.value = ''
  detail.value = null
  try {
    const result = await api.value.getCopyrightApplication(applyId)
    if (!result) throw new Error('申请记录不存在或无权限访问')
    detail.value = result
  } catch (failure) {
    detailError.value = failure.message
    await handleError(failure)
  } finally {
    detailPending.value = false
  }
}

async function closeForm(done) {
  if (formBusy.value) return
  if (formDirty.value) {
    try { await ElMessageBox.confirm('还有未提交的内容，确定关闭？', '未保存的内容', { confirmButtonText: '关闭', cancelButtonText: '继续编辑' }) }
    catch { return }
  }
  resetForm()
  done()
}

async function onMaterials(fileList) {
  if (!fileList?.length || formBusy.value) return
  const files = [...fileList]
  const remain = 20 - form.materials.length
  if (remain <= 0) { formError.value = '最多上传 20 个文件'; return }
  const slice = files.slice(0, remain)
  for (const file of slice) {
    const issue = validateFile(file, ['png', 'jpg', 'jpeg', 'pdf', 'doc', 'docx', 'txt'], 10)
    if (issue) { formError.value = issue; return }
  }
  formBusy.value = true
  uploadingMaterial.value = true
  formError.value = ''
  try {
    for (const file of slice) {
      const result = await api.value.upload(file, 'copyright')
      if (!result?.url) throw new Error('材料上传失败，请重试')
      form.materials.push({
        url: result.url,
        name: result.fileName || file.name || sealFileName(result.url) || `材料 ${form.materials.length + 1}`,
        fileType: guessFileType(file.name || result.url)
      })
    }
    formDirty.value = true
  } catch (failure) {
    formError.value = failure.message
    await handleError(failure)
  } finally {
    uploadingMaterial.value = false
    formBusy.value = false
  }
}

async function submitForm() {
  if (formBusy.value) return
  formError.value = ''
  if (!form.workType) { formError.value = '请选择作品类型'; return }
  if (!form.completeTime) { formError.value = '请选择作品完成时间'; return }
  if (!form.materials.length) { formError.value = '请至少上传一份申请材料'; return }
  if (!resubmitId.value) {
    if (!form.workId) { formError.value = '请选择作品'; return }
    if (!form.copyrightCenter) { formError.value = '请选择版权中心'; return }
  }

  const materialsJson = materialsToJson(form.materials)
  formBusy.value = true
  try {
    if (resubmitId.value) {
      await api.value.resubmitCopyrightApplication({
        originalApplyId: Number(resubmitId.value),
        workType: form.workType,
        completeTime: form.completeTime,
        fileUrl: materialsJson,
        originalityProofUrls: materialsJson,
        remark: form.remark.trim() || '重新提交申请'
      })
      ElMessage.success('重新提交成功')
    } else {
      await api.value.submitCopyrightApplication({
        workId: Number(form.workId),
        workType: form.workType,
        completeTime: form.completeTime,
        copyrightCenter: form.copyrightCenter,
        originalityProofUrls: materialsJson,
        remark: form.remark.trim() || undefined
      })
      ElMessage.success('申请提交成功')
    }
    formDirty.value = false
    formVisible.value = false
    resetForm()
    await load()
  } catch (failure) {
    formError.value = failure.message
    await handleError(failure)
  } finally {
    formBusy.value = false
  }
}

async function doDelete() {
  if (!detail.value || busy.value) return
  try {
    await ElMessageBox.confirm('删除后不可恢复，确定删除该申请？', '删除申请', { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' })
  } catch { return }
  busy.value = true
  try {
    await api.value.deleteCopyrightApplication(detail.value.applyId)
    ElMessage.success('申请已删除')
    detailVisible.value = false
    detail.value = null
    await load()
  } catch (failure) {
    await handleError(failure)
  } finally {
    busy.value = false
  }
}

async function openPreview(url, title) {
  if (!url) return
  previewRaw.value = url
  previewTitle.value = title || '材料预览'
  previewText.value = ''
  previewError.value = ''
  previewLoading.value = true
  previewVisible.value = true
  const kind = materialKind(url)
  if (kind === 'text') {
    try {
      const response = await fetch(mediaUrl(url))
      if (!response.ok) throw new Error('文本加载失败（' + response.status + '）')
      const contentType = response.headers.get('content-type') || ''
      const buffer = await response.arrayBuffer()
      if (contentType.includes('application/json')) {
        const jsonText = new TextDecoder('utf-8').decode(buffer)
        if (jsonText.includes('"code"')) throw new Error('材料地址无效或无权限，请重新上传后重试')
      }
      previewText.value = decodeTextBuffer(buffer)
      previewError.value = ''
    } catch (failure) {
      previewError.value = failure.message || '文本加载失败'
    } finally {
      previewLoading.value = false
    }
    return
  }
  if (kind === 'image' || kind === 'pdf') return
  previewLoading.value = false
}

function retryPreview() {
  openPreview(previewRaw.value, previewTitle.value)
}

async function downloadMaterial(url, name) {
  if (!url) return
  try {
    const response = await fetch(mediaUrl(url))
    if (!response.ok) throw new Error('下载失败（' + response.status + '）')
    const contentType = response.headers.get('content-type') || ''
    const buffer = await response.arrayBuffer()
    if (contentType.includes('application/json') || (buffer.byteLength < 200 && new TextDecoder('utf-8').decode(buffer).includes('"code"'))) {
      throw new Error('文件无法下载，请稍后重试')
    }
    const blob = new Blob([buffer], { type: contentType || 'application/octet-stream' })
    const objectUrl = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = objectUrl
    link.download = name || sealFileName(url) || 'material'
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(objectUrl)
    ElMessage.success('已开始下载')
  } catch (failure) {
    ElMessage.error(failure.message || '下载失败')
  }
}

onMounted(load)
</script>

<style scoped>
.apply-panel .sub-head {
  display: flex; align-items: center; gap: 10px;
  padding-bottom: 8px; margin-bottom: 12px; border-bottom: 1px solid var(--rule, #eee);
}
.apply-panel .sub-head h3 { margin: 0; flex: 1; font-size: 15px }
.apply-panel .sub-head .count { color: var(--ink-3, #999); font-size: 12.5px }
.apply-panel .sub-head.sub { margin-top: 18px; border-bottom: 0; padding-bottom: 0 }

.apply-panel .toolbar {
  display: flex; align-items: center; flex-wrap: wrap; gap: 8px;
  margin-bottom: 14px;
}
.apply-panel .toolbar-control {
  box-sizing: border-box; height: 32px; margin: 0; padding: 0 10px;
  font: inherit; font-size: 13px; line-height: 30px;
  color: var(--ink, #333); background: var(--paper-2, #fff);
  border: 1px solid var(--rule-2, #d9d9d9); border-radius: var(--radius, 4px);
  vertical-align: middle;
}
.apply-panel .toolbar-control:focus {
  outline: none; border-color: var(--indigo, #3d5a56);
  box-shadow: 0 0 0 3px var(--indigo-wash, rgba(61, 90, 86, 0.12));
}
.apply-panel .toolbar-control:disabled { opacity: 0.6; cursor: not-allowed }
.apply-panel select.toolbar-control { width: 128px; appearance: auto }
.apply-panel input.toolbar-control.search { width: 200px; flex: 1; min-width: 140px; max-width: 260px }
.apply-panel .toolbar-btn {
  box-sizing: border-box; height: 32px; padding: 0 12px !important;
  display: inline-flex; align-items: center; justify-content: center;
}

.apply-panel .tbl table { width: 100%; border-collapse: collapse }
.apply-panel .tbl th, .apply-panel .tbl td { padding: 12px 10px; border-bottom: 1px solid var(--rule, #eee); text-align: left; vertical-align: top }
.apply-panel .tbl th { font-size: 12px; color: var(--ink-3, #999); font-weight: 500 }
.apply-panel .tbl .num { font-variant-numeric: tabular-nums; color: var(--ink-2, #666); font-size: 13px }
.apply-panel .tbl .ops { white-space: nowrap }
.apply-panel .tbl .ops .btn + .btn { margin-left: 6px }
.reject-tip { margin: 4px 0 0; color: #f56c6c }

.status-tag { display: inline-block; padding: 1px 8px; border-radius: 10px; font-size: 12px; font-weight: 500 }
.tone-wait { background: #fdf6ec; color: #e6a23c }
.tone-ok { background: #f0f9eb; color: #67c23a }
.tone-bad { background: #fef0f0; color: #f56c6c }
.tone-off { background: #f4f4f5; color: #909399 }

.apply-form { display: grid; gap: 18px; width: 100%; max-width: 640px; margin: 0 auto }
.apply-form .field { display: flex; flex-direction: column; gap: 8px; margin: 0 }
.apply-form .field-label { font-size: 13px; color: var(--ink-2, #666) }
.apply-form .field > input:not([type='file']),
.apply-form .field > select,
.apply-form .field > textarea { display: block; width: 100%; box-sizing: border-box }
.type-chips { display: flex; flex-wrap: wrap; gap: 8px }
.type-chips .chip { border: 1px solid var(--rule-2, #d9d9d9); background: #fff; border-radius: 16px; padding: 4px 14px; cursor: pointer; font-size: 13px }
.type-chips .chip.on { border-color: var(--bamboo, #67c23a); background: var(--bamboo-w, #f0f9eb); color: #2c4a36 }
.apply-drop {
  display: block; width: 100%; box-sizing: border-box; min-height: 72px; padding: 18px 16px;
  text-align: center; background: var(--paper, #fafafa); border: 1px dashed var(--rule-2, #d9d9d9);
  border-radius: 8px; color: var(--ink-2, #666); line-height: 1.5;
}

.material-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px }
.material-list li { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 8px 10px; background: #fafafa; border-radius: 8px }
.material-name { color: var(--ink, #333); max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: left }
.material-actions { display: flex; gap: 12px; align-items: center }

.detail-hero { margin-bottom: 12px }
.detail-hero h3 { margin: 0 0 8px }
.detail-rows { margin-top: 8px }
.action-bar { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px }

.preview-body { min-height: 240px }
.preview-frame { display: grid; place-items: center; min-height: 360px; background: #f7f7f7; border-radius: 8px; padding: 12px }
.preview-frame img { max-width: 100%; max-height: 70vh; object-fit: contain }
.preview-frame.pdf { width: 100%; height: 70vh; border: 0; background: #fff; padding: 0 }
.preview-text { max-height: 70vh; overflow: auto; padding: 16px; background: #fafafa; border-radius: 8px; white-space: pre-wrap; word-break: break-word }
.preview-fallback { display: grid; gap: 12px; justify-items: start; padding: 24px 8px }
</style>
