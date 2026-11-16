import test from 'node:test'
import assert from 'node:assert/strict'
import { ledgerPromptBlock, ledgerPromptBlockByCast, episodeCardFrom, episodeCastFrom, volumeSnapshotBlock, chapterSummaryBlock, chapterTail, continuationPrompt, checkGenerationRules, auditEpisodeState, parseProps, cnToNumber } from '../src/utils/creatorAi.js'

const OUTLINE = '第1集：雨夜铜铃\n本集事件：顾星宇在祠堂发现铜铃\n冲突与推进：顾守山否认\n结果或反转：铜铃自己响了\n结尾钩子：门外有人\n第2集：旧照片\n本集事件：翻出老照片\n冲突与推进：父子争执\n结果或反转：照片背面有字\n结尾钩子：字迹是母亲的'

test('ledger block injects the nine shared facts and skips empty ones', () => {
  const block = ledgerPromptBlock({ characters: '顾守山 45岁', relations: '父子', foreshadow: '铜铃第3集埋', timeline: '', items: '房梁', threads: '照片背面' })
  assert.match(block, /【创作台账（已定事实，不得冲突）】/)
  assert.match(block, /主要人物：\n顾守山 45岁/)
  assert.match(block, /人物关系：\n父子/)
  assert.match(block, /物品位置（逐集去向）：\n房梁/)
  assert.doesNotMatch(block, /时间线/)
  assert.equal(ledgerPromptBlock({}), '')
})

test('props and style guide come first and survive long ledgers', () => {
  const props = '傩面具｜十二面｜顾守山｜在手｜明代木雕\n铜钥匙｜1把｜雷老幺｜已交付给吴德贵｜黄铜'
  const block = ledgerPromptBlock({ characters: '旧'.repeat(3000), props, styleGuide: '第三人称限知；短句' })
  assert.ok(block.indexOf('重要道具档案') < block.indexOf('创作台账'), '道具档案必须前置，不能被流水挤出')
  assert.ok(block.includes('傩面具｜十二面｜顾守山'), '件数行要完整保留')
  assert.ok(block.includes('铜钥匙｜1把｜雷老幺｜已交付给吴德贵'), '已交付状态要注入')
  assert.ok(block.includes('第三人称限知；短句'))
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

test('prop ledger parses rows and converts Chinese counts', () => {
  const rows = parseProps('傩面具｜十二面｜顾守山｜在手｜明代木雕\n铜钥匙|1把|雷老幺|已交付给吴德贵|黄铜')
  assert.equal(rows.length, 2)
  assert.equal(rows[0].name, '傩面具')
  assert.equal(rows[0].count, '十二面')
  assert.equal(rows[1].status, '已交付给吴德贵')
  assert.equal(cnToNumber('十二'), 12)
  assert.equal(cnToNumber('二十'), 20)
  assert.equal(cnToNumber('十三'), 13)
  assert.equal(cnToNumber('1'), 1)
})

test('audit reports prop count drift, repeated delivery and bracket style', () => {
  const props = '傩面具｜十二面｜顾守山｜在手｜明代木雕\n铜钥匙｜1把｜雷老幺｜已交付给吴德贵｜黄铜'
  const text = [
    '顾守山把傩面具摆上供桌，十三面一字排开。',
    '雷老幺把铜钥匙交给吴德贵，说这是最后一次。',
    '（顾守山心里一沉）',
    '（吴德贵捏紧钥匙）',
    '（门外传来脚步声）',
    '（雷老幺想说什么又咽回去）',
  ].join('\n')
  const issues = auditEpisodeState({ text, cast: [], roster: ['顾守山', '雷老幺', '吴德贵'], props })
  assert.ok(issues.some(item => item.includes('件数与档案不符') && item.includes('13面')), '件数不一致要报')
  assert.ok(issues.some(item => item.includes('重复交付')), '已交付的钥匙又被交一次要报')
  assert.ok(issues.some(item => item.includes('括注体')), '写法漂移要报')
})
