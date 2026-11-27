import { outlineChapters } from './creator.js'
import { isFormattedDocument } from './document.js'
import { chapterTail, ledgerPromptBlockByCast, splitOutlineSections } from './creatorAi.js'

/**
 * v3 作品资料（AI Story Blueprint）纯函数层。
 *
 * 后端目前没有 Blueprint 的结构化存储与 /ai/blueprint/* 接口，这里承担三件事：
 * 1. Blueprint 与既有 ledger 十类自由文本的双向序列化，保证旧作品能读、新作品能落库；
 * 2. 把 AI 返回的任意文本（完整设定段 / 单段补充 / 非结构化散文）宽松解析成四张资料卡；
 * 3. 生成提示词与章级元数据的纯函数拼装，供页面与 node:test 复用。
 * 所有函数都不访问 DOM 与网络，解析失败一律降级而不是抛错。
 */

const str = value => typeof value === 'string' ? value : value == null ? '' : String(value)
const lines = value => str(value).replace(/\r\n?/g, '\n').split('\n')
const compact = value => lines(value).map(line => line.trim()).filter(Boolean)
const unique = list => [...new Set(list.filter(Boolean))]

/** 清理自由文本：统一换行、去掉首尾空白，不折叠正文内部空行。 */
export const cleanText = value => str(value).replace(/\r\n?/g, '\n').trim()

/** 稳定的人物/物品 key：同名永远得到同一个 key，刷新与重新解析都不会漂移。 */
export function nameKey(prefix, name) {
  const text = str(name).trim()
  let hash = 0
  for (const char of text) hash = (hash * 31 + char.codePointAt(0)) % 0x7fffffff
  return `${prefix}-${hash.toString(36)}`
}

const PALETTE = ['#4a7c75', '#526a87', '#9b7048', '#7a5c78', '#6b7f4a', '#8a5a44']

export const emptyBlueprint = () => ({
  status: 'draft',
  storyCore: { logline: '', summary: '', coreConflict: '', narrativeStyle: '', contentBoundary: '', endingTone: '' },
  world: { setting: '', rules: [], constraints: [] },
  outline: { mainline: '', acts: [], endingHanger: '' },
  characters: [],
  items: [],
  relations: [],
  planEpisodes: 12,
  minutesPerEpisode: 2,
  updatedAt: ''
})

const textField = value => cleanText(value)
// 摘要/风格这类「整段」字段：遇到下一个小节标题就截断，避免把下一节内容并进来。
const SECTION_BOUNDARY = /^[\s#>*【\[『「]*(?:故事简介|主要人物|人物关系|人物增补|重要道具档案|道具档案|写法基线|世界观|世界规则|故事主线|结尾悬念|第一幕|第二幕|第三幕|章节标题|章节概要|本章出场|本章物品|本章关系|一句话梗概|核心冲突|叙事风格|内容边界)[】\]』」*]*\s*[：:]?/
export function cutAtSection(value) {
  const rows = lines(value)
  const kept = []
  for (let index = 0; index < rows.length; index += 1) {
    const line = rows[index]
    if (index > 0 && SECTION_BOUNDARY.test(line.trim())) break
    kept.push(line)
  }
  return cleanText(kept.join('\n'))
}
const listField = value => (Array.isArray(value) ? value.filter(Boolean) : [])

/** 宽松归一：后端/旧数据缺字段一律补空，非法条目丢弃，key 去重。 */
export function normalizeBlueprint(raw) {
  const base = emptyBlueprint()
  const source = raw && typeof raw === 'object' ? raw : {}
  const core = source.storyCore && typeof source.storyCore === 'object' ? source.storyCore : {}
  const world = source.world && typeof source.world === 'object' ? source.world : {}
  const outline = source.outline && typeof source.outline === 'object' ? source.outline : {}
  const seenCharacter = new Set()
  const characters = listField(source.characters).map((item, index) => {
    const entry = item && typeof item === 'object' ? item : {}
    const name = cleanText(entry.name) || `人物${index + 1}`
    let key = cleanText(entry.key) || nameKey('c', name)
    while (seenCharacter.has(key)) key += 'x'
    seenCharacter.add(key)
    return {
      key,
      name,
      role: cleanText(entry.role),
      age: cleanText(entry.age),
      gender: cleanText(entry.gender),
      goal: cleanText(entry.goal),
      trait: cleanText(entry.trait),
      secret: cleanText(entry.secret),
      growth: cleanText(entry.growth),
      appearance: cleanText(entry.appearance),
      portraitUrl: cleanText(entry.portraitUrl),
      threeViewUrls: entry.threeViewUrls && typeof entry.threeViewUrls === 'object' ? entry.threeViewUrls : {},
      color: cleanText(entry.color) || PALETTE[index % PALETTE.length]
    }
  })
  const seenItem = new Set()
  const items = listField(source.items).map((item, index) => {
    const entry = item && typeof item === 'object' ? item : {}
    const name = cleanText(entry.name) || `物品${index + 1}`
    let key = cleanText(entry.key) || nameKey('i', name)
    while (seenItem.has(key)) key += 'x'
    seenItem.add(key)
    const track = listField(entry.track).map(point => ({
      chapterNo: Number(point?.chapterNo) || 0,
      event: cleanText(point?.event)
    })).filter(point => point.event)
    return {
      key,
      name,
      icon: cleanText(entry.icon),
      desc: cleanText(entry.desc),
      owner: cleanText(entry.owner),
      count: cleanText(entry.count),
      state: cleanText(entry.state),
      track
    }
  })
  const characterKeys = new Set(characters.map(character => character.key))
  const seenRelation = new Set()
  const relations = listField(source.relations).map((item, index) => {
    const entry = item && typeof item === 'object' ? item : {}
    return {
      a: cleanText(entry.a),
      b: cleanText(entry.b),
      label: cleanText(entry.label),
      dash: entry.dash === true,
      color: cleanText(entry.color) || PALETTE[index % PALETTE.length]
    }
  }).filter(relation => relation.a && relation.b && relation.a !== relation.b && characterKeys.has(relation.a) && characterKeys.has(relation.b))
    .filter(relation => {
      const id = [relation.a, relation.b].sort().join('|')
      if (seenRelation.has(id)) return false
      seenRelation.add(id)
      return true
    })
  return {
    ...base,
    status: source.status === 'confirmed' ? 'confirmed' : 'draft',
    storyCore: {
      logline: textField(core.logline),
      summary: textField(core.summary),
      coreConflict: textField(core.coreConflict),
      narrativeStyle: textField(core.narrativeStyle),
      contentBoundary: textField(core.contentBoundary),
      endingTone: textField(core.endingTone)
    },
    world: {
      setting: textField(world.setting),
      rules: listField(world.rules).map(rule => ({
        name: cleanText(rule?.name),
        detail: cleanText(rule?.detail)
      })).filter(rule => rule.name || rule.detail),
      constraints: listField(world.constraints).map(cleanText).filter(Boolean)
    },
    outline: {
      mainline: textField(outline.mainline),
      acts: listField(outline.acts).map((act, index) => ({
        name: cleanText(act?.name) || `第${index + 1}幕`,
        range: cleanText(act?.range),
        summary: cleanText(act?.summary),
        beats: listField(act?.beats).map(cleanText).filter(Boolean)
      })).filter(act => act.summary || act.beats.length),
      endingHanger: textField(outline.endingHanger)
    },
    characters,
    items,
    relations,
    planEpisodes: Math.min(60, Math.max(1, Number(source.planEpisodes) || base.planEpisodes)),
    minutesPerEpisode: [1, 1.5, 2].includes(Number(source.minutesPerEpisode)) ? Number(source.minutesPerEpisode) : 2,
    updatedAt: cleanText(source.updatedAt)
  }
}

/** 作品标题/题材/集数/时长：setup 与 blueprint 互为兜底，任何一项缺失都有确定值。 */
export function blueprintWorkMeta(blueprint, setup = {}) {
  const data = normalizeBlueprint(blueprint)
  const explicitPlan = Number(setup.episodes) || 0
  const planEpisodes = Math.min(60, Math.max(1, (explicitPlan >= 1 && explicitPlan <= 60 ? explicitPlan : 0) || Number(data.planEpisodes) || 12))
  const explicitMinutes = Number(setup.minutes)
  const minutes = [1, 1.5, 2].includes(explicitMinutes)
    ? explicitMinutes
    : ([1, 1.5, 2].includes(Number(data.minutesPerEpisode)) ? Number(data.minutesPerEpisode) : 2)
  return {
    title: cleanText(setup.title),
    genre: cleanText(setup.genre) || '未分类',
    planEpisodes,
    minutes,
    durationSeconds: Math.round(minutes * 60),
    logline: data.storyCore.logline || firstSentence(data.storyCore.summary || setup.idea),
    summary: data.storyCore.summary || cleanText(setup.idea)
  }
}

/** 取第一句（中英文句末标点或换行），用于把一段灵感收成一句话梗。 */
export function firstSentence(value) {
  const text = cleanText(value).replace(/\n+/g, ' ')
  if (!text) return ''
  const match = text.match(/^.*?[。！？!?；;]/)
  const sentence = (match ? match[0] : text).trim()
  return sentence.slice(0, 120)
}

const LABELS = {
  logline: ['一句话梗概', '一句话简介', 'logline', '一句话故事'],
  summary: ['故事简介', '剧情简介', '简介', '故事梗概'],
  coreConflict: ['核心冲突'],
  narrativeStyle: ['叙事风格', '写作风格', '风格'],
  contentBoundary: ['内容边界', '创作边界', '内容限制'],
  endingTone: ['结局基调', '结局'],
  mainline: ['故事主线', '主线'],
  endingHanger: ['结尾悬念', '结尾钩子'],
  setting: ['世界观', '世界设定', '背景设定'],
  worldRules: ['规则', '世界规则'],
  styleGuide: ['写法基线']
}

/** 读取「标签：内容」形式的行；标签支持 Markdown 前缀与书名号。 */
export function labelledValue(text, keys) {
  const wanted = (Array.isArray(keys) ? keys : [keys]).map(key => key.toLowerCase())
  const matcher = new RegExp('^[\\s#>*【\\[『「]*(' + wanted.map(escapeRegExp).join('|') + ')[】\\]』」*]*\\s*[：:]?\\s*(.*)$', 'i')
  const rows = lines(text)
  for (let index = 0; index < rows.length; index += 1) {
    const match = rows[index].trim().match(matcher)
    if (!match) continue
    const inline = cleanText(match[2])
    if (inline) return inline
    // 后端五段格式常把标签单独占一行，内容在下一行。
    const next = rows.slice(index + 1).map(line => line.trim()).find(Boolean)
    return next && !SECTION_BOUNDARY.test(next) ? cleanText(next) : ''
  }
  return ''
}

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * 解析「姓名（年龄/性别）：身份｜外貌｜性格｜动机与软肋｜成长线」人物卡。
 * 兼容「姓名：描述」单段写法和逐行续写；解析不到的行不会吞掉上一人。
 */
function splitCharacterFields(text) {
  // 五个位置是固定的（身份/外貌/性格/动机/成长），空槽必须保留，否则往返后字段会错位。
  return String(text).split(/[｜|]/).map(part => part.trim())
}

export function parseCharacterBlocks(value) {
  const characters = []
  const re = /^[\s#>*·•-]*([一-龥A-Za-z][一-龥A-Za-z0-9·]{0,11})\s*(?:[（(]([^）)]{0,40})[）)])?\s*[：:]\s*(.*)$/
  const skip = /^(主要人物|人物|角色|人物关系|人物便签|人物增补|新增人物|故事简介|人物卡|本章出场|本章人物|重要道具档案|写法基线|世界观|故事主线|结尾悬念)$/
  for (const raw of lines(value)) {
    const line = raw.trim()
    if (!line) continue
    const match = line.match(re)
    if (match && !skip.test(match[1])) {
      const [age, gender] = cleanText(match[2]).split(/[/／、,，]/).map(part => part.trim())
      characters.push({
        name: match[1],
        age: age || '',
        gender: gender || '',
        fields: cleanText(match[3]) ? splitCharacterFields(match[3]) : []
      })
      continue
    }
    // 段标题（『人物关系』/【重要道具档案】等）是边界，不能并进上一个人物的成长线。
    if (/^[【\[『「#>*]+[^】\]』」]{1,16}[】\]』」*]*$/.test(line)) continue
    if (!characters.length) continue
    // 续行并入最后一人：优先补成长线，其次动机，避免把新段落误当新人物。
    const last = characters[characters.length - 1]
    if (last.fields.length && last.fields.length < 5) last.fields[last.fields.length - 1] += line
    else last.fields.push(line)
  }
  return characters.map((character, index) => ({
    key: nameKey('c', character.name),
    name: character.name,
    age: character.age,
    gender: character.gender,
    role: character.fields[0] || '',
    appearance: character.fields[1] || '',
    trait: character.fields[2] || '',
    goal: character.fields[3] || '',
    growth: character.fields[4] || '',
    secret: character.fields[5] || '',
    color: PALETTE[index % PALETTE.length]
  }))
}

const ICON_HINTS = [
  { icon: 'tape', re: /磁带|录音带|卡带|tape/i },
  { icon: 'radio', re: /收音机|电台|radio|频段|频率/i },
  { icon: 'note', re: /留言|信纸|纸页|笔记|note|信/i },
  { icon: 'key', re: /钥匙|key/i },
  { icon: 'mask', re: /面具|傩|mask/i }
]

export function guessIcon(...parts) {
  const text = parts.map(str).join(' ')
  return ICON_HINTS.find(hint => hint.re.test(text))?.icon || 'generic'
}

/** 解析道具档案：名称｜件数持有人｜当前状态｜外观。缺列不补假值。 */
export function parsePropsText(value) {
  return compact(value).map((line, index) => {
    const cells = line.split(/[｜|]/).map(cell => cell.trim())
    const name = cells[0] || ''
    return {
      key: nameKey('i', name || `道具${index + 1}`),
      name,
      count: cells[1] || '',
      owner: cells[2] || '',
      state: cells[3] || '',
      desc: cells[4] || '',
      icon: guessIcon(name, cells[4]),
      track: []
    }
  }).filter(item => item.name)
}

/** 解析关系行：A ↔ B：关系性质 + 张力 + 藏着的事。返回名称对，由调用方换成 key。 */
export function parseRelationLines(value) {
  const rows = []
  for (const line of compact(value)) {
    const match = line.match(/^(.{1,24}?)\s*(?:↔|<->|⇄|—|－|--|-|至|与|和)\s*(.{1,24}?)\s*[：:]\s*(.+)$/)
    if (!match) continue
    const [, left, right, label] = match
    const clean = text => text.replace(/^[\s#*【\[『「]+|[】\]』」*\s]+$/g, '').trim()
    rows.push({ aName: clean(left), bName: clean(right), label: cleanText(label) })
  }
  return rows
}

function resolveCharacter(name, characters) {
  const wanted = cleanText(name)
  if (!wanted) return null
  const exact = characters.find(character => character.name === wanted)
  if (exact) return exact
  return characters.find(character => wanted.includes(character.name) || character.name.includes(wanted)) || null
}

/** 关系行 → 结构化 edges；两边都必须能落到人物卡上，否则丢弃。 */
export function relationsFromLines(value, characters) {
  const edges = []
  for (const row of parseRelationLines(value)) {
    const a = resolveCharacter(row.aName, characters)
    const b = resolveCharacter(row.bName, characters)
    if (!a || !b || a.key === b.key) continue
    edges.push({
      a: a.key,
      b: b.key,
      label: row.label || '关系待补充',
      dash: /隐瞒|质疑|怀疑|暗|未公开|推断|疏远/.test(row.label),
      color: PALETTE[edges.length % PALETTE.length]
    })
  }
  return edges
}

/** 解析作品大纲：故事主线 / 三幕结构 / 结尾悬念；不含章节级事件卡。 */
export function parseOutlineText(value) {
  const text = cleanText(value)
  const mainline = labelledValue(text, LABELS.mainline)
  const endingHanger = labelledValue(text, LABELS.endingHanger)
  const acts = []
  const actRe = /^[#>*\s]*第\s*([一二三四五六七八九十])\s*幕\s*(?:[（(]([^）)]*)[）)])?\s*[·：:\-—]?\s*(.*)$/
  for (const raw of lines(text)) {
    const line = raw.trim()
    const match = line.match(actRe)
    if (!match) continue
    const name = `第${match[1]}幕`
    let range = cleanText(match[2])
    let summary = cleanText(match[3])
    // 兼容「第一幕 · 1–4 集：发现留言」：幕名与集数之间用中点/冒号分隔。
    if (!range && /[:：]/.test(summary)) {
      const [head, ...rest] = summary.split(/[:：]/)
      range = cleanText(head)
      summary = cleanText(rest.join('：'))
    }
    if (summary) acts.push({ name, range, summary })
  }
  // 没有幕标题时，从故事主线里按「三幕」关键词切不出可信结构，保持为空，由页面提示 AI 整理。
  return { mainline, acts, endingHanger }
}

/** JSON 宽松解析：剥掉 Markdown 代码块，再取第一个 `{` 到最后一个 `}`。 */
export function parseJsonLoose(value) {
  const text = str(value).trim()
  if (!text) return null
  const unfenced = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
  for (const candidate of [unfenced, unfenced.slice(unfenced.indexOf('{'), unfenced.lastIndexOf('}') + 1)]) {
    if (!candidate) continue
    try {
      const parsed = JSON.parse(candidate)
      if (parsed && typeof parsed === 'object') return parsed
    } catch { /* 继续尝试下一种截取方式 */ }
  }
  return null
}

function firstParagraph(value) {
  return cleanText(value).split(/\n{2,}/).map(part => part.trim()).filter(Boolean)[0] || ''
}

/**
 * 解析整份作品资料：优先 JSON（结构化契约），其次「五段设定」文本，最后退化为设定兜底。
 * 永不抛错；缺的字段留空，由页面渲染「待补充」并允许单项重新整理。
 */
export function blueprintParse(value, setup = {}) {
  const text = /[一-龥A-Za-z0-9]/.test(str(value)) ? str(value) : ''
  const source = normalizeBlueprint({})
  const json = parseJsonLoose(text)
  if (json && (json.storyCore || json.world || json.planEpisodes)) {
    return normalizeBlueprint({
      ...source,
      ...json,
      storyCore: { ...source.storyCore, ...(json.storyCore || {}) },
      world: { ...source.world, ...(json.world || {}) },
      outline: { ...source.outline, ...(json.outline || {}) },
      planEpisodes: json.planEpisodes || setup.episodes || source.planEpisodes,
      minutesPerEpisode: json.minutesPerEpisode || setup.minutes || source.minutesPerEpisode
    })
  }
  const sections = text ? splitOutlineSections(text) : { summary: '', characters: '', props: '', styleGuide: '', outline: '' }
  const characterSource = sections.characters && sections.characters !== text ? sections.characters : text
  const parsedCharacters = parseCharacterBlocks(characterSource)
  const items = parsePropsText(sections.props || (characterSource === text ? '' : text))
  const relations = relationsFromLines(text, parsedCharacters)
  const outline = parseOutlineText(sections.outline || text)
  const idea = cleanText(setup.idea)
  // 故事简介只认显式的「故事简介」段：fullText 时用完整文本兜底，否则宁可留空也不把原始返回塞进去。
  const rawSummary = cutAtSection(sections.summary || labelledValue(text, LABELS.summary) || (characterSource === text ? cleanText(firstParagraph(text)) : ''))
  const summary = rawSummary || idea
  // 核心冲突 / 风格 / 边界优先取标签行；标签缺失时，只在没有人物段（即整段都是设定）时才把首段当世界观。
  const coreConflict = labelledValue(text, LABELS.coreConflict)
  const styleRows = cutAtSection(sections.styleGuide).split('\n').map(line => line.trim()).filter(Boolean)
  const narrativeStyle = labelledValue(text, LABELS.narrativeStyle) || styleRows[0] || ''
  const contentBoundary = labelledValue(text, LABELS.contentBoundary) || styleRows.slice(1).join(' ') || ''
  const setting = labelledValue(text, LABELS.setting) || (characterSource === text ? firstParagraph(text) : '')
  const rules = parseWorldRules(text)
  const constraints = parseWorldConstraints(text)
  const storyCore = {
    logline: labelledValue(text, LABELS.logline) || firstSentence(summary),
    summary: rawSummary || idea,
    coreConflict,
    narrativeStyle,
    contentBoundary,
    endingTone: labelledValue(text, LABELS.endingTone)
  }
  return normalizeBlueprint({
    status: 'draft',
    storyCore,
    world: { setting: setting === summary ? '' : setting, rules, constraints },
    outline: {
      mainline: outline.mainline || storyCore.logline || firstSentence(summary),
      acts: outline.acts,
      endingHanger: outline.endingHanger
    },
    characters: parsedCharacters,
    items,
    relations,
    planEpisodes: setup.episodes || source.planEpisodes,
    minutesPerEpisode: setup.minutes || source.minutesPerEpisode,
    updatedAt: new Date().toISOString()
  })
}

function parseWorldRules(text) {
  const block = sectionBlock(text, ['规则', '世界规则'])
  const rules = []
  for (const line of block) {
    const cells = line.split(/[：:]/)
    if (cells.length < 2) continue
    const name = cells.shift().replace(/^[-*·•\s]+/, '').trim()
    const detail = cells.join('：').trim()
    if (name && detail) rules.push({ name, detail })
  }
  return rules
}

function parseWorldConstraints(text) {
  const block = sectionBlock(text, ['叙事限制', '限制', '内容边界'])
  return block.map(line => line.replace(/^[-*·•\d.\s]+/, '').trim()).filter(Boolean)
}

function sectionBlock(text, keys) {
  const result = []
  let active = false
  const matcher = new RegExp('^[\\s#>*【\\[『「]*(' + keys.map(escapeRegExp).join('|') + ')[】\\]』」*]*\\s*[：:]?\\s*(.*)$')
  for (const raw of lines(text)) {
    const line = raw.trim()
    if (!line) continue
    const match = line.match(matcher)
    if (match) {
      active = true
      if (cleanText(match[2])) result.push(cleanText(match[2]))
      continue
    }
    if (!active) continue
    if (/^[#>*【\[『「]*(?:故事简介|主要人物|人物关系|重要道具档案|道具档案|写法基线|故事主线|结尾悬念|第一幕|第二幕|第三幕)/.test(line)) { active = false; continue }
    result.push(line)
  }
  return result
}

/** Blueprint → ledger 十类（同一数据两视图，写路径必须经过这里）。 */
export function blueprintToLedger(blueprint) {
  const data = normalizeBlueprint(blueprint)
  const characterText = data.characters.map(character => {
    const identity = [character.age, character.gender].filter(Boolean).join('/')
    const fields = [character.role, character.appearance, character.trait, character.goal, character.growth, character.secret]
      .map(cleanText)
    // 去掉尾部空槽但保留中间空槽，避免字段串位。
    while (fields.length && !fields[fields.length - 1]) fields.pop()
    return `${character.name}${identity ? `（${identity}）` : ''}：${fields.join('｜')}`
  }).join('\n')
  const byKey = new Map(data.characters.map(character => [character.key, character]))
  const relationText = data.relations.map(relation => {
    const a = byKey.get(relation.a)?.name || ''
    const b = byKey.get(relation.b)?.name || ''
    return a && b ? `${a} ↔ ${b}：${relation.label}` : ''
  }).filter(Boolean).join('\n')
  const propsText = data.items.map(item => {
    const cells = [item.name, item.count || '待定', item.owner || '待定', item.state || '待定', item.desc || '待定']
    return cells.join('｜')
  }).join('\n')
  const itemsText = data.items.map(item => {
    const track = item.track.map(point => `第${point.chapterNo || '?'}章 ${point.event}`).join('；')
    return `${item.name}：${track || item.state || item.desc || '待记录'}`
  }).join('\n')
  const styleLines = unique([data.storyCore.narrativeStyle, data.storyCore.contentBoundary]).join('\n')
  const outlineLines = [
    data.outline.mainline ? `故事主线：${data.outline.mainline}` : '',
    ...data.outline.acts.map(act => `${act.name}${act.range ? `（${act.range}）` : ''}：${act.summary}`),
    data.outline.endingHanger ? `结尾悬念：${data.outline.endingHanger}` : ''
  ].filter(Boolean).join('\n')
  const worldRules = data.world.rules.map(rule => `${rule.name}：${rule.detail}`).join('\n')
  const worldLines = [data.world.setting ? `世界观：${data.world.setting}` : '', worldRules].filter(Boolean).join('\n')
  const stateBoard = [
    `计划集数=${data.planEpisodes} 集；单集时长=${data.minutesPerEpisode} 分钟。`,
    data.storyCore.coreConflict ? `核心冲突：${data.storyCore.coreConflict}` : '',
    worldLines ? `世界与规则：\n${worldLines}` : '',
    data.storyCore.endingTone ? `结局基调：${data.storyCore.endingTone}` : ''
  ].filter(Boolean).join('\n')
  return {
    storySummary: data.storyCore.summary || data.storyCore.logline,
    characters: characterText,
    relations: relationText,
    foreshadow: data.world.constraints.join('\n'),
    timeline: '',
    items: itemsText,
    props: propsText,
    styleGuide: styleLines,
    outline: outlineLines,
    threads: data.world.constraints.join('\n'),
    stateBoard
  }
}

/** ledger → Blueprint：旧作品无结构化资料时按台账宽松还原，解析不出的字段留空。 */
export function ledgerToBlueprint(ledger) {
  const source = ledger && typeof ledger === 'object' ? ledger : {}
  const characters = parseCharacterBlocks(source.characters)
  const props = parsePropsText(source.props)
  const state = parseStateBoard(source.stateBoard)
  const outlineText = cleanText(source.outline)
  const outline = parseOutlineText(outlineText)
  const episodeCards = outlineChapters(outlineText)
  // 旧台账的「剧本纲」是分集事件卡：主线取第一张卡，不伪造三幕结构。
  const firstCard = episodeCards[0]
  const worldBlock = labelledValue(source.stateBoard, ['世界与规则'])
  const worldRules = parseWorldRules(state.world || '')
  const summary = cleanText(source.storySummary)
  return normalizeBlueprint({
    status: 'confirmed',
    storyCore: {
      logline: firstSentence(summary),
      summary,
      coreConflict: state.coreConflict,
      narrativeStyle: cleanText(source.styleGuide).split('\n')[0] || '',
      contentBoundary: cleanText(source.styleGuide).split('\n')[1] || '',
      endingTone: state.endingTone
    },
    world: {
      setting: state.world || worldBlock || '',
      rules: worldRules,
      constraints: compact(source.threads || source.foreshadow)
    },
    outline: {
      mainline: outline.mainline || firstCard?.title || firstSentence(summary),
      acts: outline.acts,
      endingHanger: outline.endingHanger
    },
    characters,
    items: props,
    relations: relationsFromLines(source.relations, characters),
    planEpisodes: state.planEpisodes || 12,
    minutesPerEpisode: state.minutes || 2,
    updatedAt: cleanText(source.updateTime) || new Date().toISOString()
  })
}

function parseStateBoard(value) {
  const text = cleanText(value)
  const plan = text.match(/计划集数\s*[=＝:：]\s*(\d{1,2})/)
  const minutesMatch = text.match(/单集时长\s*[=＝:：]\s*([\d.]+)/)
  const world = text.match(/世界与规则[：:]\s*([\s\S]*?)(?:\n(?:结局基调|核心冲突)[：:]|$)/)
  return {
    planEpisodes: plan ? Number(plan[1]) : 0,
    minutes: minutesMatch ? Number(minutesMatch[1]) : 0,
    coreConflict: labelledValue(text, LABELS.coreConflict),
    endingTone: labelledValue(text, LABELS.endingTone),
    world: world ? cleanText(world[1]) : ''
  }
}

/**
 * 判断 AI 返回文本里实际出现了哪些资料段：只合并出现的段，没出现的保留原值，
 * 避免「只重写人物」的返回把故事核心覆盖成原始文本。
 */
export function presentSections(value) {
  const text = str(value)
  const json = parseJsonLoose(text)
  if (json && typeof json === 'object') {
    const keys = new Set()
    if (json.storyCore || json.core || json.summary || json.logline) keys.add('storyCore')
    if (json.world) keys.add('world')
    if (json.outline) keys.add('outline')
    if (Array.isArray(json.characters)) keys.add('characters')
    if (Array.isArray(json.items)) keys.add('items')
    if (Array.isArray(json.relations)) keys.add('relations')
    if (keys.size) return keys
  }
  const markers = {
    storyCore: /故事简介|一句话梗概|核心冲突|叙事风格|内容边界/,
    world: /世界观|世界规则|世界与规则/,
    outline: /故事主线|三幕|结尾悬念/,
    characters: /主要人物|人物增补|新增人物/,
    items: /重要道具档案|道具档案|关键物品/,
    relations: /人物关系/
  }
  const keys = new Set()
  for (const [key, re] of Object.entries(markers)) if (re.test(text)) keys.add(key)
  return keys
}

/** 单项/全部重新整理后的合并：解析不到新内容时保留旧卡，绝不把资料清空。 */
export function mergeBlueprintSection(blueprint, section, value) {
  const current = normalizeBlueprint(blueprint)
  const parsed = blueprintParse(value, { episodes: current.planEpisodes, minutes: current.minutesPerEpisode })
  const present = presentSections(value)
  const stamp = () => new Date().toISOString()
  if (section === 'all') {
    const characters = present.has('characters') && parsed.characters.length ? parsed.characters : current.characters
    return normalizeBlueprint({
      ...current,
      storyCore: present.has('storyCore') ? mergeStoryCore(current.storyCore, parsed.storyCore) : current.storyCore,
      world: present.has('world') ? mergeWorld(current.world, parsed.world) : current.world,
      outline: present.has('outline') ? mergeOutline(current.outline, parsed.outline) : current.outline,
      characters,
      items: present.has('items') && parsed.items.length ? parsed.items : current.items,
      // 人物被重写后旧 key 会失效，关系必须一起重建，否则图上会出现悬空节点。
      relations: present.has('characters')
        ? (characters === parsed.characters ? parsed.relations : [])
        : (present.has('relations') && parsed.relations.length ? parsed.relations : current.relations),
      updatedAt: stamp()
    })
  }
  if (section === 'storyCore') {
    if (!present.has('storyCore')) return current
    return normalizeBlueprint({ ...current, storyCore: mergeStoryCore(current.storyCore, parsed.storyCore), updatedAt: stamp() })
  }
  if (section === 'world') {
    if (!present.has('world')) return current
    return normalizeBlueprint({ ...current, world: mergeWorld(current.world, parsed.world), updatedAt: stamp() })
  }
  if (section === 'outline') {
    if (!present.has('outline')) return current
    return normalizeBlueprint({ ...current, outline: mergeOutline(current.outline, parsed.outline), updatedAt: stamp() })
  }
  if (section === 'characters') {
    if (!parsed.characters.length) return current
    const names = new Set(parsed.characters.map(character => character.name))
    const reusable = current.characters.every(character => names.has(character.name))
    return normalizeBlueprint({
      ...current,
      characters: parsed.characters,
      relations: reusable && current.relations.length ? current.relations : [],
      updatedAt: stamp()
    })
  }
  if (section === 'items') {
    return parsed.items.length ? normalizeBlueprint({ ...current, items: parsed.items, updatedAt: stamp() }) : current
  }
  if (section === 'relations') {
    return parsed.relations.length ? normalizeBlueprint({ ...current, relations: parsed.relations, updatedAt: stamp() }) : current
  }
  return current
}

const mergeStoryCore = (base, next) => ({
  logline: next.logline || base.logline,
  summary: next.summary && next.summary !== '作品的资料还在整理中。' ? next.summary : base.summary,
  coreConflict: next.coreConflict || base.coreConflict,
  narrativeStyle: next.narrativeStyle || base.narrativeStyle,
  contentBoundary: next.contentBoundary || base.contentBoundary,
  endingTone: next.endingTone || base.endingTone
})

const mergeWorld = (base, next) => ({
  setting: next.setting || base.setting,
  rules: next.rules.length ? next.rules : base.rules,
  constraints: next.constraints.length ? next.constraints : base.constraints
})

const mergeOutline = (base, next) => ({
  mainline: next.mainline || base.mainline,
  acts: next.acts.length ? next.acts : base.acts,
  endingHanger: next.endingHanger || base.endingHanger
})

/**
 * 本地「重新整理」：AI 不可用或返回不可解析时，仍按现有资料做一次确定性的收敛，
 * 保证按钮一定得到可见结果（去重、补一句话梗概、补齐追踪轨迹），并返回是否发生变化。
 */
export function localReorganize(blueprint, section) {
  const current = normalizeBlueprint(blueprint)
  const next = JSON.parse(JSON.stringify(current))
  let changed = false
  // 一句话梗概是「故事核心」的代表字段：任何一项重整都顺手补齐它。
  if (!next.storyCore.logline) {
    next.storyCore.logline = firstSentence(next.storyCore.summary || next.storyCore.coreConflict)
    changed ||= Boolean(next.storyCore.logline)
  }
  if ((section === 'storyCore' || section === 'all') && !next.storyCore.coreConflict) {
    next.storyCore.coreConflict = firstSentence(next.storyCore.summary)
    changed ||= Boolean(next.storyCore.coreConflict)
  }
  if (section === 'world' || section === 'all') {
    const before = JSON.stringify(next.world)
    next.world.rules = dedupeRules(next.world.rules)
    next.world.constraints = unique(next.world.constraints.map(cleanText))
    changed ||= JSON.stringify(next.world) !== before
  }
  if (section === 'characters' || section === 'all') {
    const before = JSON.stringify(next.characters)
    next.characters = dedupeCharacters(next.characters)
    changed ||= JSON.stringify(next.characters) !== before
  }
  if (section === 'items' || section === 'all') {
    const before = JSON.stringify(next.items)
    next.items = dedupeItems(next.items)
    changed ||= JSON.stringify(next.items) !== before
  }
  if (section === 'relations' || section === 'all') {
    const before = JSON.stringify(next.relations)
    next.relations = dedupeRelations(next.relations)
    changed ||= JSON.stringify(next.relations) !== before
  }
  if (section === 'outline' || section === 'all') {
    const before = JSON.stringify(next.outline)
    next.outline.mainline ||= next.storyCore.logline || firstSentence(next.storyCore.summary)
    next.outline.acts = next.outline.acts.map((act, index) => ({
      name: act.name || `第${index + 1}幕`,
      range: act.range,
      summary: act.summary
    }))
    changed ||= JSON.stringify(next.outline) !== before
  }
  next.updatedAt = new Date().toISOString()
  return { blueprint: normalizeBlueprint(next), changed }
}

const dedupeRules = rules => {
  const seen = new Set()
  return rules.filter(rule => {
    const id = `${rule.name}|${rule.detail}`
    if (seen.has(id) || (!rule.name && !rule.detail)) return false
    seen.add(id)
    return true
  })
}
const dedupeCharacters = characters => {
  const byName = new Map()
  for (const character of characters) {
    const name = cleanText(character.name)
    if (!name) continue
    const existing = byName.get(name)
    if (!existing) {
      byName.set(name, { ...character, goal: character.goal || '待补充', growth: character.growth || '待补充' })
      continue
    }
    // 重复人物合并：已有非空字段优先，缺的从后者补齐。
    const merged = { ...existing }
    for (const [field, value] of Object.entries(character)) {
      if (field === 'key' || field === 'name') continue
      if (!merged[field] && value) merged[field] = value
    }
    byName.set(name, merged)
  }
  return [...byName.values()]
}
const dedupeItems = items => {
  const byName = new Map()
  for (const item of items) {
    const name = cleanText(item.name)
    if (!name) continue
    const existing = byName.get(name)
    if (!existing) { byName.set(name, { ...item, count: item.count || '待定', state: item.state || '待定' }); continue }
    const track = [...existing.track, ...item.track].filter((point, index, list) => list.findIndex(other => other.chapterNo === point.chapterNo && other.event === point.event) === index)
    byName.set(name, { ...existing, track, desc: existing.desc || item.desc, owner: existing.owner || item.owner })
  }
  return [...byName.values()]
}
const dedupeRelations = relations => {
  const seen = new Set()
  return relations.filter(relation => {
    const id = [relation.a, relation.b].sort().join('|')
    if (seen.has(id)) return false
    seen.add(id)
    return true
  })
}

/** Blueprint 生成提示词：只产出资料，不产出章节级大纲（与后端 5 段设定口径一致）。 */
export function blueprintPrompt(setup = {}) {
  const title = cleanText(setup.title)
  const idea = cleanText(setup.idea)
  const genre = cleanText(setup.genre) || '不限'
  const episodes = Math.min(60, Math.max(1, Number(setup.episodes) || 12))
  const minutes = [1, 1.5, 2].includes(Number(setup.minutes)) ? Number(setup.minutes) : 2
  const extra = cleanText(setup.prompt)
  const blocks = [
    `请根据以下设定，为短剧《${title || '未命名作品'}》整理一份「作品资料」，不要写任何章节级大纲或分集事件卡。`,
    `【故事灵感】\n${idea}\n【题材】${genre}\n【规模】计划 ${episodes} 集，单集 ${minutes} 分钟。${extra ? `\n【作者要求】\n${extra}` : ''}`,
    [
      '请严格按下面五段输出，每段标题单独占一行，段与段之间空一行，不要解释、不要 JSON、不要 Markdown 代码块：',
      '『故事简介』：120-200 字，写清主角是谁、核心冲突、故事走向与结局基调。',
      '『主要人物』：5-8 人，每人一行，格式为「姓名（年龄/性别）：身份与处境｜外貌与气质｜性格与说话方式｜核心动机与软肋｜成长线」。',
      '『人物关系』：至少 4 条，每条一行，格式为「A ↔ B：关系性质 + 情感张力 + 藏着的事」。',
      '『重要道具档案』：5-8 件，一行一件，格式为「名称｜件数｜持有人｜当前状态｜外观与辨识特征」，件数必须全书唯一。',
      '『写法基线』：写明叙述人称、句子长短、对白比例、禁用写法；每集正文不超过 1500 字。'
    ].join('\n'),
    '另外请在五段之后补充三行，供工作台展示（不写分集）：\n世界观：……\n故事主线：……\n结尾悬念：……'
  ]
  return blocks.filter(Boolean).join('\n\n').trim()
}

const SECTION_LABELS = {
  storyCore: '故事核心（一句话梗概、核心冲突、叙事风格、内容边界）',
  world: '世界与规则（世界观设定、规则条目、创作限制）',
  outline: '作品大纲（故事主线、三幕结构、结尾悬念，不含章节级大纲）',
  characters: '主要人物（姓名（年龄/性别）：身份｜外貌｜性格｜动机与软肋｜成长线）',
  items: '关键物品（名称｜件数｜持有人｜状态｜外观，可附追踪轨迹）',
  relations: '人物关系（A ↔ B：关系性质 + 张力 + 藏着的事）',
  all: '全部作品资料（故事核、世界与规则、人物、物品、关系、大纲）'
}

/** 单项重新整理提示词：把其他资料作为上下文，只重写目标段。 */
export function regeneratePrompt(blueprint, section, instruction = '') {
  const data = normalizeBlueprint(blueprint)
  const ledger = blueprintToLedger(data)
  const characters = data.characters.map(character => `${character.name}（${character.role || '身份待定'}）`).join('、')
  return [
    `你是资深短剧策划。下面是《作品资料》的当前内容，请只重新整理「${SECTION_LABELS[section] || SECTION_LABELS.all}」这一项。`,
    '要求：保持人物姓名、物品件数与其他资料一致，不新增章节级大纲，不解释、不 JSON、不要 Markdown 代码块。',
    instruction ? `【作者意见】\n${cleanText(instruction)}` : '',
    '',
    '【故事核心】',
    ledger.storySummary || '（暂无）',
    `【核心冲突】${data.storyCore.coreConflict || '（暂无）'}`,
    `【叙事风格】${data.storyCore.narrativeStyle || '（暂无）'}`,
    `【内容边界】${data.storyCore.contentBoundary || '（暂无）'}`,
    '',
    `【世界与规则】\n${data.world.setting || '（暂无）'}${data.world.rules.length ? '\n' + data.world.rules.map(rule => `${rule.name}：${rule.detail}`).join('\n') : ''}`,
    `【主要人物】\n${characters || '（暂无）'}`,
    `【关键物品】\n${data.items.map(item => `${item.name}｜${item.count || '待定'}｜${item.owner || '待定'}｜${item.state || '待定'}`).join('\n') || '（暂无）'}`,
    `【人物关系】\n${data.relations.map(relation => {
      const byKey = new Map(data.characters.map(character => [character.key, character.name]))
      return `${byKey.get(relation.a) || '?'} ↔ ${byKey.get(relation.b) || '?'}：${relation.label}`
    }).join('\n') || '（暂无）'}`,
    `【作品大纲】\n${data.outline.mainline || '（暂无）'}`,
    '',
    `请只输出重新整理后的「${SECTION_LABELS[section] || SECTION_LABELS.all}」内容。`
  ].filter(Boolean).join('\n')
}

/** 章级元数据：只引用作品级人物/物品 key，名称永远取主数据，避免双写漂移。 */
export const emptyChapterMeta = chapterNo => ({
  chapterNo: Number(chapterNo) || 1,
  cast: [],
  items: [],
  edges: [],
  generatedAt: '',
  source: 'manual'
})

export function normalizeChapterMeta(raw, chapterNo = 1) {
  const source = raw && typeof raw === 'object' ? raw : {}
  return {
    chapterNo: Number(source.chapterNo) || Number(chapterNo) || 1,
    cast: (Array.isArray(source.cast) ? source.cast : []).map(entry => ({
      key: cleanText(entry?.key),
      name: cleanText(entry?.name),
      role: cleanText(entry?.role),
      change: cleanText(entry?.change)
    })).filter(entry => entry.key),
    items: (Array.isArray(source.items) ? source.items : []).map(entry => ({
      key: cleanText(entry?.key),
      name: cleanText(entry?.name),
      role: cleanText(entry?.role),
      change: cleanText(entry?.change)
    })).filter(entry => entry.key),
    edges: (Array.isArray(source.edges) ? source.edges : []).map(edge => ({
      a: cleanText(edge?.a),
      b: cleanText(edge?.b),
      label: cleanText(edge?.label) || '关系待补充',
      dash: edge?.dash === true,
      color: cleanText(edge?.color) || '#4a6c74'
    })).filter(edge => edge.a && edge.b && edge.a !== edge.b),
    generatedAt: cleanText(source.generatedAt),
    aiSummary: cleanText(source.aiSummary),
    source: source.source === 'ai' ? 'ai' : 'manual'
  }
}

/** 新建章节提示词：依据作品资料 + 前情，产出「标题/概要/本章人物/物品/关系」。 */
export function chapterDraftPrompt({ work, blueprint, chapters = [], chapterNo = 1, instruction = '' }) {
  const data = normalizeBlueprint(blueprint)
  const ledger = blueprintToLedger(data)
  const previous = chapters
    .filter(chapter => Number(chapter.chapterNo) < Number(chapterNo) && cleanText(chapter.summary))
    .sort((a, b) => Number(a.chapterNo) - Number(b.chapterNo))
    .slice(-3)
  const prevText = previous.map(chapter => `第${chapter.chapterNo}章《${chapter.chapterTitle || ''}》：${cleanText(chapter.summary)}`).join('\n')
  const names = data.characters.map(character => `${character.name}（${character.role || '身份'}）`).join('、')
  return [
    `请为《${cleanText(work?.title) || '本作品'}》生成第 ${chapterNo} 章的分集资料，只处理这一章，不要写正文。`,
    '',
    `【作品资料】\n${ledger.storySummary || ''}`,
    `【核心冲突】${data.storyCore.coreConflict || '未提供'}`,
    `【主要人物】${names || '未提供'}`,
    `【关键物品】${data.items.map(item => `${item.name}（${item.state || '状态待定'}）`).join('、') || '未提供'}`,
    `【作品大纲】${data.outline.mainline || '未提供'}`,
    data.world.rules.length ? `【世界规则】\n${data.world.rules.map(rule => `${rule.name}：${rule.detail}`).join('\n')}` : '',
    prevText ? `【前情摘要】\n${prevText}` : '【前情摘要】本章是开篇，没有前情。',
    instruction ? `【作者意见】\n${cleanText(instruction)}` : '',
    '',
    '严格按下面的格式输出，不要解释、不要 JSON、不要 Markdown 代码块：',
    '章节标题：4-10 字，点明本章核心事件',
    '章节概要：150-300 字，写清本章从哪个动作接起、发生了什么、结果如何、结尾留什么钩子',
    '本章出场：角色A、角色B（只写作品资料里已有的人物）',
    '本章物品：物品A、物品B（只写作品资料里已有的物品）',
    '本章关系：A ↔ B：本章这段关系的变化（0-3 条）'
  ].filter(Boolean).join('\n')
}

function findCharacterByName(name, characters) {
  const wanted = cleanText(name)
  if (!wanted) return null
  return characters.find(character => character.name === wanted)
    || characters.find(character => wanted.includes(character.name) || character.name.includes(wanted))
    || null
}

function findItemByName(name, items) {
  const wanted = cleanText(name)
  if (!wanted) return null
  return items.find(item => item.name === wanted)
    || items.find(item => wanted.includes(item.name) || item.name.includes(wanted))
    || null
}

const NAME_SPLIT = /[、，,／/；;和与]+/

/**
 * 解析新建章节的 AI 结果：JSON 优先，其次「章节标题/章节概要/本章出场/本章物品/本章关系」标签文本。
 * 任何字段缺失都从概要里回填；仍然没有时只保留空壳，页面可手填。
 */
export function chapterDraftParse(value, { chapterNo = 1, blueprint, chapters = [] } = {}) {
  const data = normalizeBlueprint(blueprint)
  const text = str(value)
  const json = parseJsonLoose(text)
  const labelled = {
    title: labelledValue(text, ['章节标题', '标题']),
    summary: labelledValue(text, ['章节概要', '内容概要', '概要', '本章概要']),
    cast: labelledValue(text, ['本章出场', '出场人物', '本章人物']),
    items: labelledValue(text, ['本章物品', '本章道具']),
    relations: labelledValue(text, ['本章关系', '人物关系'])
  }
  const object = json && typeof json === 'object' ? json : {}
  const summary = cleanText(object.summary) || labelled.summary || stripChapterLabels(text)
  const castNames = Array.isArray(object.cast)
    ? object.cast.map(entry => typeof entry === 'string' ? entry : entry?.name || entry?.key)
    : cleanText(labelled.cast).split(NAME_SPLIT)
  const itemNames = Array.isArray(object.items)
    ? object.items.map(entry => typeof entry === 'string' ? entry : entry?.name || entry?.key)
    : cleanText(labelled.items).split(NAME_SPLIT)
  // 出场判定：概要提到优先；未注明才回填部分；两项都缺时只展示前三人，避免空页。
  const mentionedCharacters = data.characters.filter(character => summary.includes(character.name))
  const explicitCast = unique(castNames.map(name => findCharacterByName(name, data.characters)?.key))
    .map(key => data.characters.find(character => character.key === key))
    .filter(Boolean)
  const castCharacters = explicitCast.length
    ? explicitCast
    : (mentionedCharacters.length ? mentionedCharacters : data.characters.slice(0, 3))
  const cast = castCharacters.map((character, index) => {
    const explicit = Array.isArray(object.cast) ? object.cast.find(entry => (entry?.name || entry?.key) === character.name || entry?.key === character.key) : null
    const sentence = sentenceWith(summary, character.name)
    return {
      key: character.key,
      role: cleanText(explicit?.role) || character.role || '本章出场',
      change: cleanText(explicit?.change) || sentence || (index === 0 ? '本章推动主线。' : '本章出场。')
    }
  })
  const mentionedItems = data.items.filter(item => summary.includes(item.name))
  const explicitItems = unique(itemNames.map(name => findItemByName(name, data.items)?.key))
    .map(key => data.items.find(item => item.key === key))
    .filter(Boolean)
  const itemKeys = mentionedItems.length ? mentionedItems : (explicitItems.length ? explicitItems : data.items.slice(0, 2))
  const items = itemKeys.map(item => {
    const explicit = Array.isArray(object.items) ? object.items.find(entry => (entry?.name || entry?.key) === item.name || entry?.key === item.key) : null
    return {
      key: item.key,
      role: cleanText(explicit?.role) || item.state || '本章出场',
      change: cleanText(explicit?.change) || sentenceWith(summary, item.name) || '本章出现。'
    }
  })
  // 本章关系：显式 JSON 边优先，其次「本章关系：A ↔ B：…」文本，最后才回落到本章出场者的作品级关系。
  const explicitEdges = Array.isArray(object.edges) && object.edges.length
    ? normalizeChapterMeta({ edges: object.edges }, chapterNo).edges
    : relationsFromLines(labelled.relations, data.characters)
  const edges = explicitEdges.length
    ? explicitEdges
    : data.relations.filter(relation => cast.some(entry => entry.key === relation.a) && cast.some(entry => entry.key === relation.b))
  return {
    title: cleanText(object.title) || labelled.title || `第 ${chapterNo} 章`,
    summary,
    cast,
    items,
    edges,
    aiSummary: summary,
    tokens: Number(object.tokens) || null,
    recordId: Number(object.recordId) || null
  }
}

function sentenceWith(text, keyword) {
  if (!keyword) return ''
  return cleanText(text).split(/[。！？!?\n]/).map(sentence => sentence.trim()).find(sentence => sentence.includes(keyword)) || ''
}

function stripChapterLabels(value) {
  return cleanText(value).split('\n').filter(line => !/^[\s#>*【\[]*(?:章节标题|标题|章节概要|内容概要|概要|本章出场|本章人物|本章物品|本章道具|本章关系|人物关系)[】\]*]\s*[：:]/.test(line)).join('\n').trim()
}

/**
 * AI 创作抽屉提示词：
 * - write：小说/剧本文本，注入作品资料、本章概要、上一章末尾；
 * - storyboard：逐镜换行，后端只有 `script` 入参，因此拼成可直接投喂的分镜指令。
 */
export function studioWritePrompt({ mode = 'text', refs = {}, work, blueprint, chapter, ledger, prevChapter = '', instruction = '' }) {
  const data = normalizeBlueprint(blueprint)
  const castNames = (chapter?.cast || []).map(entry => data.characters.find(character => character.key === entry.key)?.name).filter(Boolean)
  const ledgerBlock = refs.work === false ? '' : (ledger ? ledgerPromptBlockByCast(ledger, castNames) : '')
  const summaryBlock = refs.summary === false ? '' : cleanText(chapter?.summary) ? `【本章概要】\n${cleanText(chapter.summary)}` : ''
  const prevBlock = refs.prev ? cleanText(prevChapter) ? `【上一章末尾（承接语气与处境，勿重复）】\n${chapterTail(prevChapter)}` : '' : ''
  const title = cleanText(work?.title) || '本作品'
  const chapterTitle = cleanText(chapter?.chapterTitle) || `第 ${chapter?.chapterNo || 1} `
  const requirement = cleanText(instruction) || (mode === 'text' ? '依据已选资料，写完整的一章。' : '依据已选资料，拆成分镜页可用的行。')
  const head = mode === 'text'
    ? `请写《${title}》${chapterTitle}的正文，只写这一章：以动作和对白推进，开头直接进入场景，结尾留一个具体钩子，不超过 1500 字。`
    : `请把《${title}》${chapterTitle}拆成可直接拍摄的分镜。每镜一行，格式为「镜号 景别｜画面与动作｜运镜与声音」，只输出分镜行。`
  return [head, ledgerBlock, summaryBlock, prevBlock, `【作者要求】\n${requirement}`].filter(Boolean).join('\n\n')
}

/** 分镜接口只有 script 必填：把参考资料与本章内容拼成一段可直接送模型的剧本。 */
export function studioStoryboardScript({ refs = {}, work, blueprint, chapter, ledger, prevChapter = '', currentContent = '', instruction = '' }) {
  const data = normalizeBlueprint(blueprint)
  const castNames = (chapter?.cast || []).map(entry => data.characters.find(character => character.key === entry.key)?.name).filter(Boolean)
  const ledgerBlock = refs.work === false ? '' : (ledger ? ledgerPromptBlockByCast(ledger, castNames) : '')
  const summaryBlock = refs.summary === false ? '' : cleanText(chapter?.summary) ? `【本章概要】\n${cleanText(chapter.summary)}` : ''
  const prevBlock = refs.prev && cleanText(prevChapter) ? `【上一章末尾】\n${chapterTail(prevChapter)}` : ''
  const body = cleanText(currentContent) || cleanText(chapter?.summary)
  return [
    `本章为《${cleanText(work?.title) || '本作品'}》${cleanText(chapter?.chapterTitle) || `第 ${chapter?.chapterNo || 1} 章`}。请拆成分镜。`,
    ledgerBlock,
    summaryBlock,
    prevBlock,
    body ? `【本章文本】\n${body}` : '',
    cleanText(instruction) ? `【分镜要求】\n${cleanText(instruction)}` : '【分镜要求】逐镜换行，标注景别与运镜。'
  ].filter(Boolean).join('\n\n')
}

/** 正文插入：格式化文档追加段落，纯文本保持空行分隔；不覆盖已有内容。 */
export function appendToDocument(content, text) {
  const addition = cleanText(text)
  if (!addition) return str(content)
  const escape = value => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const paragraphs = addition.split(/\n{2,}/).map(part => part.trim()).filter(Boolean)
    .map(part => `<p>${escape(part).replace(/\n/g, '<br>')}</p>`).join('')
  if (isFormattedDocument(content)) return str(content).replace(/<\/div>\s*$/, paragraphs + '</div>')
  return [str(content).trim(), addition].filter(Boolean).join('\n\n')
}

/** 分镜追加：保留已有镜号，AI 结果按已有最大镜号续号，返回新内容与新增条数。 */
export function appendStoryboard(existing, incoming) {
  const current = cleanText(existing)
  const start = Math.max(0, ...current.split('\n').map(line => Number((line.match(/^\s*(\d{1,4})/) || [])[1]) || 0))
  const rows = compact(incoming).map(line => line.replace(/^\s*\d{1,4}\s*[.、:：|｜]?\s*/, '').trim()).filter(Boolean)
  if (!rows.length) return { content: current, added: 0 }
  const numbered = rows.map((line, index) => `${String(start + index + 1).padStart(2, '0')} ${line}`)
  return { content: [current, numbered.join('\n')].filter(Boolean).join('\n'), added: numbered.length }
}

/** 章节三态指示灯：概（概要非空）/ 文（去空白 ≥20 字）/ 镜（分镜非空且可读）。 */
export function chapterStatusDots(chapter, storyboard) {
  const summary = cleanText(chapter?.summary)
  const text = cleanText(chapter?.plainText ?? chapter?.content)
  const board = storyboard && storyboard.readable === false ? '' : cleanText(storyboard?.content)
  return [
    { key: 'summary', label: '概', on: Boolean(summary) },
    { key: 'text', label: '文', on: text.replace(/\s/g, '').length >= 20 },
    { key: 'storyboard', label: '镜', on: Boolean(board) }
  ]
}

/** 底部状态栏统计：正文字数、分镜行数、本章人物/物品/关系数。 */
export function chapterStats({ chapter, storyboard, meta } = {}) {
  const content = cleanText(chapter?.plainText ?? chapter?.content)
  const shots = cleanText(storyboard?.content).split('\n').filter(line => line.trim()).length
  return {
    words: content.replace(/\s/g, '').length,
    shots,
    cast: meta?.cast?.length || 0,
    items: meta?.items?.length || 0,
    relations: meta?.edges?.length || 0,
    summaryWords: cleanText(chapter?.summary).replace(/\s/g, '').length
  }
}

/** 分钟数的展示口径：2 → 2 分钟，1.5 → 1.5 分钟。 */
export const minutesText = value => `${Number(value) === Number.parseInt(value, 10) ? Number(value) : Number(value).toFixed(1)} 分钟`
