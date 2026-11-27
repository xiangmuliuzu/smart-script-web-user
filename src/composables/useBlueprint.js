import { getToken } from '../auth.js'
import { normalizeBlueprint, normalizeChapterMeta } from '../utils/blueprint.js'

/**
 * Blueprint / ChapterMeta 的前端适配层（临时替代后端缺失的 v3 结构化存储）。
 *
 * 后端目前只有 ledger 十类自由文本，没有 /ai/blueprint/* 与 /chapter-meta。
 * 这里按「用户 + 作品」维度把结构化资料落在 localStorage：
 * - 刷新页面、切换作品、打开旧作品都能原样恢复；
 * - 换账号不会串号（key 带用户标识）；
 * - 任何读写失败（隐私模式 / 配额满 / 坏 JSON）都静默降级，绝不阻塞页面。
 * 真正的权威数据仍是 ledger（确认进入工作台时会写回），localStorage 只补齐结构化视图。
 */

const PREFIX = 'PcUser-Blueprint'
const META_PREFIX = 'PcUser-ChapterMeta'
const DRAFT_PREFIX = 'PcUser-StudioDraft'
const AI_SUMMARY_SEEN_PREFIX = 'PcUser-AiSummarySeen'
const seenAiSummaryKeys = new Set()

/** 实例标识：取 token 尾部做命名空间，未登录/测试环境退化为 anonymous。 */
export function storageOwner() {
  let token = ''
  try { token = String(getToken() || '') } catch { token = '' }
  if (!token) return 'anonymous'
  let hash = 0
  for (const char of token) hash = (hash * 31 + char.charCodeAt(0)) % 0x7fffffff
  return hash.toString(36)
}

function safeStorage() {
  try {
    if (typeof localStorage === 'undefined' || !localStorage) return null
    return localStorage
  } catch { return null }
}

function readJson(key) {
  const storage = safeStorage()
  if (!storage) return null
  try {
    const raw = storage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function writeJson(key, value) {
  const storage = safeStorage()
  if (!storage) return false
  try {
    if (value == null) storage.removeItem(key)
    else storage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    // 配额满或隐私模式：保留内存态，不影响面继续使用。
    return false
  }
}

const workScope = workId => `${PREFIX}:${storageOwner()}:${encodeURIComponent(workId || 'draft')}`
const metaScope = workId => `${META_PREFIX}:${storageOwner()}:${encodeURIComponent(workId || 'draft')}`

/** 读取某作品的结构化 Blueprint；不存在返回 null（由调用方回退到 ledger）。 */
export function readBlueprint(workId) {
  const raw = readJson(workScope(workId))
  return raw ? normalizeBlueprint(raw) : null
}

/** 写入结构化 Blueprint，返回是否落盘成功（失败时调用方仍可继续使用内存态）。 */
export function writeBlueprint(workId, blueprint) {
  if (workId == null) return false
  return writeJson(workScope(workId), normalizeBlueprint(blueprint))
}

export function clearBlueprint(workId) {
  return writeJson(workScope(workId), null)
}

/** 起稿页 → 资料确认页之间的一次性交接（sessionStorage，刷新即失效）。 */
const DRAFT_KEY = 'PcUser-BlueprintDraft'

export function stashDraft(payload) {
  try {
    if (typeof sessionStorage === 'undefined') return false
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(payload))
    return true
  } catch { return false }
}

export function takeDraft() {
  try {
    if (typeof sessionStorage === 'undefined') return null
    const raw = sessionStorage.getItem(DRAFT_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

export function clearDraft() {
  try { sessionStorage?.removeItem(DRAFT_KEY) } catch { /* 忽略 */ }
}

/** 章级元数据整表：{ [chapterNo]: ChapterMeta }。 */
export function readChapterMetas(workId) {
  const raw = readJson(metaScope(workId))
  if (!raw || typeof raw !== 'object') return {}
  const result = {}
  for (const [no, value] of Object.entries(raw)) {
    const chapterNo = Number(no)
    if (!Number.isFinite(chapterNo) || chapterNo < 1) continue
    result[chapterNo] = normalizeChapterMeta(value, chapterNo)
  }
  return result
}

export function readChapterMeta(workId, chapterNo) {
  const all = readChapterMetas(workId)
  return all[Number(chapterNo)] || null
}

export function writeChapterMeta(workId, chapterNo, meta) {
  if (workId == null || !chapterNo) return false
  const all = readChapterMetas(workId)
  all[Number(chapterNo)] = normalizeChapterMeta(meta, chapterNo)
  return writeJson(metaScope(workId), all)
}

export function removeChapterMeta(workId, chapterNo) {
  if (workId == null || !chapterNo) return false
  const all = readChapterMetas(workId)
  if (!all[Number(chapterNo)]) return true
  delete all[Number(chapterNo)]
  return writeJson(metaScope(workId), all)
}

export function clearChapterMetas(workId) {
  return writeJson(metaScope(workId), null)
}

/** 未保存草稿缓冲：仅在保存失败时兜底，绝不作为权威源。 */
export function readStudioDraft(workId) {
  return readJson(`${DRAFT_PREFIX}:${storageOwner()}:${encodeURIComponent(workId || '')}`)
}

export function writeStudioDraft(workId, draft) {
  return writeJson(`${DRAFT_PREFIX}:${storageOwner()}:${encodeURIComponent(workId || '')}`, draft)
}

export function clearStudioDraft(workId) {
  return writeJson(`${DRAFT_PREFIX}:${storageOwner()}:${encodeURIComponent(workId || '')}`, null)
}

const aiSummaryScope = workId => `${AI_SUMMARY_SEEN_PREFIX}:${storageOwner()}:${encodeURIComponent(workId || '')}`

/** 查询某章「AI 已生成本章起稿概要」提示是否已展示过。 */
export function hasSeenAiSummaryHint(workId, chapterNo) {
  const no = Number(chapterNo)
  if (!workId || !Number.isFinite(no) || no < 1) return false
  const scope = aiSummaryScope(workId)
  if (seenAiSummaryKeys.has(`${scope}:${no}`)) return true
  const list = readJson(scope)
  return Array.isArray(list) && list.map(Number).includes(no)
}

/** 标记某章「AI 已生成本章起稿概要」提示已展示过，后续切换回来或重进页面不再显示。 */
export function markAiSummaryHintSeen(workId, chapterNo) {
  const no = Number(chapterNo)
  if (!workId || !Number.isFinite(no) || no < 1) return false
  const scope = aiSummaryScope(workId)
  seenAiSummaryKeys.add(`${scope}:${no}`)
  const existing = readJson(scope)
  const list = Array.isArray(existing) ? existing.map(Number).filter(n => Number.isFinite(n) && n >= 1) : []
  if (!list.includes(no)) list.push(no)
  return writeJson(scope, list)
}
