import { documentText } from './document.js'

export const workStates = {
  draft: { label: '草稿', tone: 'off', stamp: 'draft', action: '继续创作' },
  reviewing: { label: '审核中', tone: 'wait', stamp: 'review', action: '查看进度' },
  revision: { label: '待修改', tone: 'bad', stamp: 'revise', action: '修改并重新提交' },
  rejected: { label: '待修改', tone: 'bad', stamp: 'revise', action: '修改并重新提交' },
  published: { label: '已发布', tone: 'ok', stamp: 'passed', action: '审核记录' }
}
export const stateOf = status => workStates[status] || { label: '状态待确认', tone: 'off', stamp: 'draft', action: '查看详情' }
export const canEdit = (user, work) => user?.authorCapability === true && Object.hasOwn(workStates, work?.status) && work.status !== 'reviewing'
export const asList = data => Array.isArray(data) ? data : data?.list || data?.rows || []
export const wordCount = text => documentText(text).replace(/\s/g, '').length
export const words = value => Number(value || 0) >= 10000 ? (Number(value) / 10000).toFixed(1) + ' 万字' : Number(value || 0).toLocaleString('zh-CN') + ' 字'
export const money = value => '¥' + Number(value || 0).toLocaleString('zh-CN', { maximumFractionDigits: 2 })
export function dateText(value) {
  if (!value) return '—'
  if (typeof value === 'number' || /T.*(?:Z|[+-]\d{2}:?\d{2})$/.test(String(value))) {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return '—'
    return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Hong_Kong', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date)
  }
  return String(value).replace('T', ' ').slice(0, 16)
}
export function validateWork(form) {
  if (!form.title?.trim()) return '请输入书名'
  if (form.title.trim().length > 100) return '书名最多 100 字'
  if (!(Number(form.genreId) > 0)) return '请选择分类'
  return ''
}
export function validateChapter(form) {
  if (!form.chapterTitle?.trim()) return '请输入章节标题'
  if (form.chapterTitle.trim().length > 100) return '章节标题最多 100 字'
  if (!documentText(form.content).trim()) return '请输入正文或上传草稿'
  return ''
}
export function validateFile(file, extensions, maxMB = 10) {
  if (!file || !extensions.includes(file.name.split('.').pop().toLowerCase())) return '请选择 ' + extensions.map(e => '.' + e).join(' / ') + ' 文件'
  if (!file.size) return '文件为空，请重新选择'
  if (file.size > maxMB * 1024 * 1024) return `文件不能超过 ${maxMB} MB`
  return ''
}
