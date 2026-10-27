<template>
  <div class="contract-panel">
    <div class="filter-bar">
      <select v-model="role" class="filter-select" @change="reload"><option value="">我的全部</option><option value="seller">我卖出的</option><option value="buyer">我买入的</option></select>
      <select v-model="status" class="filter-select" @change="reload"><option value="">全部状态</option><option value="pending">待签署</option><option value="partial_signed">部分签署</option><option value="completed">已完成</option></select>
      <input v-model="keyword" class="filter-input" placeholder="搜索合同号/订单号/作品/对方" @keyup.enter="reload">
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
            <button v-if="c.sourceType !== 'uploaded'" class="btn sm ghost" @click="onEditClick(c)">编辑内容</button>
            <button v-if="isEditable(c)" class="btn sm ghost" :disabled="uploading" @click="onUploadClick(c)">{{ c.sourceType === 'uploaded' ? '重新上传' : '上传合同' }}</button>
            <button v-if="c.sourceType === 'uploaded' && isEditable(c)" class="btn sm ghost" :disabled="uploading" @click="onSwitchClick(c)">切回模板</button>
            <button v-if="canSign(c)" class="btn sm" @click="openSign(c)">签署合同</button>
            <a v-if="(c.status === 'completed' || c.status === 'archived') && c.signedPdfUrl" class="btn sm ghost" :href="mediaUrl(c.signedPdfUrl)" target="_blank" rel="noopener">下载 PDF</a>
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
        <div v-if="previewSource === 'uploaded' && previewPages.length" class="preview-pages">
          <img v-for="(p, i) in previewPages" :key="i" class="preview-page" :src="mediaUrl(p)" alt="" />
        </div>
        <iframe v-else-if="previewContent" class="contract-frame" :srcdoc="previewContent" sandbox="allow-same-origin"></iframe>
        <div v-else class="load-state"><p>{{ previewLoading ? '合同加载中…' : '合同内容不可用' }}</p></div>
      </div>
    </PortalLayer>

    <ContractSignDialog v-model="signVisible" :contract="signingContract" :user-id="userId" @signed="onSigned" />

    <PortalLayer v-model="switchVisible" title="切回平台模板" modal>
      <div class="edit-wrap">
        <p class="cost">当前为上传的合同 PDF，切回后改为平台模板（可在线编辑条款、系统自动落章），上传件与已拖拽定位将被清除；仅在双方均未签署时可用。</p>
        <div class="edit-row">
          <label class="edit-label">选择平台模板</label>
          <select v-model="switchTemplateId" class="filter-select">
            <option v-for="t in switchTemplates" :key="t.templateId" :value="t.templateId">{{ t.name }}</option>
          </select>
        </div>
        <div class="edit-actions">
          <button class="btn ghost sm" type="button" :disabled="switchSaving" @click="switchVisible = false">取消</button>
          <button class="btn sm" type="button" :disabled="switchSaving || !switchTemplateId" @click="doSwitch">{{ switchSaving ? '切换中…' : '确认切回模板' }}</button>
        </div>
      </div>
    </PortalLayer>

    <input ref="uploadInputRef" type="file" accept="application/pdf,.pdf" class="hidden-file" @change="onFilePicked" />

    <PortalLayer v-model="editVisible" title="编辑合同内容" modal big>
      <div v-loading="editLoading" class="edit-wrap">
        <div class="edit-row">
          <label class="edit-label">平台模板</label>
          <select v-model="editForm.templateId" class="filter-select" @change="onTemplateChange">
            <option v-for="t in editTemplates" :key="t.templateId" :value="t.templateId">{{ t.name }}</option>
          </select>
        </div>
        <div class="edit-row">
          <label class="edit-label">正文条款（第一条~第六条，可自由修改；切换模板将填充该模板默认条款）</label>
          <textarea v-model="editForm.clausesText" class="edit-textarea" spellcheck="false" placeholder="请输入合同正文条款"></textarea>
        </div>
        <p class="cost edit-note">订单号、双方、金额、许可类型与签名区由平台固定生成，不可编辑；任一方签署后内容锁定。</p>
        <div class="edit-actions">
          <button class="btn ghost sm" type="button" :disabled="editSaving" @click="editVisible = false">取消</button>
          <button class="btn sm" type="button" :disabled="editLoading || editSaving" @click="saveEdit">{{ editSaving ? '保存中…' : '保存' }}</button>
        </div>
      </div>
    </PortalLayer>
  </div>
</template>

<script setup>
import { onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
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
const keyword = ref('')
const pageNum = ref(1)
const total = ref(0)

const previewVisible = ref(false)
const previewLoading = ref(false)
const previewContent = ref('')
const previewTitle = ref('合同预览')
const signVisible = ref(false)
const signingContract = ref(null)

const previewSource = ref('template')
const previewPages = ref([])
const uploadInputRef = ref(null)
const uploadTargetId = ref(0)
const uploading = ref(false)
const switchVisible = ref(false)
const switchContract = ref(null)
const switchTemplates = ref([])
const switchTemplateId = ref('')
const switchSaving = ref(false)

const editVisible = ref(false)
const editLoading = ref(false)
const editSaving = ref(false)
const editTemplates = ref([])
const editForm = ref({ contractId: 0, templateId: '', clausesText: '' })

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

/** 我可签署：仅 pending/partial_signed 且我这一侧未签（completed/archived/cancelled 均不可，问题6）。 */
function canSign(c) {
  if (!c || !['pending', 'partial_signed'].includes(c.status)) return false
  return isBuyerOf(c) ? !isSigned(c.buyerSignStatus) : !isSigned(c.sellerSignStatus)
}

async function load() {
  pending.value = true; error.value = ''
  try {
    const result = await api.value.listContracts({ role: role.value, status: status.value, keyword: keyword.value.trim(), pageNum: pageNum.value, pageSize: PAGE_SIZE })
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

// 关键词防抖：停顿 300ms 自动回到第 1 页重查，与询盘搜索范式一致
let keywordTimer = null
watch(keyword, () => { clearTimeout(keywordTimer); keywordTimer = setTimeout(reload, 300) })

async function openPreview(c) {
  previewTitle.value = `合同预览 · ${c.contractNo || '#' + c.contractId}`
  previewContent.value = ''
  previewSource.value = 'template'
  previewPages.value = []
  previewVisible.value = true
  previewLoading.value = true
  try {
    const detail = await api.value.getContractByOrder(c.orderId)
    previewSource.value = detail?.sourceType || 'template'
    previewPages.value = Array.isArray(detail?.pageImageUrls) ? detail.pageImageUrls : []
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

/** 我可编辑：待签署且双方均未签。 */
function isEditable(c) {
  return !!c && c.status === 'pending' && !isSigned(c.buyerSignStatus) && !isSigned(c.sellerSignStatus)
}

async function onEditClick(c) {
  if (!isEditable(c)) {
    ElMessage.warning('合同已进入签署，内容已锁定，不可修改')
    return
  }
  await openEdit(c)
}

function defaultForTemplate(tid) {
  const t = editTemplates.value.find(x => x.templateId === tid)
  return t ? (t.defaultClausesText || '') : ''
}

async function openEdit(c) {
  editForm.value = { contractId: c.contractId, templateId: '', clausesText: '' }
  editTemplates.value = []
  editVisible.value = true
  editLoading.value = true
  try {
    const detail = await api.value.getContractByOrder(c.orderId)
    const cid = detail?.contractId || c.contractId
    const templates = await api.value.listContractTemplates(cid)
    editTemplates.value = templates
    editForm.value.templateId = detail?.templateId || templates[0]?.templateId || ''
    editForm.value.clausesText = detail?.clausesText || defaultForTemplate(editForm.value.templateId)
  } catch (e) {
    await handleError(e)
    editVisible.value = false
  } finally {
    editLoading.value = false
  }
}

function onTemplateChange() {
  editForm.value.clausesText = defaultForTemplate(editForm.value.templateId)
}

/** 上传 PDF 替换模板：仅在未锁定（待签且双方未签）时可用，上传后走拖拽定位签署。 */
function onUploadClick(c) {
  if (!isEditable(c)) {
    ElMessage.warning('合同已进入签署，已锁定，不可修改')
    return
  }
  uploadTargetId.value = c.contractId
  if (uploadInputRef.value) uploadInputRef.value.click()
}

async function onFilePicked(e) {
  const file = e.target.files && e.target.files[0]
  e.target.value = '' // 清空以便重复选择同一文件
  if (!file) return
  if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') {
    ElMessage.warning('请选择 PDF 文件')
    return
  }
  uploading.value = true
  try {
    await api.value.uploadContractSourcePdf(uploadTargetId.value, file)
    ElMessage.success('合同 PDF 已上传，可进入签署拖拽定位')
    await refresh()
  } catch (err) {
    ElMessage.error(err.message || '上传失败')
  } finally {
    uploading.value = false
  }
}

async function onSwitchClick(c) {
  if (!isEditable(c)) {
    ElMessage.warning('合同已进入签署，已锁定，不可修改')
    return
  }
  switchContract.value = c
  switchTemplateId.value = ''
  switchTemplates.value = []
  switchVisible.value = true
  try {
    const t = await api.value.listContractTemplates(c.contractId)
    switchTemplates.value = t
    switchTemplateId.value = c.templateId || (t[0] && t[0].templateId) || ''
  } catch (err) {
    await handleError(err)
  }
}

async function doSwitch() {
  if (switchSaving.value || !switchTemplateId.value) return
  switchSaving.value = true
  try {
    await api.value.switchContractToTemplate(switchContract.value.contractId, switchTemplateId.value)
    ElMessage.success('已切回平台模板')
    switchVisible.value = false
    await refresh()
  } catch (err) {
    ElMessage.error(err.message || '切回模板失败')
  } finally {
    switchSaving.value = false
  }
}

async function saveEdit() {
  if (editSaving.value) return
  const text = (editForm.value.clausesText || '').trim()
  if (!text) { ElMessage.warning('合同正文条款不能为空'); return }
  editSaving.value = true
  try {
    await api.value.updateContractContent(editForm.value.contractId, { templateId: editForm.value.templateId, clausesText: text })
    ElMessage.success('合同内容已保存')
    editVisible.value = false
    await refresh()
  } catch (e) {
    // 后端锁定/非法参数统一以 message 返回
    ElMessage.error(e.message || '保存失败')
  } finally {
    editSaving.value = false
  }
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
.preview-pages { display: flex; flex-direction: column; gap: 8px; max-height: min(68vh, 720px); overflow-y: auto }
.preview-page { width: 100%; display: block; border: 1px solid #ebeef5; border-radius: 4px }
.hidden-file { display: none }
.filter-bar { display: flex; gap: 8px; align-items: center; margin-bottom: 12px; flex-wrap: wrap }
.filter-select { padding: 4px 8px; border: 1px solid #dcdfe6; border-radius: 4px; font-size: 13px; background: #fff }
.filter-input { padding: 4px 8px; border: 1px solid #dcdfe6; border-radius: 4px; font-size: 13px; background: #fff; width: 200px }
.pagination-bar { display: flex; gap: 8px; align-items: center; justify-content: center; padding: 8px 0; margin-top: 4px }
.edit-wrap { display: flex; flex-direction: column; gap: 12px; min-height: 200px }
.edit-row { display: flex; flex-direction: column; gap: 6px }
.edit-label { font-size: 13px; color: #606266 }
.edit-textarea { width: 100%; min-height: 320px; padding: 10px 12px; border: 1px solid #dcdfe6; border-radius: 6px; font-size: 13px; line-height: 1.7; font-family: inherit; resize: vertical; outline: none; box-sizing: border-box }
.edit-textarea:focus { border-color: #409eff; box-shadow: 0 0 0 2px rgba(64, 158, 255, .12) }
.edit-note { font-size: 12px; margin: 0 }
.edit-actions { display: flex; justify-content: flex-end; gap: 8px }
.status-tag { display: inline-block; padding: 1px 8px; border-radius: 10px; font-size: 12px; font-weight: 500 }
.tag-pending { background: #fdf6ec; color: #e6a23c }
.tag-partial_signed { background: #ecf5ff; color: #409eff }
.tag-completed { background: #f0f9eb; color: #67c23a }
</style>
