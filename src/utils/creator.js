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
// AI 次数不足时面向 PC 用户的提示文案（PC 端不可直接兑换，需引导到手机 App）。
export const quotaTip = available => available > 0 ? '' : 'AI 次数已用完，请前往手机 App 的「福利中心」兑换 AI 次数后，再回来继续创作。'
export const asList = data => Array.isArray(data) ? data : data?.list || data?.rows || []
const OUTLINE_LABELS = { title: '书名', logline: '一句话简介', summary: '简介', characters: '角色', roles: '角色', acts: '剧情', plot: '剧情', chapters: '章节', setting: '背景设定', worldview: '世界观', ending: '结局', theme: '主题', role: '身份', beats: '关键情节', intro: '简介', content: '内容', genre: '题材', style: '风格' }
const STORY_SEQUENCES = new Set(['acts', 'plot', 'chapters', 'scenes', 'steps', 'outline', 'development'])
function outlineLabel(key, parentKey) {
  if (key === 'name') return parentKey === 'characters' ? '角色名' : parentKey === 'acts' ? '幕名' : '名称'
  return OUTLINE_LABELS[key] || key
}
// 大纲接口返回 JSON 对象，这里转成「字段：值」可读文本（与后端落库格式一致），避免直接展示 JSON。
export function outlineToText(value) {
  const lines = []
  appendOutline(lines, value, 0, null)
  return lines.join('\n').trim()
}
function appendOutline(lines, node, depth, parentKey) {
  if (node == null) return
  if (Array.isArray(node)) { for (const item of node) appendOutline(lines, item, depth + 1, parentKey); return }
  if (typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      const label = outlineLabel(key, parentKey)
      const indent = '  '.repeat(depth)
      if (Array.isArray(value)) {
        const scalar = value.every(x => !(x && typeof x === 'object'))
        lines.push(indent + label)
        if (!value.length) continue
        if (scalar && STORY_SEQUENCES.has(key)) { for (const item of value) lines.push(indent + '  ' + item) }
        else if (scalar) { const last = lines.pop(); lines.push(last + value.join('、')) }
        else appendOutline(lines, value, depth + 1, key)
      } else if (value && typeof value === 'object') { lines.push(indent + label); appendOutline(lines, value, depth + 1, key) }
      else if (value !== null && value !== undefined && value !== '') lines.push(indent + label + '：' + value)
    }
    return
  }
  lines.push('  '.repeat(depth) + String(node))
}
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
