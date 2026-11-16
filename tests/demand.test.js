import test from 'node:test'
import assert from 'node:assert/strict'
import * as demandUtils from '../src/utils/demand.js'
import {
  isActiveStage,
  money,
  stageStatusLabel,
  taskTypeDeliverHint,
  taskTypeLabel,
  taskTypeOptions
} from '../src/utils/demand.js'

// 托管与押金随「平台代发任务」口径一起退役：资金在平台与需求方之间线下结清，
// 创作者侧不再有 ESCROW_* / DEPOSIT_* 两笔钱，枚举与页面都不得再出现这两个概念。
test('任务枚举不再导出托管与押金状态', () => {
  assert.equal('escrowStatusLabel' in demandUtils, false)
  assert.equal('depositStatusLabel' in demandUtils, false)
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

// 任务三分类（sys_demand.task_type）与 APP/管理端同口径：
// 值域缺一即后端 normalizeAndValidateTaskType 会抛「任务类型不正确」，
// 文案漂移会让接单方按错误的交付预期报价，故在此钉死。
const TASK_TYPE_CODES = ['script', 'script_storyboard', 'storyboard']
const TASK_TYPE_TEXTS = {
  script: '只征集剧本',
  script_storyboard: '剧本+分镜',
  storyboard: '提供剧本做分镜'
}
const TASK_TYPE_HINTS = {
  script: '逐轮交付本人未上架的剧本作品，AI 剧本审核通过后进入平台人工验收',
  script_storyboard: '逐轮交付剧本作品，分镜以文件链接或交付说明随本轮一并提交，AI 剧本审核通过后进入人工验收',
  storyboard: '按平台提供的源剧本产出分镜：交付分镜文件或填写交付说明即可（作品可选），提交后直接进入人工验收'
}

test('任务类型值域与中文标签与后端常量逐一对应', () => {
  assert.deepEqual(taskTypeOptions.map(o => o.value), TASK_TYPE_CODES)
  for (const code of TASK_TYPE_CODES) {
    assert.equal(taskTypeLabel(code), TASK_TYPE_TEXTS[code])
  }
})

test('历史数据与旧客户端不带 taskType 时回落只征集剧本', () => {
  for (const blank of [undefined, null, '', 'unknown_type']) {
    assert.equal(taskTypeLabel(blank), '只征集剧本')
    assert.equal(taskTypeDeliverHint(blank), TASK_TYPE_HINTS.script)
  }
})

test('三类交付口径文案逐字对齐 APP，且分镜类不提 AI 剧本审核', () => {
  for (const code of TASK_TYPE_CODES) {
    assert.equal(taskTypeDeliverHint(code), TASK_TYPE_HINTS[code])
  }
  assert.doesNotMatch(TASK_TYPE_HINTS.storyboard, /AI 剧本审核/)
  assert.match(TASK_TYPE_HINTS.storyboard, /源剧本/)
})
