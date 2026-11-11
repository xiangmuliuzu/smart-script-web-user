import test from 'node:test'
import assert from 'node:assert/strict'
import { ledgerPromptBlock, ledgerPromptBlockByCast, episodeCardFrom, episodeCastFrom, volumeSnapshotBlock, chapterSummaryBlock, chapterTail, continuationPrompt, checkGenerationRules } from '../src/utils/creatorAi.js'

const OUTLINE = '第1集：雨夜铜铃\n本集事件：顾星宇在祠堂发现铜铃\n冲突与推进：顾守山否认\n结果或反转：铜铃自己响了\n结尾钩子：门外有人\n第2集：旧照片\n本集事件：翻出老照片\n冲突与推进：父子争执\n结果或反转：照片背面有字\n结尾钩子：字迹是母亲的'

test('ledger block injects the six shared facts and skips empty ones', () => {
  const block = ledgerPromptBlock({ characters: '顾守山 45岁', relations: '父子', foreshadow: '铜铃第3集埋', timeline: '', items: '房梁', threads: '照片背面' })
  assert.match(block, /【创作台账（已定事实，不得冲突）】/)
  assert.match(block, /主要人物：\n顾守山 45岁/)
  assert.match(block, /人物关系：\n父子/)
  assert.match(block, /物品位置：\n房梁/)
  assert.doesNotMatch(block, /时间线/)
  assert.equal(ledgerPromptBlock({}), '')
})

test('episode card is picked by episode number first, then by name', () => {
  assert.match(episodeCardFrom(OUTLINE, '第2集：旧照片', 2), /本集事件：翻出老照片/)
  assert.match(episodeCardFrom(OUTLINE, '旧照片', 0), /本集事件：翻出老照片/)
  assert.equal(episodeCardFrom('没有任何分集标题', '任意', 3), '')
})

test('continuation prompt carries card, ledger, previous tail and requirement', () => {
  const prompt = continuationPrompt({ title: '第2集：旧照片', chapterNo: 2, outline: OUTLINE, ledger: { characters: '顾守山 45岁' }, prevChapter: 'x'.repeat(2000), currentContent: '本集已写一半', requirement: '加强父子冲突' })
  assert.match(prompt, /【本集事件卡】/)
  assert.match(prompt, /【创作台账（已定事实，不得冲突）】/)
  assert.match(prompt, /【上一章末尾（承接语气与处境，勿重复）】/)
  assert.match(prompt, /【本集已有正文（从末尾接着写）】/)
  assert.match(prompt, /加强父子冲突/)
})

test('chapter tail keeps only the last 800 characters', () => {
  assert.equal(chapterTail('a'.repeat(1500)).length, 800)
  assert.equal(chapterTail('短文本'), '短文本')
})

test('continuation prompt compresses current content to the last 1500 characters', () => {
  const prompt = continuationPrompt({ title: '第2集：旧照片', chapterNo: 2, outline: OUTLINE, prevChapter: '', currentContent: 'b'.repeat(4000), requirement: '继续' })
  assert.equal((prompt.match(/b/g) || []).length, 1500)
})

test('ledger block keeps the tail of each field, not the head', () => {
  const long = '旧'.repeat(400) + '最新状态'
  const block = ledgerPromptBlock({ characters: long })
  assert.ok(block.includes('最新状态'))
  assert.ok(!block.includes('旧'.repeat(400)))
})

test('cast filter injects only on-stage characters', () => {
  const ledger = {
    characters: '顾守山（45/男）：班主\n顾星宇（16/男）：学徒\n林素（40/女）：村医',
    relations: '顾守山 ↔ 顾星宇：父子\n林素 ↔ 顾守山：旧识',
  }
  const card = '第3集：祠堂夜\n本集事件：起坛\n本集出场：顾守山、顾星宇'
  assert.deepEqual(episodeCastFrom(card), ['顾守山', '顾星宇'])
  const block = ledgerPromptBlockByCast(ledger, episodeCastFrom(card))
  assert.ok(block.includes('顾守山'))
  assert.ok(!block.includes('村医'), '未出场人物的人物卡不应注入正文提示词')
})

test('volume snapshot injects current and previous volume only', () => {
  const block = volumeSnapshotBlock([{ volumeNo: 1, snapshot: '卷一：铜铃埋下' }, { volumeNo: 2, snapshot: '卷二：照片到手' }], 25)
  assert.ok(block.includes('第2卷'))
  assert.ok(!block.includes('第1卷'))
  assert.equal(volumeSnapshotBlock([], 3), '')
})

test('summary block keeps the last six episodes', () => {
  const chapters = Array.from({ length: 8 }, (_, i) => ({ chapterNo: i + 1, chapterTitle: `第${i + 1}集`, summary: `摘要${i + 1}` }))
  const block = chapterSummaryBlock(chapters, 9)
  assert.ok(block.includes('第3集'))
  assert.ok(!block.includes('第2集'))
})

test('rule check reports numbering gaps, missing card fields, short prose and an empty ledger', () => {
  const issues = checkGenerationRules({ outline: '第1集：甲\n本集事件：x\n第3集：乙\n本集事件：y', chapters: [{ content: '' }, { content: '字'.repeat(200) }], ledger: {} })
  assert.ok(issues.some(item => item.includes('集号不连续')))
  assert.ok(issues.some(item => item.includes('缺少「结尾钩子」')))
  assert.ok(issues.some(item => item.includes('正文为空')))
  assert.ok(issues.some(item => item.includes('人物卡为空')))
  assert.equal(checkGenerationRules({ outline: OUTLINE, chapters: [{ content: '字'.repeat(700) }], ledger: { characters: '顾守山' } }).length, 0)
})
