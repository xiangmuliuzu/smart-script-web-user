import test from 'node:test'
import assert from 'node:assert/strict'
import {
  depositStatusLabel,
  escrowStatusLabel,
  isActiveStage,
  money,
  stageStatusLabel
} from '../src/utils/demand.js'

// 后端权威枚举：ESCROW_* 是发布者放进平台的预算款，DEPOSIT_* 是创作者缴的履约保证金。
// held 曾被译作「已托管」，与 escrowed「已托管」撞词，卡片上出现「托管：已托管 · 押金：已托管」，
// 用户完全分不出两笔钱；这里把两套文案钉住，防止后人再抄回旧词。
const ESCROW_VALUES = ['none', 'pending_payment', 'escrowed', 'released', 'refunded_to_publisher']
const DEPOSIT_VALUES = ['none', 'held', 'refunded', 'forfeited']

test('押金与托管两套状态都有后端枚举的中文译文，不留英文原值', () => {
  for (const value of ESCROW_VALUES) {
    assert.notEqual(escrowStatusLabel(value), value, `托管 ${value} 缺中文文案`)
  }
  for (const value of DEPOSIT_VALUES) {
    assert.notEqual(depositStatusLabel(value), value, `押金 ${value} 缺中文文案`)
  }
  assert.equal(escrowStatusLabel('escrowed'), '已托管')
  assert.equal(depositStatusLabel('held'), '在押')
})

test('押金文案与托管文案不共用任何一个词，两笔钱在页面上分得开', () => {
  const escrowLabels = ESCROW_VALUES.map(escrowStatusLabel)
  const overlapped = DEPOSIT_VALUES.map(depositStatusLabel).filter(label => escrowLabels.includes(label))
  assert.deepEqual(overlapped, [], `押金/托管文案撞词：${overlapped.join('、')}`)
})

test('轮次进行中以 startedAt 判定，不看 status（activateStage 不改 status）', () => {
  assert.equal(isActiveStage({ status: 'pending', startedAt: '2026-11-05T10:00:00' }), true)
  assert.equal(isActiveStage({ status: 'pending', startedAt: null }), false)
  assert.equal(isActiveStage(null), false)
  assert.equal(stageStatusLabel({ status: 'submitted' }), '待验收')
})

// 任务域金额入参为「分」，格式化复用收益域同一个 fenText：
// 同一页面不能既出现 ¥600 又出现 ¥600.00。
test('任务金额与收益域同一小数口径，一律两位', () => {
  assert.equal(money(60000), '¥600.00')
  assert.equal(money(60050), '¥600.50')
  assert.equal(money(0), '¥0.00')
  assert.equal(money(null), '¥0.00')
})
