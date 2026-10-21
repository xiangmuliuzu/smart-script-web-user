<template>
  <div class="seal-panel">
    <div class="sub-head">
      <h3>我的印章</h3>
      <span class="count">{{ seals.length }} 枚</span>
      <button class="btn sm" :disabled="busy" @click="openCreate">上传印章</button>
    </div>

    <LoadState :pending="pending" :error="loadError" :retry="load" :empty="!pending && !loadError && !seals.length" empty-text="您还没有上传印章">
      <button class="btn sm" :disabled="busy" @click="openCreate">立即上传</button>
    </LoadState>

    <ul v-if="!pending && !loadError && seals.length" class="seal-list">
      <li v-for="item in seals" :key="item.sealId" class="seal-card" @click="openDetail(item.sealId)">
        <div class="seal-thumb">
          <img v-if="item.sealImageUrl" :src="srcOf(item.sealImageUrl)" alt="印章预览" @error="onImgError($event, item.sealImageUrl)" />
          <span v-else class="glyph">印</span>
        </div>
        <div class="seal-body">
          <div class="seal-top">
            <b>{{ item.sealName || '未命名印章' }}</b>
            <span class="status-tag" :class="'tone-' + reviewTone(item.reviewStatus)">{{ reviewStatusLabel(item.reviewStatus) }}</span>
          </div>
          <p class="cost">印章状态：{{ sealStatusLabel(item.sealStatus) }} · 申请于 {{ dateText(item.createTime) }}</p>
          <p v-if="item.reviewStatus === 'rejected' && item.rejectReason" class="note bad seal-reject">{{ item.rejectReason }}</p>
        </div>
        <button class="btn quiet sm" type="button" @click.stop="openDetail(item.sealId)">查看</button>
      </li>
    </ul>

    <PortalLayer v-model="formVisible" :title="editingId ? '编辑印章' : '上传印章'" modal big :before-close="closeForm">
      <form class="seal-form" @submit.prevent="submitForm">
        <div class="field">
          <span class="field-label">印章名称</span>
          <input v-model="form.sealName" maxlength="50" placeholder="例如：个人印章" required :disabled="formBusy" @input="formDirty = true" />
        </div>
        <div class="field">
          <span class="field-label">印章图片（必填）</span>
          <label class="drop upload-control seal-drop" :class="{ done: !!form.sealImageUrl || !!localSealPreview }">
            <input type="file" accept="image/png,image/jpeg" :disabled="formBusy" @change="onSealImage($event.target.files[0]); $event.target.value = ''" />
            <span>{{ form.sealImageUrl || localSealPreview ? '已选择印章图片，点击可更换' : '点击上传印章图片（PNG / JPG，≤ 5 MB）' }}</span>
          </label>
          <img v-if="formSealPreview" class="seal-preview" :src="formSealPreview" alt="印章预览" @error="onImgError($event, form.sealImageUrl)" />
        </div>
        <div class="field">
          <span class="field-label">审核材料（选填）</span>
          <label class="drop upload-control seal-drop">
            <input type="file" accept="image/png,image/jpeg,.pdf,.doc,.docx,.txt" multiple :disabled="formBusy" @change="onMaterials($event.target.files); $event.target.value = ''" />
            <span>{{ formBusy && uploadingMaterial ? '正在上传材料…' : '可上传身份/授权相关材料（图片或文档）' }}</span>
          </label>
          <ul v-if="form.materials.length" class="material-list">
            <li v-for="(item, index) in form.materials" :key="item.url + index">
              <button type="button" class="text-button material-name" :title="item.name" @click="openPreview(item.url, item.name)">{{ item.name }}</button>
              <button type="button" class="btn quiet sm" :disabled="formBusy" @click="form.materials.splice(index, 1); formDirty = true">移除</button>
            </li>
          </ul>
        </div>
        <p class="cost">提交后由平台审核；编辑已通过的印章会重新进入审核。启用中的印章需先停用再编辑。</p>
        <p v-if="formError" class="note bad" role="alert">{{ formError }}</p>
        <button class="btn" :disabled="formBusy">{{ formBusy ? '提交中…' : (editingId ? '保存并重新提交审核' : '提交审核') }}</button>
      </form>
    </PortalLayer>

    <PortalLayer v-model="detailVisible" title="印章详情" modal big>
      <LoadState :pending="detailPending" :error="detailError" :retry="() => openDetail(detail?.sealId)" />
      <template v-if="detail && !detailPending && !detailError">
        <div class="seal-detail-hero">
          <button v-if="detail.sealImageUrl" type="button" class="seal-detail-image" @click="openPreview(detail.sealImageUrl, detail.sealName || '印章图片')">
            <img :src="srcOf(detail.sealImageUrl)" alt="印章" @error="onImgError($event, detail.sealImageUrl)" />
          </button>
          <div v-else class="seal-detail-image empty"><span class="glyph">印</span></div>
          <div>
            <h3>{{ detail.sealName || '未命名印章' }}</h3>
            <p>
              <span class="status-tag" :class="'tone-' + reviewTone(detail.reviewStatus)">{{ reviewStatusLabel(detail.reviewStatus) }}</span>
              <span class="status-tag" :class="'tone-' + sealTone(detail.sealStatus)">{{ sealStatusLabel(detail.sealStatus) }}</span>
            </p>
            <p class="cost">申请编号 #{{ detail.sealId }} · {{ dateText(detail.createTime) }}</p>
            <p v-if="detail.reviewTime" class="cost">审核时间 {{ dateText(detail.reviewTime) }}</p>
          </div>
        </div>
        <div v-if="detail.reviewStatus === 'rejected' && detail.rejectReason" class="note bad">驳回原因：{{ detail.rejectReason }}</div>
        <div class="sub-head sub"><h3>审核材料</h3></div>
        <ul v-if="detailMaterials.length" class="material-list">
          <li v-for="(item, index) in detailMaterials" :key="item.url + index">
            <span class="material-name" :title="item.name">{{ item.name }}</span>
            <div class="material-actions">
              <button type="button" class="text-button" @click="openPreview(item.url, item.name)">在线预览</button>
              <button type="button" class="text-button" @click="downloadMaterial(item.url, item.name)">下载</button>
            </div>
          </li>
        </ul>
        <p v-else class="cost">暂无审核材料</p>
        <div class="sub-head sub"><h3>操作记录</h3></div>
        <ul v-if="detail.logs?.length" class="rows">
          <li v-for="log in detail.logs" :key="log.logId">
            <span class="k">{{ operationTypeLabel(log.operationType) }}</span>
            <span class="v muted">{{ log.operatorName || '系统' }} · {{ dateText(log.createTime) }}{{ log.reason ? ' · ' + log.reason : '' }}</span>
          </li>
        </ul>
        <p v-else class="cost">暂无操作记录</p>
        <div class="action-bar">
          <button class="btn sm" :disabled="busy" @click="startEdit">编辑印章</button>
          <button v-if="canDisable(detail)" class="btn sm ghost" :disabled="busy" @click="doDisable">停用</button>
          <button class="btn sm ghost" :disabled="busy" @click="doDelete">删除</button>
        </div>
      </template>
    </PortalLayer>

    <!-- 在线预览：对齐 Admin MaterialPreviewDialog（图 / PDF / 文本 / 下载） -->
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
          <p class="cost">{{ previewKind === 'office' ? 'Word / Excel 等 Office 文档暂不支持在线预览，请下载后用本地软件打开。' : '该文件格式暂不支持在线预览，请下载后查看。' }}</p>
          <button class="btn sm" type="button" @click="downloadMaterial(previewRaw, previewTitle)">下载文件</button>
        </div>
      </div>
    </PortalLayer>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import PortalLayer from '../../../components/PortalLayer.vue'
import LoadState from '../../../components/LoadState.vue'
import { usePortal } from '../../../utils/portal.js'
import { dateText, validateFile } from '../../../utils/creator.js'
import { mediaUrl, decodeTextBuffer } from '../../../utils/avatarUrl.js'
import {
  reviewStatusLabel, sealStatusLabel, operationTypeLabel, reviewTone, sealTone,
  canDisable, needsDisableBeforeEdit, materialItems, joinMaterialUrls, materialKind, fileNameFromUrl
} from '../../../utils/seal.js'

const { api, handleError } = usePortal()
const seals = ref([])
const pending = ref(false)
const loadError = ref('')
const busy = ref(false)

const formVisible = ref(false)
const editingId = ref(null)
const form = reactive({ sealName: '', sealImageUrl: '', materials: [] })
const formError = ref('')
const formBusy = ref(false)
const uploadingMaterial = ref(false)
const formDirty = ref(false)
const localSealPreview = ref('')

const detailVisible = ref(false)
const detail = ref(null)
const detailPending = ref(false)
const detailError = ref('')
const detailMaterials = computed(() => materialItems(detail.value?.materialUrls))

const previewVisible = ref(false)
const previewTitle = ref('材料预览')
const previewRaw = ref('')
const previewText = ref('')
const previewLoading = ref(false)
const previewError = ref('')
const previewSrc = computed(() => mediaUrl(previewRaw.value))
const previewKind = computed(() => materialKind(previewRaw.value))
const formSealPreview = computed(() => localSealPreview.value || (form.sealImageUrl ? mediaUrl(form.sealImageUrl) : ''))

/** 列表/详情展示地址（与 Admin safeUrl 同口径） */
function srcOf(raw) {
  return mediaUrl(raw)
}

/** 图片加载失败时回退：/dev-api/profile → /profile（依赖 vite /profile 代理） */
function onImgError(event, raw) {
  const img = event?.target
  if (!img || img.dataset.fallback === '1') return
  const primary = mediaUrl(raw)
  const mediaIndex = String(raw || '').indexOf('/profile/')
  const bare = mediaIndex >= 0 ? String(raw).slice(mediaIndex) : (String(raw || '').startsWith('/profile/') ? String(raw) : '')
  if (!bare || bare === primary || img.src.endsWith(bare)) return
  img.dataset.fallback = '1'
  img.src = bare
}

function clearLocalPreview() {
  if (localSealPreview.value) {
    URL.revokeObjectURL(localSealPreview.value)
    localSealPreview.value = ''
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
      // 后端失败时偶发 HTTP 200 + JSON 401 体
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
  if (kind === 'image' || kind === 'pdf') {
    // 由 img/iframe load / error 收敛 loading
    return
  }
  previewLoading.value = false
}

function retryPreview() {
  openPreview(previewRaw.value, previewTitle.value)
}

/** 通过 blob 下载，避免中文文件名直链 401，并校验响应不是错误 JSON。 */
async function downloadMaterial(url, name) {
  if (!url) return
  try {
    const response = await fetch(mediaUrl(url))
    if (!response.ok) throw new Error('下载失败（' + response.status + '）')
    const contentType = response.headers.get('content-type') || ''
    const buffer = await response.arrayBuffer()
    if (contentType.includes('application/json') || (buffer.byteLength < 200 && new TextDecoder('utf-8').decode(buffer).includes('"code"'))) {
      throw new Error('文件无法下载，请确认后端已重启并支持中文文件名')
    }
    const blob = new Blob([buffer], { type: contentType || 'application/octet-stream' })
    const objectUrl = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = objectUrl
    link.download = name || fileNameFromUrl(url) || 'material'
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(objectUrl)
    ElMessage.success('已开始下载')
  } catch (failure) {
    ElMessage.error(failure.message || '下载失败')
  }
}

async function load() {
  pending.value = true
  loadError.value = ''
  try { seals.value = await api.value.listSeals() }
  catch (failure) { loadError.value = failure.message; await handleError(failure) }
  finally { pending.value = false }
}

function resetForm() {
  editingId.value = null
  form.sealName = ''
  form.sealImageUrl = ''
  form.materials = []
  formError.value = ''
  formDirty.value = false
  clearLocalPreview()
}

function openCreate() {
  resetForm()
  formVisible.value = true
}

async function openDetail(sealId) {
  if (!sealId) return
  detailVisible.value = true
  detailPending.value = true
  detailError.value = ''
  detail.value = null
  try {
    const result = await api.value.getSeal(sealId)
    if (!result) throw new Error('印章不存在或无权限访问')
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

async function onSealImage(file) {
  if (!file || formBusy.value) return
  formError.value = validateFile(file, ['png', 'jpg', 'jpeg'], 5)
  if (formError.value) return
  clearLocalPreview()
  localSealPreview.value = URL.createObjectURL(file)
  formBusy.value = true
  try {
    const result = await api.value.upload(file, 'seal')
    if (!result?.url) throw new Error('印章图片上传失败，请重试')
    form.sealImageUrl = result.url
    formDirty.value = true
  } catch (failure) {
    formError.value = failure.message
    clearLocalPreview()
    await handleError(failure)
  } finally {
    formBusy.value = false
  }
}

async function onMaterials(fileList) {
  if (!fileList?.length || formBusy.value) return
  const files = [...fileList]
  for (const file of files) {
    const issue = validateFile(file, ['png', 'jpg', 'jpeg', 'pdf', 'doc', 'docx', 'txt'], 10)
    if (issue) { formError.value = issue; return }
  }
  formBusy.value = true
  uploadingMaterial.value = true
  formError.value = ''
  try {
    for (const file of files) {
      const result = await api.value.upload(file, 'seal')
      if (!result?.url) throw new Error('材料上传失败，请重试')
      form.materials.push({
        url: result.url,
        name: result.fileName || file.name || fileNameFromUrl(result.url) || `材料 ${form.materials.length + 1}`
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
  if (!form.sealName.trim()) { formError.value = '请填写印章名称'; return }
  if (!form.sealImageUrl) { formError.value = '请上传印章图片'; return }
  formBusy.value = true
  try {
    const payload = {
      sealName: form.sealName.trim(),
      sealImageUrl: form.sealImageUrl,
      materialUrls: joinMaterialUrls(form.materials)
    }
    if (editingId.value) await api.value.updateSeal(editingId.value, payload)
    else await api.value.createSeal(payload)
    ElMessage.success(editingId.value ? '已保存，请等待重新审核' : '提交成功，请等待审核')
    formDirty.value = false
    formVisible.value = false
    resetForm()
    await load()
    if (detailVisible.value && detail.value?.sealId) await openDetail(detail.value.sealId)
  } catch (failure) {
    formError.value = failure.message
    await handleError(failure)
  } finally {
    formBusy.value = false
  }
}

async function startEdit() {
  if (!detail.value || busy.value) return
  if (needsDisableBeforeEdit(detail.value)) {
    try {
      await ElMessageBox.confirm('启用中的印章需先停用才能编辑，是否现在停用并继续编辑？', '编辑印章', { confirmButtonText: '停用并编辑', cancelButtonText: '取消', type: 'warning' })
    } catch { return }
    const ok = await runDisable()
    if (!ok || detail.value?.sealStatus === 'enabled') return
  }
  clearLocalPreview()
  editingId.value = detail.value.sealId
  form.sealName = detail.value.sealName || ''
  form.sealImageUrl = detail.value.sealImageUrl || ''
  form.materials = materialItems(detail.value.materialUrls)
  formError.value = ''
  formDirty.value = false
  formVisible.value = true
}

async function runDisable() {
  if (!detail.value) return false
  busy.value = true
  try {
    await api.value.disableSeal(detail.value.sealId)
    ElMessage.success('印章已停用')
    await load()
    detail.value = await api.value.getSeal(detail.value.sealId)
    return true
  } catch (failure) {
    await handleError(failure)
    return false
  } finally {
    busy.value = false
  }
}

async function doDisable() {
  if (!detail.value || busy.value) return
  try {
    await ElMessageBox.confirm('停用后该印章将无法用于签署，确定停用？', '停用印章', { confirmButtonText: '停用', cancelButtonText: '取消', type: 'warning' })
  } catch { return }
  await runDisable()
}

async function doDelete() {
  if (!detail.value || busy.value) return
  try {
    await ElMessageBox.confirm('删除后不可恢复，确定删除该印章？', '删除印章', { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' })
  } catch { return }
  busy.value = true
  try {
    await api.value.deleteSeal(detail.value.sealId)
    ElMessage.success('印章已删除')
    detailVisible.value = false
    detail.value = null
    await load()
  } catch (failure) {
    await handleError(failure)
  } finally {
    busy.value = false
  }
}

onMounted(load)
onUnmounted(clearLocalPreview)
</script>

<style scoped>
.seal-panel .sub-head { display: flex; align-items: center; gap: 10px; margin-bottom: 12px }
.seal-panel .sub-head h3 { margin: 0; flex: 1 }
.seal-panel .sub-head.sub { margin-top: 18px }
.seal-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px }
.seal-card { display: grid; grid-template-columns: 72px 1fr auto; gap: 12px; align-items: center; padding: 12px; border: 1px solid var(--line, #e8e8e8); border-radius: 10px; background: #fff; cursor: pointer }
.seal-thumb { width: 72px; height: 72px; border-radius: 8px; overflow: hidden; background: #f5f5f5; display: grid; place-items: center }
.seal-thumb img { width: 100%; height: 100%; object-fit: contain }
.seal-thumb .glyph, .seal-detail-image .glyph { color: #999; font-size: 22px }
.seal-body { min-width: 0 }
.seal-top { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 4px }
.seal-top b { font-size: 15px }
.seal-reject { margin: 8px 0 0 }
.status-tag { display: inline-block; padding: 1px 8px; border-radius: 10px; font-size: 12px; font-weight: 500 }
.tone-wait { background: #fdf6ec; color: #e6a23c }
.tone-ok { background: #f0f9eb; color: #67c23a }
.tone-bad { background: #fef0f0; color: #f56c6c }
.tone-off { background: #f4f4f5; color: #909399 }

.seal-form { display: grid; gap: 18px; max-width: 640px }
.seal-form .field { display: flex; flex-direction: column; gap: 8px; margin: 0 }
.seal-form .field-label { font-size: 13px; color: var(--ink-2, #666) }
.seal-form .field > input:not([type='file']) {
  display: block; width: 100%; box-sizing: border-box; margin: 0;
}
.seal-drop {
  display: block;
  width: 100%;
  box-sizing: border-box;
  min-height: 88px;
  padding: 22px 16px;
  text-align: center;
  background: var(--paper, #fafafa);
  border: 1px dashed var(--rule-2, #d9d9d9);
  border-radius: 8px;
  color: var(--ink-2, #666);
  line-height: 1.5;
}
.seal-drop.done { border-style: solid; border-color: var(--bamboo, #67c23a); background: var(--bamboo-w, #f0f9eb); color: #2c4a36 }
.seal-preview { width: 140px; height: 140px; object-fit: contain; border: 1px solid var(--line, #e8e8e8); border-radius: 8px; background: #fafafa }

.material-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px }
.material-list li { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 8px 10px; background: #fafafa; border-radius: 8px }
.material-name { color: var(--ink, #333); max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: left }
.material-actions { display: flex; gap: 12px; align-items: center }

.seal-detail-hero { display: grid; grid-template-columns: 140px 1fr; gap: 16px; align-items: center; margin-bottom: 12px }
.seal-detail-image { width: 140px; height: 140px; padding: 0; border: 1px solid var(--line, #e8e8e8); border-radius: 8px; background: #fafafa; overflow: hidden; cursor: zoom-in }
.seal-detail-image.empty { display: grid; place-items: center; cursor: default }
.seal-detail-image img { width: 100%; height: 100%; object-fit: contain; display: block }
.seal-detail-hero h3 { margin: 0 0 8px }
.seal-detail-hero .status-tag { margin-right: 6px }
.action-bar { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px }

.preview-body { min-height: 240px }
.preview-frame { display: grid; place-items: center; min-height: 360px; background: #f7f7f7; border-radius: 8px; padding: 12px }
.preview-frame img { max-width: 100%; max-height: 70vh; object-fit: contain }
.preview-frame.pdf { width: 100%; height: 70vh; border: 0; background: #fff; padding: 0 }
.preview-text { max-height: 70vh; overflow: auto; padding: 16px; background: #fafafa; border-radius: 8px; white-space: pre-wrap; word-break: break-word }
.preview-fallback { display: grid; gap: 12px; justify-items: start; padding: 24px 8px }
</style>
