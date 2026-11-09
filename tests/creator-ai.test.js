import test from 'node:test'
import assert from 'node:assert/strict'
import { outlineChapters } from '../src/utils/creator.js'
import { outlineSummary, outlineInspiration, chapterWritePrompt, chapterContinuePrompt } from '../src/utils/creatorAi.js'

const OUTLINE = [
  '书名：深夜频率',
  '一句话简介：一位深夜电台主播在听众留言里听到了十年前的自己。',
  '角色：林深，电台主播。',
  '第一集：深夜频率',
  '雨夜的咖啡馆，一次迟来的重逢。',
  '第二集：迟到的信',
  '一封没有寄出的信揭开旧事。'
].join('\n')

test('outline summary prefers the labelled logline and falls back to chapter prose', () => {
  assert.equal(outlineSummary(OUTLINE), '一位深夜电台主播在听众留言里听到了十年前的自己。')
  const fallback = outlineSummary('第一集：相遇\n两人在车站相遇，各自带着秘密。')
  assert.equal(fallback, '两人在车站相遇，各自带着秘密。')
  assert.equal(outlineSummary('', 10), '')
  assert.equal(outlineSummary('简介：' + '长'.repeat(30), 12).length, 12)
  assert.equal(outlineSummary('简介：' + '长'.repeat(30), 12), '长'.repeat(12))
})

test('outline inspiration carries the book title, idea and episode count request', () => {
  const text = outlineInspiration({ title: '深夜频率', idea: '电台主播听见十年前的自己', episodes: 8 })
  assert.match(text, /^书名：深夜频率\n故事灵感：电台主播听见十年前的自己\n请提供 8 个分集/)
  assert.match(text, /每集单独一行标题，格式为“第1集：章节名称”/)
})

test('chapter prompts keep the outline, chapter summary and continuation contract', () => {
  const chapters = outlineChapters(OUTLINE)
  assert.deepEqual(chapters.map(chapter => chapter.title), ['第一集：深夜频率', '第二集：迟到的信'])
  const prompt = chapterWritePrompt({ title: chapters[0].title, summary: chapters[0].summary, outline: OUTLINE })
  assert.match(prompt, /为“第一集：深夜频率”创作正文，只写这一章/)
  assert.ok(prompt.includes('本章剧情概要：\n雨夜的咖啡馆，一次迟来的重逢。'))
  const continuation = chapterContinuePrompt({ title: chapters[1].title, summary: chapters[1].summary, outline: OUTLINE, basedOnText: '已有正文' })
  assert.match(continuation, /接着写完“第二集：迟到的信”/)
  assert.match(continuation, /已有正文末尾：\n已有正文$/)
})

test('streaming outline scan reports episodes as they appear, even before summaries finish', async () => {
  const { listOutlineChapters } = await import('../src/utils/creatorAi.js')
  assert.deepEqual(listOutlineChapters('书名：深夜频率\n一句话简介：一位主播。').map(c => c.title), [])
  assert.deepEqual(listOutlineChapters('书名：深夜频率\n第一集：深夜频率\n雨夜的咖啡馆，一次迟来').map(c => c.title), ['第一集：深夜频率'])
  const partial = listOutlineChapters('书名：深夜频率\n第一集：深夜频率\n雨夜\n第二集：迟到')
  assert.deepEqual(partial.map(c => c.title), ['第一集：深夜频率', '第二集：迟到'])
  assert.equal(partial[0].summary, '雨夜')
  assert.equal(partial[1].summary, '')
})

test('outline range locates whole lines and the revise prompt keeps format rules', async () => {
  const { locateOutlineRange, outlineRevisePrompt, previewPassage } = await import('../src/utils/creatorAi.js')
  const text = '书名：深夜频率\n第一集：深夜频率\n雨夜的咖啡馆。\n第二集：迟到的信\n旧事揭开。'
  const range = locateOutlineRange(text, text.indexOf('雨夜的咖啡馆') + 2, text.indexOf('雨夜的咖啡馆') + 4)
  assert.equal(range.passage, '雨夜的咖啡馆。')
  const across = locateOutlineRange(text, text.indexOf('第一集') + 1, text.indexOf('雨夜的咖啡馆') + 1)
  assert.ok(across.passage.startsWith('第一集：深夜频率') && across.passage.endsWith('雨夜的咖啡馆。'))
  assert.equal(locateOutlineRange(text, 3, 3), null)
  assert.equal(locateOutlineRange('   ', 0, 2), null)
  const prompt = outlineRevisePrompt({ passage: '雨夜的咖啡馆。', instruction: '改成白天', context: '大纲上下文' })
  assert.match(prompt, /只重写这一段/)
  assert.match(prompt, /不要输出整份大纲/)
  assert.ok(prompt.includes('【作者意见】\n改成白天'))
  assert.equal(previewPassage('字'.repeat(700), 600).length, 601)
})

test('revision output drops an echoed episode heading', async () => {
  const { stripEchoedHeading } = await import('../src/utils/creatorAi.js')
  const text = '第一集：深夜频率\n雨夜的咖啡馆。'
  const start = text.indexOf('雨夜的咖啡馆')
  assert.equal(stripEchoedHeading(text, start, '第一集：深夜频率\n白天的咖啡馆。'), '白天的咖啡馆。')
  assert.equal(stripEchoedHeading(text, start, '白天的咖啡馆。'), '白天的咖啡馆。')
})

test('AI records rebuild the setup and chapters of a previous AI creation session', async () => {
  const { parseAiCreateOutlineInput, chapterTitleFromPrompt, buildAiCreateSession } = await import('../src/utils/creatorAi.js')
  const NL = String.fromCharCode(10)
  const outlineInput = ['灵感：书名：深夜频率', '故事灵感：深夜电台主播听见十年前的自己', '请提供 8 个分集，每集单独一行标题', '类型：都市悬疑', '风格：共 8 集'].join(NL)
  assert.deepEqual(parseAiCreateOutlineInput(outlineInput), { title: '深夜频率', idea: '深夜电台主播听见十年前的自己', genre: '都市悬疑', episodes: 8 })
  assert.equal(parseAiCreateOutlineInput('随便写的'), null)
  assert.equal(chapterTitleFromPrompt('请根据以下完整大纲，为“第一集 · 深夜频率”创作正文，只写这一章。' + NL + '完整大纲：…'), '第一集 · 深夜频率')
  const outlineRecord = { recordId: 3, type: 'outline', input: outlineInput, output: '第一集：深夜频率' + NL + '雨夜。', createdAt: '2026-11-09 10:00' }
  // 记录按时间倒序：更晚的章节排在前面；recordId 更大。
  const records = [
    { recordId: 5, type: 'write', input: '请根据以下完整大纲，为“第二集 · 迟到的信”创作正文，只写这一章。', output: '第二集正文' },
    { recordId: 4, type: 'write', input: '请根据以下完整大纲，为“第一集 · 深夜频率”创作正文，只写这一章。', output: '第一集正文' },
    outlineRecord,
    { recordId: 2, type: 'write', input: '请为“旧会话之外的一章”创作正文', output: '不该被带进来' }
  ]
  const session = buildAiCreateSession(records, outlineRecord)
  assert.equal(session.setup.title, '深夜频率')
  assert.equal(session.outline, '第一集：深夜频率' + NL + '雨夜。')
  assert.deepEqual(session.chapters.map(chapter => [chapter.title, chapter.content]), [['第一集 · 深夜频率', '第一集正文'], ['第二集 · 迟到的信', '第二集正文']])
  assert.equal(session.chapters[0].chapterId, 3)
  assert.equal(session.chapters[1].chapterId, null)
  assert.equal(buildAiCreateSession(records).chapters.length, 2)
  assert.equal(buildAiCreateSession([{ recordId: 1, type: 'write', input: 'x', output: 'y' }]), null)
})
