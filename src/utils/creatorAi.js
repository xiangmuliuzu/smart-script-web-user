import { outlineChapters } from './creator.js'
import { documentText } from './document.js'

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
export function chapterWritePrompt({ title, summary, outline, guard }) {
  const parts = [
    `请根据以下完整大纲，为“${title}”创作正文，只写这一章。`,
    `完整大纲：\n${outline}`,
    `本章剧情概要：\n${summary}`
  ]
  if (guard) parts.push(String(guard))
  return parts.join('\n')
}

/** 单章达到生成长度上限后的续写提示词，basedOnText 取已生成正文末尾。 */
export function chapterContinuePrompt({ title, summary, outline, basedOnText, guard }) {
  const parts = [
    `请根据大纲和本章概要，从已有正文的末尾接着写完“${title}”。不要重复已有正文，不要写其他章节。`,
    `完整大纲：\n${outline}`,
    `本章概要：\n${summary}`,
    `已有正文末尾：\n${basedOnText}`
  ]
  if (guard) parts.push(String(guard))
  return parts.join('\n')
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

// ── 创作台账与续写注入（跨端共享：人物卡/关系/伏笔/时间线/道具/写法/未解线索） ──

/**
 * 台账注入块：道具档案与写法基线整段前置（它们是「主数据」，截断会让件数与文风失锚），
 * 其余流水类各取尾部（台账是追加式，最新事实在末尾，从头截只会注入第 1 集旧状态）。
 * 每类预算 = 剩余额度/6，超长标「（前略）」保留标签，避免只剩半句。
 */
export function ledgerPromptBlock(ledger, limit = 2400) {
  const source = ledger || {}
  const props = String(source.props || '').trim()
  const styleGuide = String(source.styleGuide || '').trim()
  const parts = []
  if (props) {
    parts.push(`【重要道具档案（件数、持有人、是否已交付以它为准，不得改数）】\n${props.length > 1400 ? props.slice(0, 1400) : props}`)
  }
  if (styleGuide) {
    parts.push(`【写法基线（沿用既有文风，不得中途换叙述方式）】\n${styleGuide.length > 400 ? styleGuide.slice(0, 400) : styleGuide}`)
  }
  const fields = [
    ['主要人物', source.characters],
    ['人物关系', source.relations],
    ['伏笔（埋在哪集/是否回收）', source.foreshadow],
    ['时间线', source.timeline],
    ['物品位置（逐集去向）', source.items],
    ['未解线索', source.threads],
  ]
  const remaining = Math.max(600, limit - props.length - styleGuide.length)
  const perField = Math.max(120, Math.floor(remaining / fields.length))
  const lines = fields
    .filter(([, value]) => String(value || '').trim())
    .map(([label, value]) => {
      const text = String(value).trim()
      return `${label}：\n${text.length > perField ? '（前略）' + text.slice(-perField) : text}`
    })
  if (!parts.length && !lines.length) return ''
  if (lines.length) parts.push('【创作台账（已定事实，不得冲突）】\n' + lines.join('\n\n'))
  const text = parts.join('\n\n')
  // 截断保留头部：道具档案与写法基线在前，绝不能被尾部流水挤掉。
  return text.length > limit + 400 ? text.slice(0, limit + 400) : text
}

/** 从本集事件卡里取「本集出场：A、B」名单。 */
export function episodeCastFrom(card) {
  const match = String(card || '').match(/本集出场[：:]\s*(.+)/)
  if (!match) return []
  return match[1]
    .split(/[、，,／/；;]+/)
    .map(name => name.trim())
    .filter(Boolean)
    .slice(0, 6)
}

/**
 * 按出场人物筛选注入：人物卡与关系只保留本集出场者，其余四类（伏笔/时间线/道具/线索）仍全量。
 * 这是 50 集量级的关键——设定库保留全量，正文只注入本集需要的 2-4 人。
 */
export function ledgerPromptBlockByCast(ledger, cast, limit = 1600) {
  const names = (cast || []).filter(Boolean)
  if (!names.length) return ledgerPromptBlock(ledger, limit)
  const source = ledger || {}
  const hitLines = (text) => String(text || '')
    .split(/\n/)
    .map(line => line.trim())
    .filter(line => line && names.some(name => line.includes(name)))
    .join('\n')
  let characters = hitLines(source.characters)
  if (!characters) characters = String(source.characters || '').trim().slice(-700)
  let relations = hitLines(source.relations)
  const parts = []
  if (characters) parts.push(`【本集出场人物（只写这几人，勿写未出场人物）】\n${characters}`)
  if (relations) parts.push(`【相关关系（仅本集出场人物）】\n${relations}`)
  const rest = ledgerPromptBlock({
    foreshadow: source.foreshadow,
    timeline: source.timeline,
    items: source.items,
    props: source.props,
    styleGuide: source.styleGuide,
    threads: source.threads,
  }, Math.max(900, limit - 900))
  if (rest) parts.push(rest)
  if (!parts.length) return ''
  const text = parts.join('\n\n')
  // 保留头部：出场人物与道具档案在前，不能被尾部的台账流水挤掉。
  return text.length > limit ? text.slice(0, limit) : text
}

/**
 * 卷级状态快照：每 10 集一卷，注入「本卷快照 + 上卷快照」，替代整份台账全文。
 * 本卷是当前事实，上卷只作背景；未生成快照时返回空串，回退台账。
 */
export function volumeSnapshotBlock(volumes, chapterNo, limit = 1600) {
  const list = Array.isArray(volumes) ? volumes : []
  const volumeNo = Math.ceil(Number(chapterNo || 1) / 10)
  const snapshotOf = (no) => {
    const hit = list.find(item => Number(item.volumeNo) === Number(no))
    return String(hit?.snapshot || '').trim()
  }
  const parts = []
  const current = snapshotOf(volumeNo)
  if (current) parts.push(`【本卷状态（第${volumeNo}卷，当前事实以此为准）】\n${current.slice(-800)}`)
  const previous = volumeNo > 1 ? snapshotOf(volumeNo - 1) : ''
  if (previous) parts.push(`【上卷状态（第${volumeNo - 1}卷，仅作背景，不得与本卷冲突）】\n${previous.slice(-800)}`)
  if (!parts.length) return ''
  const text = parts.join('\n\n')
  return text.length > limit ? text.slice(-limit) : text
}

/** 从整份大纲里取某一集的事件卡：先按集号，再按集名匹配。 */
export function episodeCardFrom(outline, chapterTitle, chapterNo) {
  const text = String(outline || '')
  const heads = []
  const re = /^第\s*(\d{1,3})\s*集[：:]/gm
  let match
  while ((match = re.exec(text))) heads.push({ no: Number(match[1]), index: match.index })
  if (!heads.length) return ''
  const blocks = heads.map((head, index) => ({
    no: head.no,
    text: text.slice(head.index, index + 1 < heads.length ? heads[index + 1].index : text.length).trim(),
  }))
  const byNo = blocks.find(block => Number(chapterNo) > 0 && block.no === Number(chapterNo))
  if (byNo) return byNo.text
  const name = String(chapterTitle || '').replace(/^第\s*\S+?\s*[集章][：:·\s]*/, '').trim()
  return (name && blocks.find(block => block.text.includes(name))?.text) || ''
}

/**
 * 最近几章已落库的摘要（跨章连贯锚点）：只取当前集之前的章节，最多 6 章、合计 ≤1800 字。
 * 50 集量级下 4 章太短，回溯不到上一卷的关系变化；摘要本身每章 ≤500 字，这里再从后往前累加。
 */
export function chapterSummaryBlock(chapters, currentNo, limit = 1800) {
  const list = (chapters || [])
    .map((chapter, index) => ({
      ...chapter,
      no: Number(chapter?.chapterNo || (String(chapter?.chapterTitle || '').match(/第\s*(\d{1,3})\s*集/) || [])[1] || index + 1)
    }))
    .filter(chapter => chapter.no < Number(currentNo || 0) && String(chapter.summary || '').trim())
    .sort((a, b) => a.no - b.no)
    .slice(-6)
  if (!list.length) return ''
  const lines = list.map(chapter => `第${chapter.no}集：${String(chapter.summary).trim()}`)
  // 从最近一章往前累加，保证整章摘要不被切半句。
  let text = ''
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const next = text ? `${lines[i]}\n${text}` : lines[i]
    if (next.length > limit) break
    text = next
  }
  return text ? `【前情摘要（已发生事实，勿重复交代）】\n${text}` : ''
}

/** 上一章正文末尾（默认 800 字），用作续写的承接锚点；过长会挤占模型输出额度。 */
export function chapterTail(content, limit = 800) {
  const text = String(content || '').trim()
  return text.length > limit ? text.slice(-limit) : text
}

/**
 * 续写提示词：本集事件卡（含本集出场）→ 卷快照 → 前情摘要 → 出场人物设定 → 上一章末尾 → 本集已有正文 → 作者要求。
 * 卷快照优先；没有快照时台账兜底，且台账按出场人物筛选。
 */
export function continuationPrompt({ title, chapterNo, outline, ledger, volumes, prevChapter, prevSummaries, currentContent, requirement }) {
  const card = episodeCardFrom(outline, title, chapterNo)
  const cast = episodeCastFrom(card)
  const volumeText = volumeSnapshotBlock(volumes, chapterNo)
  const ledgerText = ledgerPromptBlockByCast(ledger, cast)
  const parts = [`请续写“${title || '本集'}”，只写这一集，以动作和对白推进，700-900 字，结尾留一个具体钩子。`]
  if (card) parts.push(`【本集事件卡】\n${card}`)
  if (volumeText) parts.push(volumeText)
  if (prevSummaries) parts.push(prevSummaries)
  if (ledgerText) parts.push(ledgerText)
  const schedule = threadScheduleBlock(ledger && ledger.threads, chapterNo)
  if (schedule) parts.push(schedule)
  const prev = chapterTail(prevChapter)
  if (prev) parts.push(`【上一章末尾（承接语气与处境，勿重复）】\n${prev}`)
  const current = documentText(currentContent)
  if (current) parts.push(`【本集已有正文（从末尾接着写）】\n${chapterTail(current, 1500)}`)
  if (String(requirement || '').trim()) parts.push(`【本集要求】\n${String(requirement).trim()}`)
  return parts.join('\n\n')
}

/**
 * 规则版生成后核查（模型档暂缓）：只提示、不阻断。
 * 覆盖：大纲集号连续与重复、每集五项是否齐全、正文空/过短。
 */
export function checkGenerationRules({ outline, chapters, ledger }) {
  const issues = []
  const heads = []
  const re = /^第\s*(\d{1,3})\s*集[：:]/gm
  const source = String(outline || '')
  let match
  while ((match = re.exec(source))) heads.push(Number(match[1]))
  if (!heads.length) {
    issues.push('大纲里没有识别到「第N集：」标题，正文会缺少事件卡依据')
  } else {
    if (new Set(heads).size !== heads.length) issues.push('大纲存在重复集号')
    heads.forEach((no, index) => { if (no !== index + 1) issues.push(`大纲集号不连续：第 ${index + 1} 个标题是第 ${no} 集`) })
    const blocks = source.split(/^第\s*\d{1,3}\s*集[：:]/gm).slice(1)
    blocks.forEach((block, index) => {
      ;['本集事件', '冲突与推进', '结果或反转', '结尾钩子'].forEach(label => {
        if (!block.includes(label)) issues.push(`第 ${heads[index] || index + 1} 集缺少「${label}」`)
      })
    })
  }
  ;(chapters || []).forEach((chapter, index) => {
    const text = documentText(chapter.content)
    if (!text.trim()) issues.push(`第 ${index + 1} 集正文为空`)
    else if (text.length < 500) issues.push(`第 ${index + 1} 集正文偏短（${text.length} 字）`)
  })
  if (!ledger || !String(ledger.characters || '').trim()) issues.push('人物卡为空，续写时没有人物口径可注入')
  return issues
}

// ── 人/事/物一致性：提示词铁律 + 生成后核查 ──

const NAME_PATTERN = /([\u4e00-\u9fa5]{2,3})[（(][0-9]{1,3}\s*岁/g

// 常见姓氏：只用于「正文是否冒出名单外的人名」的粗筛，命中只提示、不改写正文。
const COMMON_SURNAMES = '王李张刘陈杨黄赵吴周徐孙马朱胡郭何高林罗郑梁谢宋唐许韩冯邓曹彭曾肖田董袁潘蒋蔡余杜叶程苏魏吕丁任沈姚卢姜崔钟谭陆汪范金石廖贾夏韦付方白邹孟熊秦邱江尹薛段雷侯龙史陶黎贺顾毛郝龚邵万钱严覃武戴莫孔向汤'
const NOT_A_NAME = /[家老院子屋门窗柜墙寨村店铺时候里上下前后之间们位个条面只把件]/

/** 从人物设定里提取正式人名（优先认「顾守山（62岁/男）」这种写法）。 */
export function rosterFromCharacters(characters) {
  const text = Array.isArray(characters) ? characters.join('\n') : String(characters || '')
  const names = []
  const push = (name) => {
    const value = String(name || '').trim()
    if (value.length >= 2 && value.length <= 4 && !names.includes(value)) names.push(value)
  }
  let match
  NAME_PATTERN.lastIndex = 0
  while ((match = NAME_PATTERN.exec(text))) push(match[1])
  return names.slice(0, 20)
}

/** 正文里出现、但不在人物名单里的疑似人名。 */
export function unknownNames(text, roster) {
  const body = String(text || '')
  const known = new Set((roster || []).filter(Boolean))
  // 已知人名在正文里的所有占位区间：落在区间内的窗口一律跳过，免得从「赵金凤」里切出「金凤在」。
  const spans = []
  known.forEach(name => {
    let index = body.indexOf(name)
    while (index >= 0) { spans.push([index, index + name.length]); index = body.indexOf(name, index + 1) }
  })
  const found = []
  for (let i = 0; i + 3 <= body.length; i += 1) {
    if (!COMMON_SURNAMES.includes(body[i])) continue
    if (spans.some(([start, end]) => i >= start && i < end)) continue
    const candidate = body.slice(i, i + 3)
    if (known.has(candidate) || found.includes(candidate)) continue
    if (NOT_A_NAME.test(candidate[1])) continue
    found.push(candidate)
  }
  return found.slice(0, 8)
}

/**
 * 人/事/物/写法铁律：规则在前、数据在后，截断只会丢数据尾部，不会丢规则。
 *
 * 写法是正面约束：先要求「承接上一集最后一个动作」，再给出三种允许直接换场的例外
 * （上集已收束 / 开启新的过渡事件 / 切换视角），而不是只说「禁止照抄」——
 * 纯负面约束会让模型把上一集结尾当成要避开的东西，反而写断。
 */
export function stateGuardBlock({ roster, items, props, timeline, styleGuide, limit = 1600 }) {
  const names = (roster || []).filter(Boolean)
  const clip = (text, size) => (String(text || '').trim().length > size ? String(text).trim().slice(0, size) : String(text || '').trim())
  const propText = clip(props, 1100)
  const itemText = clip(items, 240)
  const eventText = clip(timeline, 320)
  const styleText = clip(styleGuide, 400)
  const lines = ['【铁律·人/事/物与写法必须连贯，违反即本集不合格】']
  lines.push(names.length
    ? `人物：主要角色只能写这些名字——${names.join('、')}；不得改名、不得另造主要角色、不得让不在场的人凭空到场。`
    : '人物：只能写前文已出场的人；不得改名、不得另造主要角色、不得让人凭空到场。')
  lines.push('配角：允许无名群众或只在本集露面的临时角色烘托气氛（如“吴德贵带来的年轻人”“米粉店里的食客”），但他们只能说闲话、围观、被支使，不得掌握关键线索、不得替主角做决定、不得推动主线、不得跨集复用；凡要承担主线动作或连续多集出现的人，必须已在人物列表里。')
  lines.push('道具：件数、持有人、完好状态一律沿用下面的道具档案，不得改数、不得凭空多出或少掉；'
    + '档案里已写「已交付给某某」的道具，本集不得再交付一次，也不得在没有「退回/夺回/丢失」情节的情况下回到原主手里；'
    + '本集事件卡没写“丢失/拿走/损坏/交出”，正文不得改变它的状态。')
  lines.push('状态过渡：本集开场必须回应上一集结尾最后一个动作或悬念（给出结果、推进到下一步，或用一句话交代它为何被搁置），不能当作没发生过；'
    + '允许该悬念跨集延续，不要求在本集收尾；人物、事件、道具的状态只能通过情节自然过渡发生变化；'
    + '只有三种情况可以直接换场——上一集事件已经收束、本集开启另一个过渡事件、本集切到另一视角继续同一事件；'
    + '除这三种，不得让人物立场、伤势、在场关系或道具归属在没有过渡的情况下突变。')
  lines.push('事件：只承接下列已发生的事实；本集事件卡规定的进程不得跳过，已发生的事不得再写一遍。')
  lines.push('写法：沿用下面的写法基线（人称、句式、对白比例、标点、段落），不得中途改成括注体、整段心理独白、场景头或镜头术语；'
    + '文风一旦变化，读者会以为换了写手。')
  const data = []
  if (propText) data.push(`【重要道具档案（件数与归属以它为准）】\n${propText}`)
  if (itemText) data.push(`【物品位置（逐集去向）】\n${itemText}`)
  if (eventText) data.push(`【已发生事件（沿用）】\n${eventText}`)
  if (styleText) data.push(`【写法基线（沿用）】\n${styleText}`)
  if (data.length) lines.push('', ...data)
  const text = lines.join('\n')
  return text.length > limit ? text.slice(0, limit) : text
}

/**
 * 悬念排期：把未解线索按「计划兑现点」分成「本集必须处理」与「背景（不得提前解决）」。
 *
 * 兑现点统一写成「第N集」，取行内最后一个集号；无集号或未写「已结」的条目只作背景，
 * 长线悬念（如三年之约）不会因为写到了下一集就被迫收线。
 */
export function threadScheduleBlock(threads, currentNo) {
  const lines = String(threads || '').split('\n').map(line => line.trim()).filter(Boolean)
  if (!lines.length) return ''
  const due = []
  const later = []
  lines.forEach(raw => {
    const line = raw.replace(/^(未解线索|线索)[：:]/, '').trim()
    if (!line || line.includes('已结') || line.includes('已回收') || line.includes('已兑现')) return
    const matches = [...line.matchAll(/第\s*(\d{1,3})\s*集/g)]
    const dueNo = matches.length ? Number(matches[matches.length - 1][1]) : 0
    if (dueNo > 0 && dueNo <= Number(currentNo || 0)) due.push(line)
    else later.push(line)
  })
  const parts = []
  if (due.length) {
    parts.push(`【本集必须处理（已到期未结的悬念/约定）】\n${due.map(line => `- ${line}`).join('\n')}\n`
      + '这些项在本集必须给出进展或结果，不能整集不提；若本集事件卡没安排，就用一到两句交代推进到哪一步。')
  }
  if (later.length) {
    parts.push(`【背景悬念（未到期，不得提前解决）】\n${later.map(line => `- ${line}`).join('\n')}\n`
      + '这些项只需保持存在感（可提一句、可作动机），不得在本集提前收线或给出答案。')
  }
  return parts.join('\n\n')
}

/** 中文/阿拉伯数字转数值（覆盖 1–999 常用写法；解析不出返回 0）。 */
export function cnToNumber(raw) {
  const text = String(raw || '').trim()
  if (/^\d{1,4}$/.test(text)) return Number(text)
  if (!text || !/^[零一二三四五六七八九十百]+$/.test(text)) return 0
  const DIGITS = { 零: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 }
  let section = 0
  let num = 0
  for (const ch of text) {
    if (ch === '百') { section += (num || 1) * 100; num = 0 }
    else if (ch === '十') { section += (num || 1) * 10; num = 0 }
    else num = DIGITS[ch] ?? 0
  }
  return section + num
}

/**
 * 解析重要道具档案：一行一件，「名称｜件数｜持有人｜状态｜外观」。
 * 手写时也容忍空格分隔或不带分隔符的单行，解析不出的字段留空。
 */
export function parseProps(props) {
  return String(props || '')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const cells = line.split(/[｜|]/).map(cell => cell.trim())
      return {
        name: cells[0] || '',
        count: cells[1] || '',
        holder: cells[2] || '',
        status: cells[3] || '',
        raw: line,
      }
    })
    .filter(prop => prop.name)
}

/** 从「十二面」「1把」里取数字与单位。 */
export function countOfProp(countText) {
  const text = String(countText || '')
  const number = text.match(/[零一二三四五六七八九十百0-9]+/)
  const unit = text.match(/[面把件张个只副口箱份套本页]/)
  return {
    value: number ? cnToNumber(number[0]) : 0,
    unit: unit ? unit[0] : '',
  }
}

/**
 * 生成后核查：出场名单、名单外人物、道具件数与重复交付、写法漂移。只提示、不改写。
 *
 * 名单外人物分两级：只在本集出现一次的视为临时配角（允许烘托气氛，不报）；
 * 同一名字跨两集以上复用的，说明模型已经把它当固定角色在写，会挤占主线，必须提示补进人物便签或删掉。
 * strangerUsage 传一个跨集复用的 Map<name, 已出现集数>，本函数负责累加。
 */
export function auditEpisodeState({ text, cast, roster, props, strangerUsage }) {
  const body = String(text || '')
  const issues = []
  ;(cast || []).filter(Boolean).forEach(name => {
    if (!body.includes(name)) issues.push(`出场名单里的「${name}」在正文中没出现`)
  })
  const strangers = unknownNames(body, roster)
  if (strangers.length) {
    const repeated = strangers.filter(name => (Number(strangerUsage?.get(name)) || 0) >= 2)
    if (repeated.length) issues.push(`名单外人物跨集复用，已挤进主线：${repeated.join('、')}（请加入人物便签或删掉）`)
    if (strangerUsage) strangers.forEach(name => strangerUsage.set(name, (Number(strangerUsage.get(name)) || 0) + 1))
  }
  // 道具：件数必须与档案一致；已交付过的道具不得再演一次交付。
  const sentences = body.split(/[。！？\n]/).map(line => line.trim()).filter(Boolean)
  parseProps(props).forEach(prop => {
    const { value, unit } = countOfProp(prop.count)
    if (value && unit) {
      const hits = sentences
        .filter(line => line.includes(prop.name))
        .flatMap(line => Array.from(line.matchAll(new RegExp(`([零一二三四五六七八九十百0-9]{1,4})${unit}`, 'g'))))
        .map(match => cnToNumber(match[1]))
        .filter(number => number && number !== value)
      if (hits.length) {
        issues.push(`道具件数与档案不符：${prop.name} 档案记 ${value}${unit}，正文出现 ${Array.from(new Set(hits)).join('/')}${unit}`)
      }
    }
    if (/已交付|已交给|已还/.test(prop.status)) {
      const delivered = sentences.some(line => line.includes(prop.name) && /交给|递给|塞给|交到|交付给|还给/.test(line))
      if (delivered) issues.push(`道具重复交付：${prop.name} 台账已记「${prop.status}」，本集又出现一次交付动作`)
    }
  })
  // 写法：场景头/镜头术语、括注体，都是换写手感的典型信号。
  if (/^\s*(内景|外景|场景|镜号|景别|时间|地点)[：:]/m.test(body)) {
    issues.push('出现场景头或镜头术语，写法基线要求以动作与对白推进')
  }
  const brackets = (body.match(/（[^）]{4,}）/g) || []).length
  const lines = body.split('\n').filter(line => line.trim())
  if (brackets >= 4 && lines.length && brackets / lines.length > 0.25) {
    issues.push('疑似括注体：多段用全角括号补叙述，与写法基线不一致')
  }
  return issues
}

// ── 生成后兜底：去跨章重复、压字数、补出场名单 ──

/** 单集正文失控阈值：提示词要求 700-900 字，超过 1500 视为续写拼接失控。 */
export const EPISODE_TEXT_MAX = 1500

/**
 * 去掉与本集结尾重复的「上一章末尾」。
 * 模型会把注入的上一章末尾原样抄进本集收尾，只在重合段 ≥24 字时裁剪，避免误删自然的短句承接。
 */
export function stripRepeatedTail(text, prevTail, min = 24) {
  const body = String(text || '')
  const prev = String(prevTail || '').trim()
  if (!body.trim() || !prev) return body
  const max = Math.min(prev.length, body.length, 400)
  for (let len = max; len >= min; len -= 1) {
    if (body.endsWith(prev.slice(-len))) {
      const kept = body.slice(0, body.length - len)
      if (kept.trim()) return kept.replace(/\s+$/, '')
    }
  }
  return body
}

/** 续写返回的开头若重复了已有正文末尾，去掉重复前缀，避免同一段出现两次。 */
export function stripRepeatedHead(text, existing, min = 16) {
  const body = String(text || '')
  const base = String(existing || '').trim()
  if (!body.trim() || !base) return body
  const max = Math.min(200, body.length, base.length)
  for (let len = max; len >= min; len -= 1) {
    if (base.endsWith(body.slice(0, len))) return body.slice(len).replace(/^[\s，。；：]+/, '')
  }
  return body
}

/** 超长正文按句号/换行收到上限，不留半句；未超长原样返回。 */
export function clampEpisodeText(text, max = EPISODE_TEXT_MAX) {
  const body = String(text || '').trim()
  if (body.length <= max) return body
  const slice = body.slice(0, max)
  const cut = Math.max(
    slice.lastIndexOf('。'), slice.lastIndexOf('！'), slice.lastIndexOf('？'),
    slice.lastIndexOf('”'), slice.lastIndexOf('\n'),
  )
  return (cut > max / 2 ? slice.slice(0, cut + 1) : slice).trim()
}

/**
 * 「本集出场」缺失时的兜底：从人物卡里取姓名，用本集事件卡里实际出现的名字。
 * 人物卡格式「姓名（年龄/性别）：…」，也兼容行首「姓名：」。
 */
export function castFromCharacters(characters, card) {
  const source = String(characters || '')
  const names = []
  const re = /(?:^|\n)\s*([\u4e00-\u9fa5]{2,4})\s*[（(：:]/g
  let match
  while ((match = re.exec(source))) names.push(match[1])
  const text = String(card || '')
  const unique = []
  names.forEach(name => {
    if (!unique.includes(name) && text.includes(name)) unique.push(name)
  })
  return unique.slice(0, 6)
}

/**
 * 把 AI 剧本结果拆成「故事简介 / 人物便签 / 剧本大纲」三块。
 * 标题前缀兼容 Markdown（##、**）、书名号【】『』「」，模型三种写法都会出现；
 * 从第一个「第N集：」起全部归大纲，避免设定段落混进事件卡。
 */
export function splitOutlineSections(content) {
  const src = String(content || '').replace(/\r\n?/g, '\n')
  const lines = src.split('\n')
  const heads = [
    { key: 'summary', re: /^[\s#*>【\[『「]*故事简介[】\]』」*]{0,3}\s*[：:]?\s*(.*)$/ },
    { key: 'people', re: /^[\s#*>【\[『「]*主要人物[】\]』」*]{0,3}\s*[：:]?\s*(.*)$/ },
    { key: 'relation', re: /^[\s#*>【\[『「]*人物关系[】\]』」*]{0,3}\s*[：:]?\s*(.*)$/ },
    { key: 'props', re: /^[\s#*>【\[『「]*(?:重要道具档案|道具档案)[】\]』」*]{0,3}\s*[：:]?\s*(.*)$/ },
    { key: 'styleGuide', re: /^[\s#*>【\[『「]*写法基线[】\]』」*]{0,3}\s*[：:]?\s*(.*)$/ },
    { key: 'notes', re: /^[\s#*>【\[『「]*人物便签[】\]』」*]{0,3}\s*[：:]?\s*(.*)$/ },
  ]
  const episodeHead = /^[\s#>*]*第\d{1,3}[集章][：:]/
  const buckets = { summary: [], people: [], relation: [], props: [], styleGuide: [], notes: [] }
  let current = null
  let episodeIndex = -1
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim()
    if (episodeHead.test(line)) { episodeIndex = i; break }
    const hit = heads.find(item => item.re.test(line))
    if (hit) {
      current = hit.key
      const rest = line.replace(hit.re, '$1').trim()
      if (rest) buckets[current].push(rest)
      continue
    }
    if (current) buckets[current].push(line)
  }
  const summary = buckets.summary.join('\n').trim()
  const people = buckets.people.join('\n').trim()
  const relation = buckets.relation.join('\n').trim()
  const props = buckets.props.join('\n').trim()
  const styleGuide = buckets.styleGuide.join('\n').trim()
  const notes = buckets.notes.join('\n').trim()
  const characterParts = []
  if (notes) characterParts.push(notes)
  if (people) characterParts.push('主要人物\n' + people)
  if (relation) characterParts.push('人物关系\n' + relation)
  return {
    summary,
    characters: characterParts.join('\n\n').trim(),
    props,
    styleGuide,
    outline: episodeIndex >= 0 ? lines.slice(episodeIndex).join('\n').trim() : '',
  }
}
