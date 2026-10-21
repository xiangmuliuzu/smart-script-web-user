/** 印章模块文案与字段辅助（对齐 App seal_models）。 */

export const reviewStatusLabel = status => ({ pending: '审核中', approved: '审核通过', rejected: '审核驳回' }[status] || status || '未知')
export const sealStatusLabel = status => ({ enabled: '启用', disabled: '停用', abnormal: '异常' }[status] || status || '未知')
export const operationTypeLabel = type => ({
  submit: '提交',
  review_approve: '审核通过',
  review_reject: '审核驳回',
  enable: '启用',
  disable: '停用',
  resolve_abnormal: '处理异常'
}[type] || type || '未知操作')

export const reviewTone = status => ({ pending: 'wait', approved: 'ok', rejected: 'bad' }[status] || 'off')
export const sealTone = status => ({ enabled: 'ok', disabled: 'off', abnormal: 'bad' }[status] || 'off')

export const canDisable = seal => seal?.sealStatus === 'enabled'
export const needsDisableBeforeEdit = seal => seal?.sealStatus === 'enabled'

/** 从资源地址里取出文件名（后端只存 URL，不存原始名时的兜底展示）。 */
export function fileNameFromUrl(url) {
  if (!url) return ''
  try {
    const path = String(url).split('?')[0].split('#')[0]
    const name = decodeURIComponent(path.substring(path.lastIndexOf('/') + 1) || '')
    return name || ''
  } catch {
    return ''
  }
}

/** 材料列表项：{ url, name }。后端只存逗号分隔 URL，name 优先用上传时的原始名。 */
export function materialItems(value) {
  if (!value) return []
  let list = []
  if (Array.isArray(value)) list = value
  else {
    try { list = JSON.parse(value) } catch { list = String(value).split(',') }
  }
  return list.map((item, index) => {
    if (item && typeof item === 'object') {
      const url = String(item.url || '').trim()
      if (!url) return null
      return { url, name: item.name || item.fileName || fileNameFromUrl(url) || `材料 ${index + 1}` }
    }
    const url = String(item || '').trim()
    if (!url) return null
    return { url, name: fileNameFromUrl(url) || `材料 ${index + 1}` }
  }).filter(Boolean)
}

/** 材料 URL：后端存逗号分隔字符串，兼容数组。 */
export function materialUrlList(value) {
  return materialItems(value).map(item => item.url)
}

export function joinMaterialUrls(items) {
  return (items || []).map(item => {
    if (item && typeof item === 'object') return String(item.url || '').trim()
    return String(item || '').trim()
  }).filter(Boolean).join(',')
}

function fileExt(value) {
  if (!value) return ''
  const clean = String(value).split('?')[0].split('#')[0].toLowerCase()
  const match = clean.match(/\.([a-z0-9]+)$/)
  return match ? match[1] : ''
}

export const isImageExt = ext => ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'].includes(ext)
export const isPdfExt = ext => ext === 'pdf'
export const isTextExt = ext => ['txt', 'md', 'csv', 'json', 'log'].includes(ext)
export const materialKind = url => {
  const ext = fileExt(url)
  if (isImageExt(ext)) return 'image'
  if (isPdfExt(ext)) return 'pdf'
  if (isTextExt(ext)) return 'text'
  if (['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext)) return 'office'
  return 'other'
}
