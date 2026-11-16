import test from 'node:test'
import assert from 'node:assert/strict'
import {
  canConfirmSettle,
  canDisputeSettle,
  fenText,
  maskAccount,
  settleStatusLabel,
  splitRateLabel,
  yuanText
} from '../src/utils/finance.js'

test('overview amounts stay in yuan and list amounts convert from fen', () => {
  assert.equal(yuanText(64000), '¥64,000.00')
  assert.equal(fenText(4800000), '¥48,000.00')
  assert.equal(fenText(-1200000, { signed: true }), '−¥12,000.00')
  assert.equal(fenText(2100, { signed: true }), '+¥21.00')
})

test('settle actions and split rate follow App rules', () => {
  assert.equal(canConfirmSettle('pending'), true)
  assert.equal(canConfirmSettle('disputed'), true)
  assert.equal(canConfirmSettle('confirmed'), false)
  assert.equal(canDisputeSettle('pending'), true)
  assert.equal(canDisputeSettle('disputed'), false)
  assert.equal(settleStatusLabel('pending'), '待确认')
  assert.equal(splitRateLabel(0.05), '5%')
  assert.equal(splitRateLabel(0.2), '20%')
  assert.equal(maskAccount('13800001234'), '*******1234')
})
