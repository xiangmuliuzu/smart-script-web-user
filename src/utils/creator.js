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
// 积分不足时面向 PC 用户的提示文案（AI 创作按实际 token 消耗直接扣积分）。
export const quotaTip = available => available > 0 ? '' : '积分不足，无法使用 AI 创作，请前往手机 App 的「福利中心」完成任务或观看广告获取积分后，再回来继续创作。'
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
const CHINESE_DIGITS = { 零: 0, 〇: 0, 一: 1, 壹: 1, 二: 2, 两: 2, 兩: 2, 贰: 2, 貳: 2, 三: 3, 叁: 3, 參: 3, 四: 4, 肆: 4, 五: 5, 伍: 5, 六: 6, 陆: 6, 陸: 6, 七: 7, 柒: 7, 八: 8, 捌: 8, 九: 9, 玖: 9 }
const CHINESE_UNITS = { 十: 10, 拾: 10, 百: 100, 佰: 100, 千: 1000, 仟: 1000 }
const NUMBER = '0-9零〇一壹二两兩贰貳三叁參四肆五伍六陆陸七柒八捌九玖十拾百佰千仟'
function chapterNumber(raw) {
  if (/^\d+$/.test(raw)) { const value = Number(raw); return Number.isSafeInteger(value) && value > 0 ? value : null }
  if (!/[十拾百佰千仟]/.test(raw)) { const value = Number([...raw].map(c => CHINESE_DIGITS[c]).join('')); return value > 0 ? value : null }
  let total = 0, digit = 0, lastUnit = 10000
  for (const char of raw) {
    if (char in CHINESE_DIGITS) digit = CHINESE_DIGITS[char]
    else {
      const unit = CHINESE_UNITS[char]
      if (!unit || unit >= lastUnit) return null
      total += (digit || 1) * unit; digit = 0; lastUnit = unit
    }
  }
  return total + digit || null
}
function chapterIdentity(title) {
  const normalized = String(title || '').normalize('NFKC').trim()
  const numbered = normalized.match(new RegExp(`^(?:第\\s*([${NUMBER}]+)\\s*[章节節集回]|([${NUMBER}]+)\\s*[章节節集回]|([${NUMBER}]+)\\s*[.、:：)）])\\s*(.*)$`))
  const number = numbered ? chapterNumber(numbered[1] || numbered[2] || numbered[3]) : null
  const name = (numbered ? numbered[4] : normalized).replace(/^[\s:：·、.\-—(（]+|[\s)）]+$/g, '').replace(/\s+/g, '')
  return { number, name, numbered: Boolean(numbered && number), explicit: Boolean(numbered && (numbered[1] || numbered[2])) }
}
// 按编号及名称匹配；同编号不同名称或多个候选视为冲突，不猜测。
export function matchOutlineChapter(title, chapters) {
  const wanted = chapterIdentity(title)
  const candidates = chapters.filter(chapter => {
    const current = chapterIdentity(chapter.chapterTitle)
    if (wanted.number && current.number) return wanted.number === current.number
    return Boolean(wanted.name && current.name && wanted.name === current.name)
  })
  if (candidates.length !== 1) return { chapter: null, conflict: candidates.length > 1 }
  const current = chapterIdentity(candidates[0].chapterTitle)
  if (wanted.name && current.name && wanted.name !== current.name) return { chapter: null, conflict: true }
  return { chapter: candidates[0], conflict: false }
}
// 只识别明确的章节标题；无法确定边界或编号重复时不自动写入。
export function outlineChapters(text) {
  const chapters = []
  const kinds = new Set()
  for (const line of String(text || '').split(/\r?\n/)) {
    const heading = line.trim().replace(/^#{1,6}\s*/, '').replace(/^\*\*(.*?)\*\*$/, '$1')
    if (chapterIdentity(heading).numbered) {
      kinds.add(chapterIdentity(heading).explicit ? 'explicit' : 'list')
      chapters.push({ title: heading, summary: '' })
    } else if (chapters.length) {
      chapters[chapters.length - 1].summary += line + '\n'
    }
  }
  for (const chapter of chapters) chapter.summary = chapter.summary.trim()
  const identities = chapters.map(chapter => chapterIdentity(chapter.title))
  const names = identities.map(identity => identity.name).filter(Boolean)
  if (kinds.size > 1 || chapters.some(chapter => chapter.title.length > 100 || !chapter.summary) || new Set(identities.map(identity => identity.number)).size !== chapters.length || new Set(names).size !== names.length) return []
  return chapters
}
// 新章由后端按现有最大序号追加，无法安全推断的情况一律交给作者处理。
export function planOutlineChapters(items, chapters) {
  const placeholder = chapters.length === 1 && !chapters[0].chapterId && chapters[0].chapterTitle === '第 1 集' && !documentText(chapters[0].content).trim() ? chapters[0] : null
  const invalid = chapters.some(chapter => chapter !== placeholder && (!chapter.chapterId || !Number.isSafeInteger(Number(chapter.chapterNo)) || Number(chapter.chapterNo) < 1))
  const existing = chapters.map(chapter => ({ chapter, number: chapter === placeholder ? 1 : Number(chapter.chapterNo), identity: chapterIdentity(chapter.chapterTitle) }))
  const claimed = new Set()
  let next = Math.max(0, ...existing.filter(x => x.chapter !== placeholder).map(x => x.number)) + 1
  return items.map(item => {
    const wanted = chapterIdentity(item.title)
    const result = (action, reason, chapter = null) => ({ ...item, action, reason, chapter })
    if (invalid) return result('conflict', '存在未保存或序号不明的章节，请先保存或处理')
    const candidates = existing.filter(x => x.number === wanted.number || x.identity.number === wanted.number || (wanted.name && x.identity.name === wanted.name))
    if (candidates.length > 1) return result('conflict', '多个已有章节的序号或名称匹配')
    if (candidates.length === 1) {
      const found = candidates[0]
      if (found.number !== wanted.number || (found.identity.number && found.identity.number !== found.number) || (wanted.name && found.identity.name && wanted.name !== found.identity.name)) return result('conflict', `与已有第 ${found.number} 章「${found.chapter.chapterTitle}」的序号或名称冲突`)
      if (claimed.has(found.chapter)) return result('conflict', '同一已有章节被多次匹配')
      claimed.add(found.chapter)
      if (documentText(found.chapter.content).trim()) return result('skip', '已有正文', found.chapter)
      if (found.chapter === placeholder) next = 2
      return result('fill', `填充已有第 ${found.number} 章「${found.chapter.chapterTitle}」`, found.chapter)
    }
    if (wanted.number !== next) return result('conflict', `不能按该序号追加；下一章实际序号为 ${next}`)
    next++
    return result('create', `新建第 ${wanted.number} 章`)
  })
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
