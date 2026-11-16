/** 结算 / 提现文案与金额（对齐 App income_models；overview 为元，列表金额为分）。 */

export const SETTLE_STATUS = {
  pending: '待确认',
  disputed: '有异议',
  confirmed: '已入账'
}

export const WITHDRAW_STATUS = {
  pending: '待审核',
  approved: '已通过',
  rejected: '已驳回',
  frozen: '已冻结',
  paid: '已打款'
}

export const WITHDRAW_TYPES = [
  { value: 'alipay', label: '支付宝' },
  { value: 'wechat', label: '微信' },
  { value: 'bank', label: '银行卡' }
]

export const BILL_TYPES = {
  income: '订单收入',
  withdraw: '提现支出',
  freeze: '资金冻结',
  settle: '分成结算'
}

export const settleStatusLabel = status => SETTLE_STATUS[status] || status || '未知'
export const withdrawStatusLabel = status => WITHDRAW_STATUS[status] || status || '未知'
export const withdrawTypeLabel = type => WITHDRAW_TYPES.find(item => item.value === type)?.label || type || '—'
export const billTypeLabel = (source, type) => source || BILL_TYPES[type] || type || '未知'

export const settleStatusTone = status => ({
  pending: 'wait',
  disputed: 'bad',
  confirmed: 'ok'
}[status] || 'off')

export const withdrawStatusTone = status => ({
  pending: 'wait',
  approved: 'ok',
  paid: 'ok',
  rejected: 'bad',
  frozen: 'off'
}[status] || 'off')

export const canConfirmSettle = status => status === 'pending' || status === 'disputed'
export const canDisputeSettle = status => status === 'pending'

export function toYuanNumber(value) {
  if (value == null || value === '') return 0
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}

/** overview / stats：后端返回元。 */
export function yuanText(value) {
  return '¥' + toYuanNumber(value).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** 结算单 / 账单 / 提现记录：后端返回分。 */
export function fenText(value, { signed = false } = {}) {
  if (value == null || value === '') return '—'
  const fen = Number(value)
  if (!Number.isFinite(fen)) return '—'
  const yuan = fen / 100
  const text = yuanText(Math.abs(yuan)).replace('¥', '')
  if (!signed) return '¥' + text
  const prefix = fen > 0 ? '+' : fen < 0 ? '−' : ''
  return prefix + '¥' + text
}

export function splitRateLabel(rate) {
  if (rate == null || rate === '') return '—'
  const num = Number(rate)
  if (!Number.isFinite(num)) return '—'
  const pct = Math.abs(num) <= 1 ? num * 100 : num
  if (pct === Math.round(pct)) return `${pct.toFixed(0)}%`
  return `${pct.toFixed(2)}%`
}

export function maskAccount(accountNo) {
  const no = String(accountNo || '')
  if (no.length <= 4) return no || '—'
  return '*'.repeat(no.length - 4) + no.slice(-4)
}
