/* ─── 任务广场（需求悬赏）枚举与格式化：状态字典一律以后端常量为源，不得自行编造 ─── */
/* 后端源：smartscript-trade SysDemand / SysDemandStage / SysDemandExtendApply 常量 */
import { fenText } from './finance.js'

// 任务主状态（DEMAND_STATUS_*）：open 征集中、in_progress 已接单进行中、selected 已选定（走中标询盘）、
// completed 全部轮次验收通过、closed 发布者关闭、failed 活动轮超时终止
const DEMAND_STATUS_LABELS = { open: '征集中', in_progress: '进行中', selected: '已选定', completed: '已完成', closed: '已关闭', failed: '已失败' }
export const demandStatusLabel = s => DEMAND_STATUS_LABELS[s] || s || '-'
export const demandStatusOptions = Object.entries(DEMAND_STATUS_LABELS).map(([value, label]) => ({ value, label }))

// 托管资金状态（ESCROW_*）
const ESCROW_LABELS = { none: '未托管', pending_payment: '待付托管', escrowed: '已托管', released: '已放款', refunded_to_publisher: '已退回发布者' }
export const escrowStatusLabel = s => ESCROW_LABELS[s] || s || '-'

// 押金资金状态（DEPOSIT_*）：held 由「付押金→查单确认」写入，即接单成功。
// 押金与托管是两笔不同的钱：押金(deposit)是创作者缴的履约保证金，不是发布者托管的预算款(escrow)，
// 文案不能复用「已托管」，否则卡片上「托管：已托管 · 押金：已托管」完全分不开。
const DEPOSIT_LABELS = { none: '未缴', held: '在押', refunded: '已退还', forfeited: '已没收' }
export const depositStatusLabel = s => DEPOSIT_LABELS[s] || s || '-'

/* 验收轮次：后端激活某轮只写 started_at/due_at，status 仍是 pending，
   所以「进行中」必须由 startedAt 判定，不能只看 status。 */
const STAGE_STATUS_LABELS = { ai_reviewing: 'AI 审核中', submitted: '待验收', approved: '已通过', rejected: '已驳回' }
export function stageStatusLabel(stage) {
  if (!stage) return '-'
  if (STAGE_STATUS_LABELS[stage.status]) return STAGE_STATUS_LABELS[stage.status]
  if (!stage.startedAt) return '未开始'
  return stage.overdue ? '已逾期' : '进行中'
}
export const stageTone = stage => {
  const label = stageStatusLabel(stage)
  if (label === '已通过') return 'ok'
  if (label === '已驳回' || label === '已逾期') return 'danger'
  if (label === '待验收' || label === 'AI 审核中') return 'warn'
  if (label === '进行中') return 'info'
  return 'off'
}
// 活动轮：已激活、未通过、未提交待验收，且没有待处理的延时申请（延时 pending 期间暂停超时判定）
export const isActiveStage = stage => !!stage && !!stage.startedAt
  && ['pending', 'rejected'].includes(stage.status) && stage.extendStatus !== 'pending'

/* AI 审核结论：后端 AiReviewService 提示词定义 score 越高越合规、level 为风险等级
   （>=85 low、60–84 medium、<60 high），展示必须给中文，不能把 low 这类英文枚举直接展示给用户。*/
const AI_LEVEL_LABELS = { low: '低风险', medium: '中风险', high: '高风险' }
export function aiBrief(raw) {
  if (!raw) return '无结论摘要'
  let obj = raw
  if (typeof raw === 'string') { try { obj = JSON.parse(raw) } catch { return raw.slice(0, 60) } }
  const level = AI_LEVEL_LABELS[obj?.level] || obj?.level || ''
  const issues = Array.isArray(obj?.issues) && obj.issues.length ? `${obj.issues.length} 处待改进` : ''
  return [level, issues].filter(Boolean).join(' · ') || '无结论摘要'
}
// 轮次截止配色：只有当前活动轮需要盯时限，逾期红、临期橙；已通过/未开始的轮次保持中性
export const dueTone = stage => {
  if (!stage?.dueAt) return 'off'
  if (stage.overdue) return 'danger'
  return isActiveStage(stage) && countdown(stage.dueAt).urgent ? 'warn' : 'off'
}

/* 延时记录（sys_demand_extend_apply）：申请延时与自主延时共用同一张表，按 applyType 区分来源 */
const EXTEND_TYPE_LABELS = { request: '申请延时', self: '自主延时' }
const EXTEND_STATUS_LABELS = { pending: '待处理', approved: '已同意', rejected: '已驳回' }
export const extendTypeLabel = t => EXTEND_TYPE_LABELS[t] || t || '申请延时'
export const extendStatusLabel = (status, applyType) => {
  if (applyType === 'self') return status === 'approved' ? '已生效' : EXTEND_STATUS_LABELS[status] || status || '-'
  return EXTEND_STATUS_LABELS[status] || status || '-'
}
export const extendTone = (status, applyType) => {
  if (applyType === 'self') return 'ok'
  if (status === 'pending') return 'warn'
  if (status === 'approved') return 'ok'
  return 'off'
}

/* 金额：后端出参一律为分（/list、/{id}、/stages、/stats 的 prizePoolFen），展示时除以 100。
   格式化复用收益域同一个 fenText（tests/finance.test.js 已锁定 ¥64,000.00 这种两位小数），
   本文件不再自行决定补不补零，避免同一页面出现 ¥600 与 ¥600.00 两种位数。 */
export const fenToYuan = fen => (Number(fen) || 0) / 100
export const money = fen => fenText(Number(fen) || 0)

const pad = n => String(n).padStart(2, '0')
// 后端 JSON 已格式化到秒（yyyy-MM-dd HH:mm:ss），iOS Safari 不能直接 new Date(带 - 的字符串)，统一按本地时间解析
function toDate(value) {
  if (!value) return null
  if (value instanceof Date) return value
  const matched = String(value).match(/(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/)
  if (matched) return new Date(+matched[1], +matched[2] - 1, +matched[3], +matched[4], +matched[5], +(matched[6] || 0))
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}
export const timeText = value => {
  const date = toDate(value)
  return date ? `${date.getMonth() + 1}月${date.getDate()}日 ${pad(date.getHours())}:${pad(date.getMinutes())}` : '-'
}
export const dateText = value => {
  const date = toDate(value)
  return date ? `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` : '-'
}
/* 倒计时：只标当前活动轮剩余时间，形如「剩余 3 天 5 小时」，不足 1 小时到分钟，逾期转负向文案 */
export function countdown(dueAt) {
  const due = toDate(dueAt)
  if (!due) return { text: '待设定截止时间', overdue: false, urgent: false }
  const diff = due.getTime() - Date.now()
  if (diff <= 0) return { text: '已逾期', overdue: true, urgent: true }
  const minutes = Math.floor(diff / 60000)
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  if (days > 0) return { text: `剩余 ${days} 天 ${hours} 小时`, overdue: false, urgent: days <= 1 }
  if (hours > 0) return { text: `剩余 ${hours} 小时 ${minutes % 60} 分`, overdue: false, urgent: hours <= 6 }
  return { text: `剩余 ${Math.max(minutes, 1)} 分`, overdue: false, urgent: true }
}
/* 时长统一按小时填写/存储，展示时自动折算为「X 天 Y 小时」（兼容历史天+小时数据） */
export function formatHours(hours) {
  const total = Math.round(Number(hours) || 0)
  if (total <= 0) return '-'
  const days = Math.floor(total / 24)
  const rest = total % 24
  if (days > 0 && rest > 0) return `${days} 天 ${rest} 小时`
  if (days > 0) return `${days} 天`
  return `${rest} 小时`
}
/* 轮次时限展示：后端历史数据可能按天+小时存储，统一折算总小时后展示 */
export function durationText(stage) {
  const total = (Number(stage?.durationDays) || 0) * 24 + (Number(stage?.durationHours) || 0)
  if (total <= 0) return stage?.demandDurationHours ? formatHours(stage.demandDurationHours) : '时限未设'
  return formatHours(total)
}
/* 题材字典：任务 genreId 是独立于 sys_category 的固定枚举（1–7），
   与 APP 端 lib/core/constants/demand_genre.dart 的 DemandGenre.labels 逐项对齐；
   后端无该字典接口，PC 不另行拉 /content/categories（那里是作品分类树，id 域不同）。*/
export const DEMAND_GENRES = { 1: '都市', 2: '古装', 3: '玄幻', 4: '悬疑', 5: '甜宠', 6: '励志', 7: '其他' }
export const genreOptions = Object.entries(DEMAND_GENRES).map(([value, label]) => ({ value: Number(value), label }))
export const genreLabel = genreId => DEMAND_GENRES[Number(genreId)] || (genreId ? '其他' : '未分类')
/* 任务类型（sys_demand.task_type）：与后端 TradeDemandService.TASK_TYPE_* 及企业端 utils/demand.js 同口径 */
export const TASK_TYPE_LABELS = { script: '只征集剧本', script_storyboard: '剧本+分镜', storyboard: '提供剧本做分镜' }
export const taskTypeLabel = t => TASK_TYPE_LABELS[t] || TASK_TYPE_LABELS.script
export const taskTypeOptions = Object.entries(TASK_TYPE_LABELS).map(([value, label]) => ({ value, label }))
/* 各类型的交付口径（接单方视角），详情页与筛选结果都用它解释「这一类要交什么」 */
export const TASK_TYPE_DELIVER_HINTS = {
  script: '逐轮交付本人未上架的剧本作品，AI 剧本审核通过后进入发布者人工验收',
  script_storyboard: '逐轮交付剧本作品，分镜以文件链接或交付说明随本轮一并提交，AI 剧本审核通过后进入人工验收',
  storyboard: '按发布者提供的源剧本产出分镜：交付分镜文件或填写交付说明即可（作品可选），提交后直接进入人工验收',
}
export const taskTypeDeliverHint = t => TASK_TYPE_DELIVER_HINTS[t] || TASK_TYPE_DELIVER_HINTS.script
/* 排序白名单与后端 SysDemandMapper 一致：created / budget / deadline，非法值后端回落 created desc */
export const SORT_OPTIONS = [
  { value: 'created:desc', label: '最新发布' },
  { value: 'created:asc', label: '最早发布' },
  { value: 'budget:desc', label: '预算从高到低' },
  { value: 'budget:asc', label: '预算从低到高' },
  { value: 'deadline:asc', label: '截止日期临近' },
]
