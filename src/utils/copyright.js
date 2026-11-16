/** 版权申请 / 电子证书文案与材料辅助（对齐 App copyright_models）。 */

export const APPLY_STATUS = {
  unpaid: '待付款',
  pending: '审核中',
  approved: '审核中',
  submitted: '审核中',
  reviewing: '审核中',
  need_supplement: '待补正',
  supplement_overdue: '逾期待驳回',
  certificated: '已发证',
  rejected: '已驳回'
}

/** 列表筛选项（与 App 对齐；合并审核中，单独「待补正」）。 */
export const APPLY_STATUS_FILTERS = [
  { value: '', label: '全部状态' },
  { value: 'unpaid', label: '待付款' },
  { value: 'need_supplement', label: '待补正' },
  { value: 'reviewing', label: '审核中' },
  { value: 'certificated', label: '已通过' },
  { value: 'rejected', label: '已拒绝' }
]

export const ID_DOC_TYPES = [
  { value: 'id_card', label: '居民身份证' },
  { value: 'passport', label: '护照' },
  { value: 'hk_macau_pass', label: '港澳通行证' },
  { value: 'taiwan_pass', label: '台湾通行证' },
  { value: 'other', label: '其他' }
]

export const CERT_STATUS = {
  pending: '申请中',
  issued: '已签发',
  expired: '已失效'
}

export const WORK_TYPES = [
  { value: 'script', label: '剧本' },
  { value: 'novel', label: '小说' },
  { value: 'short_drama', label: '短剧' },
  { value: 'movie', label: '电影剧本' },
  { value: 'tv_series', label: '电视剧剧本' }
]

export const SHELF_STATUS = {
  on_shelf: '已上架',
  off_shelf: '已下架'
}

export const applyStatusLabel = status => APPLY_STATUS[status] || status || '未知'
export const certStatusLabel = status => CERT_STATUS[status] || status || '未知'
export const shelfStatusLabel = status => SHELF_STATUS[status] || status || '未知'
export const workTypeLabel = type => WORK_TYPES.find(item => item.value === type)?.label || type || '—'

export const shelfStatusTone = status => ({
  on_shelf: 'ok',
  off_shelf: 'off'
}[status] || 'off')

export const canToggleShelf = item => item?.status === 'on_shelf' || item?.status === 'off_shelf'

export const applyStatusTone = status => ({
  unpaid: 'wait',
  pending: 'wait',
  approved: 'wait',
  submitted: 'wait',
  reviewing: 'wait',
  need_supplement: 'warn',
  supplement_overdue: 'bad',
  certificated: 'ok',
  rejected: 'bad'
}[status] || 'off')

export const certStatusTone = status => ({
  pending: 'wait',
  issued: 'ok',
  expired: 'off'
}[status] || 'off')

/** 优先 displayStatus，与 App / Admin 同口径。 */
export const resolveApplyStatus = item =>
  String(item?.displayStatus || item?.status || '').trim()

export const isUnpaid = item => resolveApplyStatus(item) === 'unpaid'
export const canPay = item => {
  const payOrderId = Number(item?.payOrderId || 0)
  return isUnpaid(item) && payOrderId > 0
}
export const canResubmit = item => resolveApplyStatus(item) === 'rejected'
export const canDeleteApply = item => resolveApplyStatus(item) === 'pending'
export const isCertificated = item => resolveApplyStatus(item) === 'certificated'
export const canSupplement = item => resolveApplyStatus(item) === 'need_supplement'
export const canSyncStatus = item => {
  const status = resolveApplyStatus(item)
  return ['reviewing', 'submitted', 'pending', 'approved', 'need_supplement'].includes(status)
}
export const formatFeeAmount = amount => {
  if (amount == null || amount === '') return ''
  const num = Number(amount)
  if (Number.isNaN(num)) return String(amount)
  return `¥${num.toFixed(2)}`
}
export const listItemKey = item =>
  item?.applyId ? `apply-${item.applyId}` : `pay-${item?.payOrderId || item?.payNo || Math.random()}`
export const isCertIssued = item => item?.status === 'issued'
export const idDocTypeLabel = type =>
  ID_DOC_TYPES.find(item => item.value === type)?.label || type || '—'

export function hasSupplementInfo(item) {
  if (!item) return false
  const status = resolveApplyStatus(item)
  return canSupplement(item)
    || status === 'supplement_overdue'
    || !!(item.supplementNotice && String(item.supplementNotice).trim())
    || !!(item.openSupplement && typeof item.openSupplement === 'object')
}

export function supplementNoticeText(item) {
  if (!item) return ''
  if (item.supplementNotice && String(item.supplementNotice).trim()) return String(item.supplementNotice).trim()
  const open = item.openSupplement
  if (open && typeof open === 'object') {
    return String(open.requirementText || open.notice || '').trim()
  }
  return ''
}

export function supplementDeadlineText(item) {
  if (!item) return ''
  if (item.supplementDeadline) return String(item.supplementDeadline)
  const open = item.openSupplement
  if (open && typeof open === 'object') {
    return String(open.deadlineTime || open.deadline || '').trim()
  }
  return ''
}

/**
 * 版权交割状态（对齐 App + 现行交易流程）：
 * 合同签署 → 买方付款 → 后端建交割单(pending_upload) → 卖方上传 → pending_confirm → 买方确认 → completed。
 * 未付款不会出现交割单。
 */
export const DELIVERY_STATUS = {
  pending_upload: '待卖方上传',
  pending_confirm: '等待买家收货',
  completed: '已完成',
  cancelled: '已取消'
}

export const DELIVERY_FILE_TYPES = [
  { value: 'cert', label: '版权证书' },
  { value: 'source', label: '作品源文件' },
  { value: 'doc', label: '授权文档' },
  { value: 'other', label: '其他材料' }
]

export const deliveryStatusLabel = status => DELIVERY_STATUS[status] || status || '未知'
export const deliveryFileTypeLabel = type =>
  DELIVERY_FILE_TYPES.find(item => item.value === type)?.label || type || '—'
export const deliveryStatusTone = status => ({
  pending_upload: 'warn',
  pending_confirm: 'wait',
  completed: 'ok',
  cancelled: 'off'
}[status] || 'off')
export const deliveryLicenseLabel = type => ({
  exclusive: '独家授权',
  non_exclusive: '非独家授权',
  adaptation: '改编授权'
}[type] || type || '—')

/** 交割状态说明（列表/详情副文案）。 */
export function deliveryStatusDescription(status) {
  switch (status) {
    case 'pending_upload': return '买方已付款，等待卖方上传作品源文件等交割材料'
    case 'pending_confirm': return '卖方已提交材料，等待买方确认收货'
    case 'completed': return '买方已确认收货，交割完成'
    case 'cancelled': return '交割已取消'
    default: return ''
  }
}

/**
 * 列表操作按钮文案：按当前用户角色 + 交割状态（与订单侧一致）。
 * @returns {{ label: string, primary: boolean } | null}
 */
export function deliveryActionMeta(item, userId) {
  if (!item) return null
  const uid = Number(userId)
  const isSeller = Number(item.sellerId) === uid
  const isBuyer = Number(item.buyerId) === uid
  if (item.status === 'pending_upload' && isSeller) return { label: '去交割', primary: true }
  if (item.status === 'pending_upload' && isBuyer) return { label: '查看交割', primary: false }
  if (item.status === 'pending_confirm' && isSeller) return { label: '等待买家收货', primary: false }
  if (item.status === 'pending_confirm' && isBuyer) return { label: '去确认收货', primary: true }
  return { label: '详情', primary: false }
}

export function applyStatusDescription(item) {
  if (!item) return ''
  const status = resolveApplyStatus(item)
  switch (status) {
    case 'unpaid':
      return item.feeAmount != null
        ? `待支付登记费 ¥${Number(item.feeAmount).toFixed(2)}，付款后提交版权中心`
        : '待支付登记费，付款后提交版权中心'
    case 'need_supplement':
      return supplementNoticeText(item)
        || '版权中心要求补充材料，请在截止日前补正（不重交官费）'
    case 'supplement_overdue':
      return '补正已超时，本轮可能不予登记'
    case 'pending':
    case 'approved':
    case 'submitted':
    case 'reviewing':
      return `已提交到${item.centerName || '版权中心'}，正在审核中`
    case 'certificated':
      return '恭喜！版权证书已签发'
    case 'rejected':
      return item.rejectReason || '申请被驳回，费用不退，可重新缴费申请'
    default:
      return ''
  }
}

export const applyStatusLabelOf = item => applyStatusLabel(resolveApplyStatus(item))
export const applyStatusToneOf = item => applyStatusTone(resolveApplyStatus(item))

/** 材料项：兼容 App JSON 数组 [{url,filename,fileType}] / 逗号 URL / 纯数组。 */
export function copyrightMaterialItems(value) {
  if (!value) return []
  let list = []
  if (Array.isArray(value)) list = value
  else {
    const text = String(value).trim()
    if (!text) return []
    try { list = JSON.parse(text) }
    catch { list = text.split(',') }
  }
  if (!Array.isArray(list)) return []
  return list.map((item, index) => {
    if (item && typeof item === 'object') {
      const url = String(item.url || '').trim()
      if (!url) return null
      return {
        url,
        name: item.filename || item.fileName || item.name || fileNameFromUrl(url) || `材料 ${index + 1}`,
        fileType: item.fileType || guessFileType(item.filename || item.fileName || item.name || url)
      }
    }
    const url = String(item || '').trim()
    if (!url) return null
    return { url, name: fileNameFromUrl(url) || `材料 ${index + 1}`, fileType: guessFileType(url) }
  }).filter(Boolean)
}

/** 与 App materialFilesToJson 同口径。 */
export function materialsToJson(items) {
  const list = (items || []).map(item => ({
    url: item.url,
    filename: item.name || item.filename || fileNameFromUrl(item.url),
    fileType: item.fileType || guessFileType(item.name || item.url)
  })).filter(item => item.url)
  return list.length ? JSON.stringify(list) : null
}

export function fileNameFromUrl(url) {
  if (!url) return ''
  try {
    const path = String(url).split('?')[0].split('#')[0]
    return decodeURIComponent(path.substring(path.lastIndexOf('/') + 1) || '') || ''
  } catch {
    return ''
  }
}

function fileExt(value) {
  if (!value) return ''
  const clean = String(value).split('?')[0].split('#')[0].toLowerCase()
  const match = clean.match(/\.([a-z0-9]+)$/)
  return match ? match[1] : ''
}

export function guessFileType(nameOrUrl) {
  const ext = fileExt(nameOrUrl)
  if (['jpg', 'jpeg', 'png', 'bmp', 'gif', 'webp'].includes(ext)) return 'image'
  if (ext === 'pdf') return 'pdf'
  if (['doc', 'docx', 'txt'].includes(ext)) return 'document'
  return 'other'
}

export { materialKind } from './seal.js'

/**
 * 生成 Mock 版权证书 PDF（对齐 Admin SysCopyrightCertServiceImpl#generateMockPdf）。
 * App/User 下载接口只回 certUrl，开发期地址常不可达；Admin 则直接回 Mock 字节流。
 */
export function buildMockCertPdf(cert = {}) {
  const certNo = escapePdfText(cert.certNo || String(cert.certId || ''))
  const workId = escapePdfText(cert.workId != null ? String(cert.workId) : '')
  const workName = escapePdfText(cert.workName || '')
  const userName = escapePdfText(cert.userName || '')
  const hash = escapePdfText(cert.blockchainHash || 'N/A')
  const status = escapePdfText(cert.status || '')
  const applyTime = escapePdfText(cert.applyTime ? String(cert.applyTime).slice(0, 19) : '')
  const certTime = escapePdfText(cert.certTime ? String(cert.certTime).slice(0, 19) : '')

  const content = [
    'BT /F1 24 Tf 50 720 Td (Copyright Certificate) Tj ET',
    `BT /F1 12 Tf 50 680 Td (Certificate No: ${certNo}) Tj ET`,
    `BT /F1 12 Tf 50 655 Td (Work: ${workName || workId}) Tj ET`,
    `BT /F1 12 Tf 50 630 Td (Rightsholder: ${userName}) Tj ET`,
    `BT /F1 12 Tf 50 605 Td (Work ID: ${workId}) Tj ET`,
    'BT /F1 12 Tf 50 580 Td (Blockchain Hash:) Tj ET',
    `BT /F1 9 Tf 50 560 Td (${hash}) Tj ET`,
    `BT /F1 12 Tf 50 530 Td (Status: ${status}) Tj ET`,
    `BT /F1 12 Tf 50 505 Td (Apply Time: ${applyTime}) Tj ET`,
    `BT /F1 12 Tf 50 480 Td (Cert Time: ${certTime}) Tj ET`
  ].join(' ')

  const stream = `5 0 obj\n<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`
  const pdf =
    '%PDF-1.4\n' +
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n' +
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n' +
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /Resources 4 0 R /MediaBox [0 0 612 792] /Contents 5 0 R >>\nendobj\n' +
    '4 0 obj\n<< /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >>\nendobj\n' +
    stream +
    'xref\n0 6\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000266 00000 n \n0000000349 00000 n \n' +
    'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n0\n%%EOF\n'

  return new Blob([pdf], { type: 'application/pdf' })
}

function escapePdfText(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    // Helvetica 无法可靠渲染中文，非 ASCII 用 ? 占位，避免破坏 PDF 语法
    .replace(/[^\x20-\x7E]/g, '?')
}

/** 触发浏览器下载 Blob（对齐 Admin CopyrightCertManage.downloadCert）。 */
export function saveBlobFile(blob, fileName) {
  const objectUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = objectUrl
  link.download = fileName || 'copyright-cert.pdf'
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(objectUrl)
}
