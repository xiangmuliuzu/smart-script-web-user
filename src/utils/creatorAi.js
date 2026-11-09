import { outlineChapters } from './creator.js'

// 换行统一走常量，避免工具转义。
const LINE_BREAK = String.fromCharCode(10)

/** 生成大纲时要求的分集标题格式（与 AiStudio 的 AI 剧本 tab 一致）。 */
export function outlineRequest(episodes) {
  return `请提供 ${episodes} 个分集，每集单独一行标题，格式为“第1集：章节名称”，下一行写该集剧情概要。`
}

/** 书名 + 灵感拼成大纲接口的 inspiration 入参。 */
export function outlineInspiration({ title, idea, episodes }) {
  const lines = []
  if (title?.trim()) lines.push(`书名：${title.trim()}`)
  if (idea?.trim()) lines.push(`故事灵感：${idea.trim()}`)
  return `${lines.join('\n')}\n${outlineRequest(episodes)}`.trim()
}

// 大纲里「一句话简介 / 简介」这类行优先作为作品简介。
const SUMMARY_LABEL = /^(?:一句话简介|剧情简介|故事简介|简介|logline)\s*[:：]\s*(.+)$/i
const SKIP_LABEL = /^(?:书名|角色|人物|题材|风格|主题|背景设定|世界观|结局)\s*[:：]/
const LIST_TITLE = /^(?:第\s*[\d零〇一壹二两兩贰貳三叁參四肆五伍六陆陸七柒八捌九玖十拾百佰千仟]+\s*[章节節集回]|[\d零〇一壹二两兩贰貳三叁參四肆五伍六陆陸七柒八捌九玖十拾百佰千仟]+\s*[.、:：)）]|#{1,6}\s)/

/**
 * 流式生成中的宽松分集扫描：与 outlineChapters 不同，它允许缺失概要、
 * 尚未写完的标题，只用于「已出现第几集」的进度反馈，不用于建章。
 */
export function listOutlineChapters(text) {
  const chapters = []
  for (const line of String(text || '').split(/\r?\n/)) {
    const heading = line.trim().replace(/^#{1,6}\s*/, '').replace(/^\*\*(.*?)\*\*$/, '$1')
    if (!heading) continue
    if (LIST_TITLE.test(heading)) {
      chapters.push({ title: heading.replace(/[：:]\s*$/, ''), summary: '' })
    } else if (chapters.length) {
      chapters[chapters.length - 1].summary += line.trim()
    }
  }
  return chapters
}

/**
 * 从可读大纲文本里取一段作品简介，供创建作品时填写 summary。
 * 优先带「简介」标签的行，其次第一段非标题、非角色字段的普通文本；都没有时用第一个分集概要。
 */
export function outlineSummary(text, limit = 200) {
  const lines = String(text || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  let picked = ''
  for (const line of lines) {
    const match = line.replace(/^[-*]\s*/, '').match(SUMMARY_LABEL)
    if (match) { picked = match[1].trim(); break }
  }
  if (!picked) {
    const chapterTitles = new Set(outlineChapters(text).map(chapter => chapter.title))
    picked = lines.find(line => !chapterTitles.has(line) && !SKIP_LABEL.test(line) && !outlineChapters(line).length) || ''
  }
  if (!picked) picked = outlineChapters(text).find(chapter => chapter.summary)?.summary || ''
  picked = picked.replace(/^[-*]\s*/, '').replace(/\s+/g, ' ').trim()
  return picked.length > limit ? picked.slice(0, limit) : picked
}

/** 单章正文生成提示词（与创作工作台「按大纲生成各章」保持一致）。 */
export function chapterWritePrompt({ title, summary, outline }) {
  return [
    `请根据以下完整大纲，为“${title}”创作正文，只写这一章。`,
    `完整大纲：\n${outline}`,
    `本章剧情概要：\n${summary}`
  ].join('\n')
}

/** 单章达到生成长度上限后的续写提示词，basedOnText 取已生成正文末尾。 */
export function chapterContinuePrompt({ title, summary, outline, basedOnText }) {
  return [
    `请根据大纲和本章概要，从已有正文的末尾接着写完“${title}”。不要重复已有正文，不要写其他章节。`,
    `完整大纲：\n${outline}`,
    `本章概要：\n${summary}`,
    `已有正文末尾：\n${basedOnText}`
  ].join('\n')
}

// ── 大纲局部修订 ──
/** 从大纲文本里找出与选中文字对应的段落（按行定位，跨行选择时含首尾行）。 */
export function locateOutlineRange(text, start, end) {
  const source = String(text || '')
  const safeStart = Math.max(0, Math.min(Number(start) || 0, source.length))
  const safeEnd = Math.max(safeStart, Math.min(Number(end) || 0, source.length))
  if (!source.trim() || safeStart === safeEnd) return null
  const lineStart = source.lastIndexOf(LINE_BREAK, Math.max(0, safeStart - 1)) + 1
  const nextBreak = source.indexOf(LINE_BREAK, safeEnd)
  const lineEnd = nextBreak === -1 ? source.length : nextBreak
  const passage = source.slice(lineStart, lineEnd)
  return { start: lineStart, end: lineEnd, passage, length: passage.length }
}

/** 大纲整体摘要（正文前若干行），供局部修订时让 AI 保持前后一致。 */
export function outlineContext(text, limit = 1200) {
  const source = String(text || '').trim()
  return source.length > limit ? source.slice(0, limit) : source
}

/** 局部修订提示词：只输出替换原文的段落，不解释、不重写整份大纲。 */
export function outlineRevisePrompt({ passage, instruction, context }) {
  return [
    '下面是一份剧本大纲中的一段内容，作者认为这部分不合理，请按作者意见只重写这一段。',
    '要求：保持分集编号与标题格式（如「第一集：章节名称」）、保持与其他分集的前后衔接；只输出重写后的这一段文字，不要输出整份大纲，不要解释、不要前后缀、不要 Markdown。',
    '',
    '【大纲上下文（仅供理解，不要重写）】',
    context || '（无）',
    '',
    '【需要重写的段落】',
    passage,
    '',
    '【作者意见】',
    instruction
  ].join(LINE_BREAK)
}

/** 流式替换时的中间态预览（最多取前 limit 字）。 */
export function previewPassage(text, limit = 600) {
  const source = String(text || '').trim()
  return source.length > limit ? source.slice(0, limit) + '…' : source
}

/** 替换段落的清洗：模型偶尔会连上一行的分集标题一起回显，去掉重复的那一行。 */
export function stripEchoedHeading(source, start, text) {
  const before = String(source || '').slice(0, start)
  const head = before.endsWith(LINE_BREAK) ? before.slice(0, -1) : before
  const prevLine = head.slice(head.lastIndexOf(LINE_BREAK) + 1).trim()
  const breakIndex = text.indexOf(LINE_BREAK)
  const firstLine = (breakIndex === -1 ? text : text.slice(0, breakIndex)).trim()
  if (prevLine && firstLine === prevLine) {
    const rest = breakIndex === -1 ? '' : text.slice(breakIndex + 1)
    return rest.trim()
  }
  return text
}

// ── 从 AI 使用记录还原一次 AI 创作会话 ──
/** 解析本页大纲请求落库的输入文本（灵感 / 类型 / 风格），还原设定；不是本页格式时返回 null。 */
export function parseAiCreateOutlineInput(input) {
  const text = String(input || '')
  if (!text.includes('灵感：')) return null
  const lines = text.split(LINE_BREAK)
  const pick = label => (lines.find(item => item.startsWith(label + '：')) || '').slice(label.length + 1).trim()
  // 「灵感：」后面可能紧跟多行（书名 / 故事灵感 / 格式要求 / 风格），拼回一段再解析。
  const firstIndex = lines.findIndex(item => item.startsWith('灵感：'))
  const inspirationLines = [lines[firstIndex].slice('灵感：'.length)]
  for (let i = firstIndex + 1; i < lines.length; i++) {
    if (lines[i].startsWith('类型：') || lines[i].startsWith('风格：')) break
    inspirationLines.push(lines[i])
  }
  const inspiration = inspirationLines.join(LINE_BREAK)
  const title = (inspiration.match(/书名：(.+)/) || [])[1]?.trim() || ''
  const idea = (inspiration.split('故事灵感：')[1] || '').split('请提供')[0].trim()
  const episodeMatch = inspiration.match(/请提供\s*(\d+)\s*个分集/) || text.match(/共\s*(\d+)\s*集/)
  const episodes = Number(episodeMatch?.[1])
  if (!title && !idea) return null
  return { title, idea, genre: pick('类型'), episodes: Number.isInteger(episodes) && episodes > 0 ? episodes : 12 }
}

/** 从章节生成提示词里取出这一章的标题（本页与工作台共用同一措辞）。 */
export function chapterTitleFromPrompt(input) {
  return (String(input || '').match(/为“(.+?)”创作正文/) || [])[1]?.trim() || ''
}

/**
 * 在 AI 记录（按时间倒序）里找最近一次 AI 创作会话：
 * 一条符合本页格式的大纲记录 + 它之后（更晚）生成的章节记录。
 */
/**
 * 从 AI 记录还原一次 AI 创作会话：给定大纲记录（或按记录里最新的一条），
 * 取它之后生成的章节记录。recordId 自增，跨设备与同秒记录都能正确区分先后。
 */
export function buildAiCreateSession(records, outlineRecord = null) {
  const list = records || []
  const outline = outlineRecord || list.find(record => record.type === 'outline' && parseAiCreateOutlineInput(record.input))
  if (!outline) return null
  const setup = parseAiCreateOutlineInput(outline.input)
  if (!setup) return null
  const after = record => outline.recordId != null && record.recordId != null
    ? Number(record.recordId) > Number(outline.recordId)
    : list.indexOf(record) < list.indexOf(outline)
  const chapters = list
    .filter(record => record.type === 'write' && after(record))
    .map(record => ({ title: chapterTitleFromPrompt(record.input), content: record.output || '', recordId: record.recordId }))
    .filter(chapter => chapter.title && chapter.content)
    .sort((a, b) => Number(a.recordId || 0) - Number(b.recordId || 0))
  // 第一段必须有非空 chapterId，前端据此显示章节区；它是恢复编号，不落库。
  const recovered = chapters.map((chapter, index) => ({ title: chapter.title, content: chapter.content, chapterId: index === 0 && outline.recordId != null ? Number(outline.recordId) : null }))
  return { setup, outline: outline.output || '', chapters: recovered, createdAt: outline.createdAt }
}

// AI 创作页生成的章节正文记录标记：写进 sys_ai_write_record.input_prompt 前缀，
// 删除大纲记录时后端按它级联清掉这一会话的章节，不用新增表结构。
export const AI_CREATE_MARK = '[AI创作]'
export const markAiCreatePrompt = prompt => AI_CREATE_MARK + ' ' + String(prompt || '')

/**
 * 把原始 AI 记录合并成「一次创作一条」：大纲记录 + 它之后标记为本页生成的章节记录。
 * 返回按时间倒序的记录组，未归属大纲的独立记录保持单独一条。
 * @param {Array} records listAiRecords() 的结果（已按时间倒序）
 */
export function groupAiCreateRecords(records) {
  const list = records || []
  const outlines = list.filter(record => record.type === 'outline' && parseAiCreateOutlineInput(record.input))
  // 每一条本页章节归给「它之前最近的一次大纲」（recordId 更大即更近）。
  const ownerOf = new Map()
  for (const record of list) {
    if (record.type !== 'write' || !String(record.output || '').startsWith(AI_CREATE_MARK)) continue
    const owner = outlines
      .filter(outline => outline.recordId == null || record.recordId == null || Number(outline.recordId) < Number(record.recordId))
      .sort((a, b) => Number(b.recordId || 0) - Number(a.recordId || 0))[0]
    if (owner) ownerOf.set(record.recordId, owner)
  }
  const groups = []
  list.forEach((record, index) => {
    if (ownerOf.has(record.recordId)) return
    if (outlines.includes(record)) {
      const chapters = list
        .filter(item => ownerOf.get(item.recordId) === record)
        .map(item => ({ recordId: item.recordId, title: chapterTitleFromPrompt(item.input) || '章节正文', content: (item.output || '').slice(AI_CREATE_MARK.length).trim() }))
        .sort((a, b) => Number(a.recordId || 0) - Number(b.recordId || 0))
      groups.push({
        id: 'outline-' + record.recordId,
        kind: 'session',
        record,
        outlineRecord: record,
        chapters,
        tokenRecords: [record, ...chapters.map(chapter => list.find(item => item.recordId === chapter.recordId))],
        createdAt: record.createdAt,
        tokens: [record, ...list.filter(item => ownerOf.get(item.recordId) === record)].reduce((sum, item) => sum + (Number(item.tokens) || 0), 0)
      })
      return
    }
    groups.push({ id: 'record-' + index, kind: 'single', record, tokenRecords: [record], createdAt: record.createdAt, tokens: Number(record.tokens) || 0 })
  })
  return groups
}
