<template>
  <div class="apply-panel">
    <div class="sub-head">
      <h3>我的申请</h3>
      <span class="count">{{ total }} 条</span>
      <button class="btn sm" :disabled="busy" @click="openCreate">发起申请</button>
    </div>
    <div class="toolbar">
      <select v-model="statusFilter" class="toolbar-control" :disabled="pending" @change="load">
        <option v-for="item in APPLY_STATUS_FILTERS" :key="item.value || 'all'" :value="item.value">{{ item.label }}</option>
      </select>
      <input v-model.trim="workName" class="toolbar-control search" type="search" placeholder="按作品名搜索" :disabled="pending" @keydown.enter.prevent="load" />
      <button class="btn quiet sm toolbar-btn" type="button" :disabled="pending" @click="load">查询</button>
    </div>

    <LoadState :pending="pending" :error="loadError" :retry="load" :empty="!pending && !loadError && !list.length" empty-text="暂无版权申请记录">
      <button class="btn sm" :disabled="busy" @click="openCreate">立即申请</button>
    </LoadState>

    <div v-if="!pending && !loadError && list.length" class="worklist">
      <CopyrightWorkCard v-for="item in list" :key="listItemKey(item)" :title="item.workName || ('作品#' + item.workId)" :cover="item.workCoverUrl || worksForCovers.find(w => w.workId === item.workId)?.cover" :status="applyStatusLabelOf(item)">
        <p class="cost">作品类型：{{ workTypeLabel(item.workType) }}</p>
        <p v-if="item.centerName" class="cost">版权中心：{{ item.centerName }}</p>
        <p class="cost">{{ canPay(item) ? '支付单号' : '申请编号' }}：{{ item.applyNo || '—' }}</p>
        <p v-if="item.feeAmount != null" class="cost fee-tip">应付登记费：{{ formatFeeAmount(item.feeAmount) }}</p>
        <p class="cost">提交时间：{{ dateText(item.submitTime || item.createTime) }}</p>
        <p v-if="supplementDeadlineText(item)" class="cost">补正截止：{{ dateText(supplementDeadlineText(item)) }}</p>
        <p v-if="canSupplement(item)" class="cost reject-tip">{{ applyStatusDescription(item) }}</p>
        <p v-else-if="canPay(item)" class="cost reject-tip">{{ applyStatusDescription(item) }}</p>
        <p v-else-if="resolveApplyStatus(item) === 'rejected' && item.rejectReason" class="cost reject-tip">{{ item.rejectReason }}</p>
        <template #actions>
          <button v-if="canPay(item)" class="btn sm" type="button" @click="openPay(item)">去付款 {{ formatFeeAmount(item.feeAmount) }}</button>
          <button v-else class="btn quiet sm" type="button" @click="openDetail(item.applyId)">查看申请</button>
          <button v-if="canSupplement(item)" class="btn sm" type="button" @click="openDetail(item.applyId)">去补正</button>
          <button v-if="canResubmit(item)" class="btn sm" type="button" @click="openResubmit(item)">重新提交</button>
        </template>
      </CopyrightWorkCard>
    </div>

    <!-- 发起 / 重新提交 -->
    <PortalLayer v-model="formVisible" :title="resubmitId ? '重新提交申请' : '发起版权申请'" modal big size="min(700px, 94vw)" :before-close="closeForm">
      <form class="apply-form" @submit.prevent="submitForm">
        <div v-if="!resubmitId" class="field">
          <span class="field-label">选择作品</span>
          <select v-model="form.workId" required :disabled="formBusy || worksLoading" @change="formDirty = true; refreshFeeQuote()">
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
          <select v-model="form.copyrightCenter" required :disabled="formBusy || centersLoading" @change="formDirty = true; refreshFeeQuote()">
            <option value="">{{ centersLoading ? '加载中…' : '请选择版权中心' }}</option>
            <option v-for="center in centers" :key="center.centerCode" :value="center.centerCode">{{ center.centerName || center.centerCode }}</option>
          </select>
        </div>

        <div class="field fee-card">
          <span class="field-label">登记费用</span>
          <p v-if="feeLoading" class="cost">费用计算中…</p>
          <p v-else-if="feeError" class="note bad">{{ feeError }}</p>
          <template v-else-if="feeQuote">
            <p class="fee-amount">{{ formatFeeAmount(feeQuote.feeAmount) }}</p>
            <p class="cost">正文字数 {{ feeQuote.wordCount || 0 }} 字 · 费用交给版权登记中心，平台不另收服务费</p>
          </template>
          <p v-else class="cost">请先选择作品和版权中心</p>
        </div>

        <div class="field">
          <span class="field-label">作品完成时间</span>
          <input v-model="form.completeTime" type="date" required :disabled="formBusy" @change="formDirty = true" />
        </div>

        <div class="field">
          <span class="field-label">权利人姓名</span>
          <input v-model.trim="form.rightsHolderName" maxlength="64" placeholder="请填写权利人姓名" required :disabled="formBusy" @input="formDirty = true" />
        </div>
        <div class="field">
          <span class="field-label">证件类型</span>
          <select v-model="form.idDocType" required :disabled="formBusy" @change="formDirty = true">
            <option v-for="item in ID_DOC_TYPES" :key="item.value" :value="item.value">{{ item.label }}</option>
          </select>
        </div>
        <div class="field">
          <span class="field-label">证件号码</span>
          <input v-model.trim="form.idDocNo" maxlength="64" placeholder="请填写证件号码" required :disabled="formBusy" @input="formDirty = true" />
        </div>

        <div class="field">
          <span class="field-label">作品样本 / 原创性证明</span>
          <p class="cost">须上传作品样本与身份证明；支持图片（JPG/PNG）和 PDF，最多 10 个文件</p>
          <label class="drop upload-control apply-drop">
            <input type="file" accept="image/png,image/jpeg,.pdf" multiple :disabled="formBusy || form.sampleMaterials.length >= 10" @change="onFormMaterials('sampleMaterials', $event.target.files, 10); $event.target.value = ''" />
            <span>{{ formBusy && uploadingMaterial === 'sampleMaterials' ? '正在上传材料…' : '点击上传作品样本/原创性证明' }}</span>
          </label>
          <ul v-if="form.sampleMaterials.length" class="material-list">
            <li v-for="(item, index) in form.sampleMaterials" :key="item.url + index">
              <button type="button" class="text-button material-name" :title="item.name" @click="openPreview(item.url, item.name)">{{ item.name }}</button>
              <button type="button" class="btn quiet sm" :disabled="formBusy" @click="form.sampleMaterials.splice(index, 1); formDirty = true">移除</button>
            </li>
          </ul>
        </div>

        <div class="field">
          <span class="field-label">作者身份证明</span>
          <p class="cost">支持图片（JPG/PNG）和 PDF，最多 5 个文件</p>
          <label class="drop upload-control apply-drop">
            <input type="file" accept="image/png,image/jpeg,.pdf" multiple :disabled="formBusy || form.identityMaterials.length >= 5" @change="onFormMaterials('identityMaterials', $event.target.files, 5); $event.target.value = ''" />
            <span>{{ formBusy && uploadingMaterial === 'identityMaterials' ? '正在上传材料…' : '点击上传作者身份证明' }}</span>
          </label>
          <ul v-if="form.identityMaterials.length" class="material-list">
            <li v-for="(item, index) in form.identityMaterials" :key="item.url + index">
              <button type="button" class="text-button material-name" :title="item.name" @click="openPreview(item.url, item.name)">{{ item.name }}</button>
              <button type="button" class="btn quiet sm" :disabled="formBusy" @click="form.identityMaterials.splice(index, 1); formDirty = true">移除</button>
            </li>
          </ul>
        </div>

        <div class="field">
          <span class="field-label">{{ resubmitId ? '修改说明' : '备注说明（选填）' }}</span>
          <textarea v-model="form.remark" maxlength="500" rows="3" :placeholder="resubmitId ? '请说明本次修改内容' : '选填'" :disabled="formBusy" @input="formDirty = true" />
        </div>

        <p v-if="realNameTip" class="note bad">{{ realNameTip }}</p>
        <p v-if="formError" class="note bad" role="alert">{{ formError }}</p>
        <button class="btn" :disabled="formBusy || feeLoading || !feeQuote">
          {{ formBusy ? '提交中…' : submitButtonText }}
        </button>
      </form>
    </PortalLayer>

    <!-- 确认付款（临时直付，对齐 App） -->
    <PortalLayer v-model="payVisible" title="确认付款" modal size="min(480px, 94vw)" :before-close="closePay">
      <div class="pay-panel">
        <p class="cost">应付登记费</p>
        <p class="fee-amount pay-amount">{{ payFeeText }}</p>
        <p class="cost pay-tip">当前为临时直付：确认后直接创建申请并提交第三方版权中心，暂不走支付宝沙箱。</p>
        <p v-if="payError" class="note bad" role="alert">{{ payError }}</p>
        <button class="btn" type="button" :disabled="payBusy" @click="confirmPay">
          {{ payBusy ? '提交中…' : (payFeeText === '确认后提交' ? '确认付款并提交' : `确认付款 ${payFeeText}`) }}
        </button>
      </div>
    </PortalLayer>

    <!-- 详情 -->
    <PortalLayer v-model="detailVisible" title="申请详情" modal big>
      <LoadState :pending="detailPending" :error="detailError" :retry="() => openDetail(detail?.applyId)" />
      <template v-if="detail && !detailPending && !detailError">
        <div class="detail-hero">
          <div>
            <h3>{{ detail.workName || ('作品#' + detail.workId) }}</h3>
            <p>
              <span class="status-tag" :class="'tone-' + applyStatusToneOf(detail)">{{ applyStatusLabelOf(detail) }}</span>
            </p>
            <p class="cost">{{ applyStatusDescription(detail) }}</p>
          </div>
        </div>
        <ul class="rows detail-rows">
          <li><span class="k">申请编号</span><span class="v muted">{{ detail.applyNo || '—' }}</span></li>
          <li><span class="k">作品类型</span><span class="v muted">{{ workTypeLabel(detail.workType) }}</span></li>
          <li><span class="k">版权中心</span><span class="v muted">{{ detail.centerName || detail.copyrightCenter || '—' }}</span></li>
          <li><span class="k">提交时间</span><span class="v muted">{{ dateText(detail.submitTime || detail.createTime) }}</span></li>
          <li v-if="detail.rightsHolderName"><span class="k">权利人</span><span class="v muted">{{ detail.rightsHolderName }}</span></li>
          <li v-if="detail.idDocType"><span class="k">证件类型</span><span class="v muted">{{ idDocTypeLabel(detail.idDocType) }}</span></li>
          <li v-if="detail.idDocNo"><span class="k">证件号码</span><span class="v muted">{{ detail.idDocNo }}</span></li>
          <li v-if="detail.feeAmount != null"><span class="k">登记费</span><span class="v muted">{{ formatFeeAmount(detail.feeAmount) }}</span></li>
          <li v-if="detail.feeAmount != null"><span class="k">缴费状态</span><span class="v muted">{{ canPay(detail) ? '待付款' : '已缴费' }}</span></li>
          <li v-if="detail.certNo"><span class="k">证书编号</span><span class="v muted">{{ detail.certNo }}</span></li>
          <li v-if="detail.remark"><span class="k">备注</span><span class="v muted">{{ detail.remark }}</span></li>
          <li v-if="detail.rejectReason"><span class="k">驳回原因</span><span class="v muted">{{ detail.rejectReason }}</span></li>
        </ul>

        <div v-if="hasSupplementInfo(detail)" class="supplement-card">
          <div class="sub-head sub">
            <h3>{{ resolveApplyStatus(detail) === 'supplement_overdue' ? '补正已超时' : '补正信息' }}</h3>
          </div>
          <ul class="rows detail-rows">
            <li><span class="k">补正要求</span><span class="v muted">{{ supplementNoticeText(detail) || '—' }}</span></li>
            <li><span class="k">截止时间</span><span class="v muted">{{ dateText(supplementDeadlineText(detail)) || '—' }}</span></li>
          </ul>
          <p class="cost">
            {{ resolveApplyStatus(detail) === 'supplement_overdue'
              ? '已超过补正期限，本轮可能不予登记；最终以版权中心结果为准。'
              : '同一申请内补正，不重交官费；请在截止日前提交材料。' }}
          </p>
          <template v-if="canSupplement(detail)">
            <div class="field">
              <span class="field-label">补正材料</span>
              <p class="cost">请按要求上传补充材料，支持图片与 PDF，最多 10 个</p>
              <label class="drop upload-control apply-drop">
                <input type="file" accept="image/png,image/jpeg,.pdf" multiple :disabled="supplementBusy || supplementMaterials.length >= 10" @change="onSupplementMaterials($event.target.files); $event.target.value = ''" />
                <span>{{ supplementBusy && uploadingMaterial === 'supplement' ? '正在上传材料…' : '点击上传补正材料' }}</span>
              </label>
              <ul v-if="supplementMaterials.length" class="material-list">
                <li v-for="(item, index) in supplementMaterials" :key="item.url + index">
                  <button type="button" class="text-button material-name" :title="item.name" @click="openPreview(item.url, item.name)">{{ item.name }}</button>
                  <button type="button" class="btn quiet sm" :disabled="supplementBusy" @click="supplementMaterials.splice(index, 1)">移除</button>
                </li>
              </ul>
            </div>
            <div class="field">
              <span class="field-label">补正说明（选填）</span>
              <textarea v-model="supplementRemark" maxlength="200" rows="2" placeholder="补正说明（选填）" :disabled="supplementBusy" />
            </div>
            <p v-if="supplementError" class="note bad" role="alert">{{ supplementError }}</p>
            <button class="btn sm" type="button" :disabled="supplementBusy" @click="submitSupplement">
              {{ supplementBusy ? '提交中…' : '提交补正（不重交官费）' }}
            </button>
          </template>
        </div>

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
          <button v-if="canPay(detail)" class="btn sm" :disabled="busy || payBusy" @click="openPay(detail)">去付款 {{ formatFeeAmount(detail.feeAmount) }}</button>
          <button v-if="canSyncStatus(detail)" class="btn quiet sm" :disabled="busy || syncBusy" @click="doSyncStatus">{{ syncBusy ? '同步中…' : '刷新审核状态' }}</button>
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
  APPLY_STATUS_FILTERS, WORK_TYPES, ID_DOC_TYPES,
  applyStatusLabelOf, applyStatusToneOf, applyStatusDescription, workTypeLabel,
  canResubmit, canDeleteApply, isCertificated, canSupplement, canSyncStatus, canPay,
  resolveApplyStatus, hasSupplementInfo, supplementNoticeText, supplementDeadlineText,
  idDocTypeLabel, formatFeeAmount, listItemKey, copyrightMaterialItems, materialsToJson, guessFileType
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
  rightsHolderName: '',
  idDocType: 'id_card',
  idDocNo: '',
  remark: '',
  sampleMaterials: [],
  identityMaterials: []
})
const formError = ref('')
const formBusy = ref(false)
const formDirty = ref(false)
const uploadingMaterial = ref('')
const feeQuote = ref(null)
const feeLoading = ref(false)
const feeError = ref('')
const feeQuoteSeq = ref(0)

const payVisible = ref(false)
const payOrderId = ref(null)
const payFeeAmount = ref(null)
const payBusy = ref(false)
const payError = ref('')
const payFeeText = computed(() =>
  payFeeAmount.value != null && payFeeAmount.value !== ''
    ? formatFeeAmount(payFeeAmount.value)
    : '确认后提交'
)
const submitButtonText = computed(() => {
  if (!feeQuote.value) return resubmitId.value ? '重新缴费' : '去支付'
  const amount = formatFeeAmount(feeQuote.value.feeAmount)
  return resubmitId.value ? `重新缴费 ${amount}` : `去支付 ${amount}`
})

const detailVisible = ref(false)
const detail = ref(null)
const detailPending = ref(false)
const detailError = ref('')
const syncBusy = ref(false)
const supplementMaterials = ref([])
const supplementRemark = ref('')
const supplementBusy = ref(false)
const supplementError = ref('')
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
  form.rightsHolderName = ''
  form.idDocType = 'id_card'
  form.idDocNo = ''
  form.remark = ''
  form.sampleMaterials = []
  form.identityMaterials = []
  formError.value = ''
  formDirty.value = false
  realNameTip.value = ''
  uploadingMaterial.value = ''
  feeQuote.value = null
  feeLoading.value = false
  feeError.value = ''
}

function resetPay() {
  payOrderId.value = null
  payFeeAmount.value = null
  payBusy.value = false
  payError.value = ''
}

async function refreshFeeQuote() {
  const workId = Number(form.workId || 0)
  const center = String(form.copyrightCenter || '').trim()
  if (!workId || !center) {
    feeQuote.value = null
    feeError.value = ''
    feeLoading.value = false
    return
  }
  const seq = ++feeQuoteSeq.value
  feeLoading.value = true
  feeError.value = ''
  try {
    const quote = await api.value.quoteCopyrightFee(workId, center)
    if (seq !== feeQuoteSeq.value) return
    feeQuote.value = quote || null
  } catch (failure) {
    if (seq !== feeQuoteSeq.value) return
    feeQuote.value = null
    feeError.value = failure.message || '询价失败'
  } finally {
    if (seq === feeQuoteSeq.value) feeLoading.value = false
  }
}

function openPay(item) {
  const id = Number(item?.payOrderId || 0)
  if (!id) {
    ElMessage.warning('支付单不存在')
    return
  }
  payVisible.value = true
  payOrderId.value = id
  payFeeAmount.value = item?.feeAmount ?? null
  payError.value = ''
}

async function closePay(done) {
  if (payBusy.value) return
  resetPay()
  done()
}

async function confirmPay() {
  if (!payOrderId.value || payBusy.value) return
  payBusy.value = true
  payError.value = ''
  try {
    const result = await api.value.directPayCopyrightOrder(payOrderId.value)
    if (!result?.paid) throw new Error('提交失败，请稍后重试')
    ElMessage.success('已提交至版权中心审核')
    payVisible.value = false
    resetPay()
    detailVisible.value = false
    await load()
    if (result.applyId) await openDetail(result.applyId)
  } catch (failure) {
    payError.value = failure.message || '付款提交失败，请稍后重试'
    await handleError(failure)
  } finally {
    payBusy.value = false
  }
}

function resetSupplement() {
  supplementMaterials.value = []
  supplementRemark.value = ''
  supplementError.value = ''
  supplementBusy.value = false
  uploadingMaterial.value = ''
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
    form.rightsHolderName = source.rightsHolderName || ''
    form.idDocType = source.idDocType || 'id_card'
    form.idDocNo = source.idDocNo || ''
    form.sampleMaterials = copyrightMaterialItems(source.originalityProof)
    form.identityMaterials = copyrightMaterialItems(source.authorIdentityDoc)
    form.remark = ''
    await Promise.all([checkRealName(), refreshFeeQuote()])
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
  resetSupplement()
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

async function uploadMaterialFiles(targetList, fileList, maxCount, errorRef) {
  if (!fileList?.length) return false
  const files = [...fileList]
  const remain = maxCount - targetList.length
  if (remain <= 0) {
    errorRef.value = `最多上传 ${maxCount} 个文件`
    return false
  }
  const slice = files.slice(0, remain)
  for (const file of slice) {
    const issue = validateFile(file, ['png', 'jpg', 'jpeg', 'pdf'], 10)
    if (issue) {
      errorRef.value = issue
      return false
    }
  }
  errorRef.value = ''
  try {
    for (const file of slice) {
      const result = await api.value.upload(file, 'copyright')
      if (!result?.url) throw new Error('材料上传失败，请重试')
      targetList.push({
        url: result.url,
        name: result.fileName || file.name || sealFileName(result.url) || `材料 ${targetList.length + 1}`,
        fileType: guessFileType(file.name || result.url)
      })
    }
    return true
  } catch (failure) {
    errorRef.value = failure.message
    await handleError(failure)
    return false
  }
}

async function onFormMaterials(field, fileList, maxCount) {
  if (formBusy.value) return
  formBusy.value = true
  uploadingMaterial.value = field
  try {
    const ok = await uploadMaterialFiles(form[field], fileList, maxCount, formError)
    if (ok) formDirty.value = true
  } finally {
    uploadingMaterial.value = ''
    formBusy.value = false
  }
}

async function onSupplementMaterials(fileList) {
  if (supplementBusy.value) return
  supplementBusy.value = true
  uploadingMaterial.value = 'supplement'
  try {
    await uploadMaterialFiles(supplementMaterials.value, fileList, 10, supplementError)
  } finally {
    uploadingMaterial.value = ''
    supplementBusy.value = false
  }
}

async function submitForm() {
  if (formBusy.value) return
  formError.value = ''
  if (!form.workType) { formError.value = '请选择作品类型'; return }
  if (!form.completeTime) { formError.value = '请选择作品完成时间'; return }
  if (!form.rightsHolderName.trim()) { formError.value = '请填写权利人姓名'; return }
  if (!form.idDocNo.trim()) { formError.value = '请填写证件号码'; return }
  if (!form.sampleMaterials.length) { formError.value = '请上传作品样本/原创性证明材料'; return }
  if (!form.identityMaterials.length) { formError.value = '请上传作者身份证明材料'; return }
  if (!resubmitId.value) {
    if (!form.workId) { formError.value = '请选择作品'; return }
    if (!form.copyrightCenter) { formError.value = '请选择版权中心'; return }
  }
  if (!feeQuote.value) {
    formError.value = feeError.value || '请先完成登记费询价'
    await refreshFeeQuote()
    return
  }

  const originalityProofUrls = materialsToJson(form.sampleMaterials)
  const authorIdentityDocUrls = materialsToJson(form.identityMaterials)
  formBusy.value = true
  try {
    let payOrder
    if (resubmitId.value) {
      payOrder = await api.value.createCopyrightResubmitPayOrder({
        originalApplyId: Number(resubmitId.value),
        workType: form.workType,
        completeTime: form.completeTime,
        originalityProofUrls,
        authorIdentityDocUrls,
        remark: form.remark.trim() || '重新提交申请'
      })
    } else {
      payOrder = await api.value.createCopyrightPayOrder({
        workId: Number(form.workId),
        workType: form.workType,
        completeTime: form.completeTime,
        copyrightCenter: form.copyrightCenter,
        originalityProofUrls,
        authorIdentityDocUrls,
        rightsHolderName: form.rightsHolderName.trim(),
        idDocType: form.idDocType || 'id_card',
        idDocNo: form.idDocNo.trim(),
        remark: form.remark.trim() || undefined
      })
    }
    if (!payOrder?.payOrderId) throw new Error('创建支付单失败')
    formDirty.value = false
    formVisible.value = false
    resetForm()
    await load()
    openPay({
      payOrderId: payOrder.payOrderId,
      feeAmount: payOrder.feeAmount ?? feeQuote.value?.feeAmount
    })
  } catch (failure) {
    formError.value = failure.message
    await handleError(failure)
  } finally {
    formBusy.value = false
  }
}

async function submitSupplement() {
  if (!detail.value?.applyId || supplementBusy.value) return
  supplementError.value = ''
  if (!supplementMaterials.value.length) {
    supplementError.value = '请先上传补正材料'
    return
  }
  const materialsJson = materialsToJson(supplementMaterials.value)
  if (!materialsJson) {
    supplementError.value = '请先上传补正材料'
    return
  }
  supplementBusy.value = true
  try {
    await api.value.submitCopyrightSupplement(detail.value.applyId, {
      materialsJson,
      remark: supplementRemark.value.trim() || undefined
    })
    ElMessage.success('补正已提交，等待继续审核')
    resetSupplement()
    await openDetail(detail.value.applyId)
    await load()
  } catch (failure) {
    supplementError.value = failure.message
    await handleError(failure)
  } finally {
    supplementBusy.value = false
  }
}

async function doSyncStatus() {
  if (!detail.value?.applyId || syncBusy.value) return
  syncBusy.value = true
  try {
    const result = await api.value.syncCopyrightApplicationStatus(detail.value.applyId)
    const text = result?.statusText || result?.status || '已更新'
    ElMessage.success(`审核状态：${text}`)
    await openDetail(detail.value.applyId)
    await load()
  } catch (failure) {
    await handleError(failure)
  } finally {
    syncBusy.value = false
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
      if (!response.ok) throw new Error('文本加载失败，请稍后再试')
      const contentType = response.headers.get('content-type') || ''
      const buffer = await response.arrayBuffer()
      if (contentType.includes('application/json')) {
        const jsonText = new TextDecoder('utf-8').decode(buffer)
        if (jsonText.includes('"code"')) throw new Error('材料暂时无法访问，请稍后重试')
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
    if (!response.ok) throw new Error('下载失败，请稍后再试')
    const contentType = response.headers.get('content-type') || ''
    const buffer = await response.arrayBuffer()
    if (contentType.includes('application/json') || (buffer.byteLength < 200 && new TextDecoder('utf-8').decode(buffer).includes('"code"'))) {
      throw new Error('文件暂时无法下载，请稍后再试')
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
.fee-tip { margin: 4px 0 0; color: var(--indigo, #3d5a56); font-weight: 500 }
.fee-card { padding: 12px 14px; border: 1px solid var(--rule-2, #d9d9d9); border-radius: 8px; background: #fafafa }
.fee-amount { margin: 0; font-size: 24px; font-weight: 700; color: var(--indigo, #3d5a56) }
.pay-panel { display: grid; gap: 12px; justify-items: center; text-align: center; padding: 8px 4px 4px }
.pay-amount { font-size: 32px }
.pay-tip { max-width: 360px; line-height: 1.5 }
.pay-panel .btn { width: 100%; max-width: 320px }

.status-tag { display: inline-block; padding: 1px 8px; border-radius: 10px; font-size: 12px; font-weight: 500 }
.tone-wait { background: #fdf6ec; color: #e6a23c }
.tone-warn { background: #fff2e8; color: #fa541c }
.tone-ok { background: #f0f9eb; color: #67c23a }
.tone-bad { background: #fef0f0; color: #f56c6c }
.tone-off { background: var(--paper-3); color: var(--ink-3) }

.supplement-card {
  margin: 16px 0;
  padding: 14px 16px;
  border: 1px solid #ffd8bf;
  border-radius: 8px;
  background: #fff7f0;
  display: grid;
  gap: 12px;
}
.supplement-card .sub-head { margin-top: 0; margin-bottom: 0; padding-bottom: 0; border-bottom: 0 }
.supplement-card .field { display: flex; flex-direction: column; gap: 8px; margin: 0 }
.supplement-card .field-label { font-size: 13px; color: var(--ink-2, #666) }
.supplement-card textarea { display: block; width: 100%; box-sizing: border-box }

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
