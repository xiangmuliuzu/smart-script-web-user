import test from 'node:test'
import assert from 'node:assert/strict'
import {
  appendStoryboard,
  appendToDocument,
  blueprintParse,
  blueprintPrompt,
  blueprintToLedger,
  blueprintWorkMeta,
  chapterDraftParse,
  chapterDraftPrompt,
  chapterStats,
  chapterStatusDots,
  emptyBlueprint,
  firstSentence,
  labelledValue,
  ledgerToBlueprint,
  localReorganize,
  mergeBlueprintSection,
  minutesText,
  nameKey,
  normalizeBlueprint,
  parseCharacterBlocks,
  parseJsonLoose,
  parseOutlineText,
  parsePropsText,
  parseRelationLines,
  presentSections,
  regeneratePrompt,
  studioStoryboardScript,
  studioWritePrompt
} from '../src/utils/blueprint.js'

const SETUP = { title: '深夜频率', idea: '一位深夜电台主播在听众留言里听到了十年前的自己。', genre: '都市悬疑', episodes: 12, minutes: 2 }

const BLUEPRINT = () => normalizeBlueprint({
  storyCore: {
    logline: '一个被未来留言牵着走的深夜主播。',
    summary: '沈岚收到来自未来的留言，试图改变事故。',
    coreConflict: '想改变未来，却必须面对未来由自己造成。',
    narrativeStyle: '都市悬疑，少旁白。',
    contentBoundary: '弱化血腥描述。',
    endingTone: '克制的开放结局。'
  },
  world: {
    setting: '旧电台信号只在凌晨 00:13 出现。',
    rules: [{ name: '信号时间', detail: '每天凌晨出现 13 秒。' }],
    constraints: ['不写场景头', '人物不能直接知道规则']
  },
  outline: {
    mainline: '12 集围绕未来留言推进。',
    acts: [{ name: '第一幕', range: '1–4 集', summary: '建立规则。' }],
    endingHanger: '最后一条留言来自未来的沈岚。'
  },
  characters: [
    { name: '沈岚', age: '32', gender: '女', role: '深夜电台主播', goal: '阻止事故', trait: '克制', secret: '父亲与旧事故有关', growth: '从控制到承担' },
    { name: '周启', role: '录音设备维修师', goal: '修复收音机', trait: '沉默', secret: '隐瞒录音', growth: '从旁观到承担' }
  ],
  items: [
    { name: '旧磁带', icon: 'tape', count: '1盒', owner: '沈岚', state: '在手', desc: '父亲留下的录音带', track: [{ chapterNo: 1, event: '发现' }] }
  ],
  relations: [
    { a: nameKey('c', '沈岚'), b: nameKey('c', '周启'), label: '旧识 · 互相隐瞒', dash: true }
  ],
  planEpisodes: 12,
  minutesPerEpisode: 2
})

test('blueprint ↔ ledger round-trips names, counts and episode plan', () => {
  const blueprint = BLUEPRINT()
  const ledger = blueprintToLedger(blueprint)
  assert.match(ledger.characters, /^沈岚（32\/女）：深夜电台主播｜.*｜从控制到承担/m)
  assert.match(ledger.characters, /周启：/)
  assert.equal(ledger.relations, '沈岚 ↔ 周启：旧识 · 互相隐瞒')
  assert.equal(ledger.props, '旧磁带｜1盒｜沈岚｜在手｜父亲留下的录音带')
  assert.match(ledger.storySummary, /收到来自未来的留言/)
  assert.match(ledger.styleGuide, /都市悬疑/)
  assert.match(ledger.outline, /故事主线：12 集围绕未来留言推进。/)
  assert.match(ledger.outline, /第一幕（1–4 集）：建立规则。/)
  assert.match(ledger.outline, /结尾悬念：最后一条留言来自未来的沈岚。/)
  assert.match(ledger.stateBoard, /计划集数=12 集；单集时长=2 分钟。/)
  assert.match(ledger.stateBoard, /核心冲突：/)

  const back = ledgerToBlueprint(ledger)
  assert.deepEqual(back.characters.map(character => character.name), ['沈岚', '周启'])
  assert.equal(back.characters[0].role, '深夜电台主播')
  assert.equal(back.characters[0].goal, '阻止事故')
  assert.equal(back.characters[0].growth, '从控制到承担')
  assert.equal(back.characters[1].secret, '隐瞒录音')
  assert.deepEqual(back.items.map(item => [item.name, item.count, item.state]), [['旧磁带', '1盒', '在手']])
  assert.equal(back.relations.length, 1)
  assert.equal(back.relations[0].dash, true)
  assert.equal(back.planEpisodes, 12)
  assert.equal(back.minutesPerEpisode, 2)
  assert.equal(back.storyCore.coreConflict, '想改变未来，却必须面对未来由自己造成。')
  assert.equal(back.outline.mainline, '12 集围绕未来留言推进。')
  assert.deepEqual(back.outline.acts.map(act => act.name), ['第一幕'])
})

test('ledgerToBlueprint degrades old free-text ledgers without throwing', () => {
  const blueprint = ledgerToBlueprint({
    storySummary: '旧作品简介。',
    characters: '顾守山（45/男）：班主｜严肃｜护短｜守住傩戏｜从守旧到放手\n顾星宇（16/男）：学徒｜倔强｜想离开｜学会承担',
    relations: '顾守山 ↔ 顾星宇：父子\n林素 ↔ 顾守山：旧识',
    props: '傩面具｜十二面｜顾守山｜在手｜明代木雕\n铜钥匙｜1把｜雷老幺｜已交付给吴德贵｜黄铜',
    styleGuide: '第三人称限知\n不用全角括号补叙',
    outline: '第1集：雨夜铜铃\n本集事件：祠堂发现铜铃\n第2集：旧照片\n翻出老照片'
  })
  assert.equal(blueprint.characters.length, 2)
  assert.equal(blueprint.items.length, 2)
  // 林素不在人物卡里，不能凭空生成关系边。
  assert.equal(blueprint.relations.length, 1)
  assert.equal(blueprint.storyCore.narrativeStyle, '第三人称限知')
  assert.equal(blueprint.storyCore.contentBoundary, '不用全角括号补叙')
  assert.match(blueprint.outline.mainline, /雨夜铜铃|旧作品简介/)
  assert.equal(blueprint.storyCore.summary, '旧作品简介。')
  // 空台账也必须有完整结构。
  const empty = ledgerToBlueprint(null)
  assert.deepEqual(empty.characters, [])
  assert.deepEqual(empty.items, [])
  assert.equal(empty.planEpisodes, 12)
})

test('blueprintParse reads the five-section setting text and keeps relations to known people', () => {
  const text = [
    '『故事简介』',
    '深夜电台主播沈岚收到未来的留言，试图改变即将发生的事故。',
    '『主要人物』',
    '沈岚（32/女）：深夜电台主播｜克制敏锐｜说话简短｜阻止事故｜从控制到承担',
    '周启（40/男）：录音设备维修师｜沉默细致｜对设备执念｜修复旧收音机｜从旁观到承担',
    '『人物关系』',
    '沈岚 ↔ 周启：旧识 · 互相隐瞒',
    '陌生人 ↔ 沈岚：不应出现',
    '『重要道具档案』',
    '旧磁带｜1盒｜沈岚｜在手｜父亲留下的录音带',
    '『写法基线』',
    '第三人称限知；短句为主',
    '不写场景头，不用全角括号补叙',
    '世界观：旧电台信号只在凌晨 00:13 出现。',
    '故事主线：12 集围绕未来留言推进。',
    '结尾悬念：最后一条留言来自未来的沈岚。'
  ].join('\n')
  const blueprint = blueprintParse(text, SETUP)
  assert.deepEqual(blueprint.characters.map(character => character.name), ['沈岚', '周启'])
  // 段标题不能污染上一个人物的成长线。
  assert.equal(blueprint.characters[1].growth, '从旁观到承担')
  assert.equal(blueprint.items.length, 1)
  assert.equal(blueprint.items[0].icon, 'tape')
  assert.equal(blueprint.relations.length, 1, '未知人物不能生成关系边')
  assert.equal(blueprint.storyCore.logline, firstSentence('深夜电台主播沈岚收到未来的留言，试图改变即将发生的事故。'))
  assert.equal(blueprint.world.setting, '旧电台信号只在凌晨 00:13 出现。')
  assert.equal(blueprint.outline.endingHanger, '最后一条留言来自未来的沈岚。')
  assert.equal(blueprint.planEpisodes, 12)
})

test('blueprintParse accepts JSON blueprints, fenced or not', () => {
  const json = '```json\n' + JSON.stringify({
    storyCore: { logline: '一句话', summary: '简介', coreConflict: '冲突' },
    world: { setting: '设定', rules: [{ name: '规则', detail: '细节' }] },
    outline: { mainline: '主线', acts: [{ name: '第一幕', range: '1-3', summary: '开端' }] },
    characters: [{ name: '林澈', role: '主角' }],
    items: [{ name: '铜铃', count: '1个' }],
    relations: [],
    planEpisodes: 8,
    minutesPerEpisode: 1.5
  }) + '\n```'
  const blueprint = blueprintParse(json, SETUP)
  assert.equal(blueprint.storyCore.logline, '一句话')
  assert.equal(blueprint.world.rules.length, 1)
  assert.equal(blueprint.characters[0].name, '林澈')
  assert.equal(blueprint.planEpisodes, 8)
  assert.equal(blueprint.minutesPerEpisode, 1.5)
  assert.equal(parseJsonLoose('不是 JSON'), null)
})

test('blueprintParse never throws and falls back to the setup idea', () => {
  for (const value of ['', null, undefined, '随便一段没有结构的文字。', '{}']) {
    const blueprint = blueprintParse(value, SETUP)
    assert.equal(blueprint.storyCore.summary.length > 0, true)
    assert.equal(blueprint.planEpisodes, 12)
  }
  const fallback = blueprintParse('', SETUP)
  assert.equal(fallback.storyCore.summary, SETUP.idea)
  assert.equal(fallback.items.length, 0)
})

test('normalizeBlueprint clamps numbers and drops malformed entries', () => {
  const blueprint = normalizeBlueprint({
    planEpisodes: 999,
    minutesPerEpisode: 7,
    characters: [{ name: '' }, { name: '沈岚' }, { name: '沈岚' }],
    items: [{ name: '磁带', track: [{ event: '' }, { chapterNo: 2, event: '被转录' }] }],
    relations: [
      { a: 'a', b: 'a', label: '自环' },
      { a: 'a', b: 'missing', label: '悬空' }
    ]
  })
  assert.equal(blueprint.planEpisodes, 60)
  assert.equal(blueprint.minutesPerEpisode, 2)
  assert.equal(blueprint.characters.length, 3, '空名补「人物N」，同名不合并但 key 去重')
  assert.equal(new Set(blueprint.characters.map(item => item.key)).size, 3)
  assert.deepEqual(blueprint.items[0].track, [{ chapterNo: 2, event: '被转录' }])
  assert.deepEqual(blueprint.relations, [])
  assert.deepEqual(emptyBlueprint().characters, [])
})

test('mergeBlueprintSection keeps the old card when the AI returns nothing useful', () => {
  const blueprint = BLUEPRINT()
  const unchanged = mergeBlueprintSection(blueprint, 'characters', '')
  assert.deepEqual(unchanged.characters.map(item => item.name), ['沈岚', '周启'])
  const storyOnly = mergeBlueprintSection(blueprint, 'storyCore', '『故事简介』\n新的故事简介。\n『核心冲突』\n新的冲突。')
  assert.equal(storyOnly.storyCore.summary, '新的故事简介。')
  assert.equal(storyOnly.storyCore.coreConflict, '新的冲突。')
  assert.deepEqual(storyOnly.characters.map(item => item.name), ['沈岚', '周启'])
  const all = mergeBlueprintSection(blueprint, 'all', '『主要人物』\n林澈（20/男）：主角｜冷静｜寡言｜查清旧案｜学会相信')
  assert.deepEqual(all.characters.map(item => item.name), ['林澈'])
  assert.equal(all.storyCore.summary, blueprint.storyCore.summary, '全部整理缺段时保留旧值')
})

test('localReorganize is deterministic and still produces a visible change', () => {
  const blueprint = normalizeBlueprint({
    storyCore: { summary: '一段没有梗概的简介。', coreConflict: '核心冲突在此。' },
    characters: [{ name: '沈岚', role: '主播' }, { name: '沈岚', role: '' }],
    items: [{ name: '磁带' }],
    relations: []
  })
  const { blueprint: next, changed } = localReorganize(blueprint, 'all')
  assert.equal(changed, true)
  assert.equal(next.storyCore.logline, '一段没有梗概的简介。')
  // 本地整理只补空字段，绝不在已有简介后面拼接内容。
  assert.equal(next.storyCore.summary, '一段没有梗概的简介。')
  assert.equal(next.characters.length, 1)
  assert.equal(next.characters[0].goal, '待补充')
  assert.equal(next.items[0].count, '待定')
  // 再次整理不应再改变已收敛的内容。
  const again = localReorganize(next, 'all')
  assert.equal(again.changed, false)
})

test('blueprintPrompt asks for five sections and forbids chapter cards', () => {
  const prompt = blueprintPrompt(SETUP)
  assert.match(prompt, /《深夜频率》/)
  assert.match(prompt, /故事灵感】\n一位深夜电台主播/)
  assert.match(prompt, /计划 12 集，单集 2 分钟/)
  assert.match(prompt, /不要写任何章节级大纲或分集事件卡/)
  assert.match(prompt, /『主要人物』/)
  assert.match(prompt, /世界观：/)
  assert.ok(!/\n{3,}/.test(prompt), '提示词不能出现连续空行')
})

test('regeneratePrompt targets one section and embeds the rest as context', () => {
  const prompt = regeneratePrompt(BLUEPRINT(), 'characters', '让反派更早出场')
  assert.match(prompt, /只重新整理「主要人物/)
  assert.match(prompt, /作者意见】\n让反派更早出场/)
  assert.match(prompt, /【关键物品】\n旧磁带｜1盒｜沈岚｜在手/)
  assert.match(prompt, /【人物关系】\n沈岚 ↔ 周启：旧识 · 互相隐瞒/)
  assert.match(prompt, /请只输出重新整理后的「主要人物/)
})

test('studioWritePrompt honours the three reference toggles', () => {
  const blueprint = BLUEPRINT()
  const chapter = { chapterNo: 2, chapterTitle: '旧电台的回声', summary: '周启检修旧收音机。', cast: [] }
  const ledger = blueprintToLedger(blueprint)
  const full = studioWritePrompt({ mode: 'text', refs: { work: true, summary: true, prev: true }, work: { title: '深夜频率' }, blueprint, chapter, ledger, prevChapter: '上一章的结尾。', instruction: '加强冲突' })
  assert.match(full, /请写《深夜频率》旧电台的回声的正文/)
  assert.match(full, /【重要道具档案/)
  assert.match(full, /【本章概要】\n周启检修旧收音机。/)
  assert.match(full, /上一章末尾（承接语气与处境，勿重复）】\n上一章的结尾。/)
  assert.match(full, /【作者要求】\n加强冲突/)

  const minimal = studioWritePrompt({ mode: 'text', refs: { work: false, summary: false, prev: false }, work: { title: '深夜频率' }, blueprint, chapter, ledger, prevChapter: '上一章', instruction: '' })
  assert.ok(!minimal.includes('重要道具档案'))
  assert.ok(!minimal.includes('本章概要'))
  assert.ok(!minimal.includes('上一章末尾'))
  assert.match(minimal, /依据已选资料，写完整的一章。/)

  const storyboard = studioStoryboardScript({ refs: { work: true, summary: true, prev: false }, work: { title: '深夜频率' }, blueprint, chapter, ledger, currentContent: '第一场正文' })
  assert.match(storyboard, /请拆成分镜/)
  assert.match(storyboard, /【本章文本】\n第一场正文/)
  assert.match(storyboard, /【分镜要求】/)
})

test('chapterDraftParse reads labelled text and only keeps known characters/items', () => {
  const blueprint = BLUEPRINT()
  const draft = chapterDraftParse([
    '章节标题：未来留言',
    '章节概要：凌晨 00:13，沈岚收到留言，周启赶来检查旧磁带。',
    '本章出场：沈岚、不存在的人',
    '本章物品：旧磁带',
    '本章关系：沈岚 ↔ 周启：再次合作'
  ].join('\n'), { chapterNo: 1, blueprint })
  assert.equal(draft.title, '未来留言')
  assert.match(draft.summary, /沈岚收到留言/)
  // 显式出场名单优先：概要提到但没列出的人物不会自动上台。
  assert.deepEqual(draft.cast.map(entry => entry.key), [blueprint.characters[0].key])
  assert.deepEqual(draft.items.map(entry => entry.key), [blueprint.items[0].key])
  assert.equal(draft.edges.length, 1)
  assert.equal(draft.aiSummary, draft.summary)

  const bare = chapterDraftParse('一段没有标注的概要，沈岚与周启在旧电台重现信号。', { chapterNo: 3, blueprint })
  assert.equal(bare.title, '第 3 章')
  // 概要提到的人自动进入出名单。
  assert.deepEqual(bare.cast.map(entry => entry.key).sort(), blueprint.characters.map(item => item.key).sort())
  // 名单为空时才用概要里提到的人物。
  assert.deepEqual(chapterDraftParse('沈岚在旧电台听见自己的声音。', { chapterNo: 3, blueprint }).cast.map(entry => entry.key), [blueprint.characters[0].key])
  const empty = chapterDraftParse('', { chapterNo: 4, blueprint })
  assert.equal(empty.title, '第 4 章')
  assert.equal(empty.summary, '')
})

test('chapterDraftPrompt carries the blueprint and previous summaries', () => {
  const prompt = chapterDraftPrompt({
    work: { title: '深夜频率' },
    blueprint: BLUEPRINT(),
    chapters: [
      { chapterNo: 1, chapterTitle: '未来留言', summary: '收到留言。' },
      { chapterNo: 2, chapterTitle: '旧电台', summary: '检修收音机。' }
    ],
    chapterNo: 3
  })
  assert.match(prompt, /生成第 3 章的分集资料/)
  assert.match(prompt, /第1章《未来留言》：收到留言。/)
  assert.match(prompt, /第2章《旧电台》：检修收音机。/)
  assert.match(prompt, /章节标题：/)
  assert.match(prompt, /本章出场：/)
  assert.match(prompt, /不要写正文/)
})

test('append helpers never overwrite existing writing', () => {
  assert.equal(appendToDocument('', '第一段\n\n第二段'), '第一段\n\n第二段')
  assert.equal(appendToDocument('旧文', '新段'), '旧文\n\n新段')
  const formatted = '<div data-script-document="1"><p>旧文</p></div>'
  const appended = appendToDocument(formatted, '新段\n下一行')
  assert.ok(appended.startsWith('<div data-script-document="1"><p>旧文</p><p>新段<br>下一行</p></div>'))
  assert.equal(appendToDocument('旧文', ''), '旧文')

  const shots = appendStoryboard('01 特写｜a\n03 全景｜c', '02 中景｜b\n04 空镜｜d')
  assert.equal(shots.added, 2)
  assert.equal(shots.content, '01 特写｜a\n03 全景｜c\n04 中景｜b\n05 空镜｜d')
  assert.deepEqual(appendStoryboard('', ''), { content: '', added: 0 })
})

test('chapter helpers report status dots and foot statistics', () => {
  const dots = chapterStatusDots(
    { summary: '有概要', content: '<div data-script-document="1">正文超过二十个字的内容在这里</div>' },
    { content: '01 特写｜a', readable: true }
  )
  assert.deepEqual(dots.map(dot => [dot.label, dot.on]), [['概', true], ['文', true], ['镜', true]])
  const empty = chapterStatusDots({ summary: '', content: '' }, null)
  assert.deepEqual(empty.map(dot => dot.on), [false, false, false])
  assert.equal(chapterStatusDots({ content: '短' }, null)[1].on, false, '不足 20 字不算有正文')

  const stats = chapterStats({
    chapter: { plainText: '雨 夜 的 车 站' },
    storyboard: { content: '01 a\n\n02 b' },
    meta: { cast: [1, 2], items: [1], edges: [1, 2, 3] }
  })
  // 与后端 countWords 同口径：只去掉空白，'雨 夜 的 车 站' 共 5 个字符。
  assert.deepEqual(stats, { words: 5, shots: 2, cast: 2, items: 1, relations: 3, summaryWords: 0 })
  assert.equal(minutesText(2), '2 分钟')
  assert.equal(minutesText(1.5), '1.5 分钟')
})

test('small pure helpers behave predictably', () => {
  assert.equal(nameKey('c', '沈岚'), nameKey('c', '沈岚'))
  assert.notEqual(nameKey('c', '沈岚'), nameKey('c', '周启'))
  assert.equal(labelledValue('故事主线：一条主线', ['故事主线']), '一条主线')
  assert.equal(labelledValue('**故事主线**：另一条', ['故事主线']), '另一条')
  assert.equal(labelledValue('无关内容', ['故事主线']), '')
  assert.deepEqual(parsePropsText('旧磁带｜1盒｜沈岚｜在手\n\n'), [{ key: nameKey('i', '旧磁带'), name: '旧磁带', count: '1盒', owner: '沈岚', state: '在手', desc: '', icon: 'tape', track: [] }])
  assert.deepEqual(parseRelationLines('沈岚 ↔ 周启：旧识')[0], { aName: '沈岚', bName: '周启', label: '旧识' })
  assert.equal(typeof parseRelationLines('无效行'), 'object')
  const character = parseCharacterBlocks('沈岚（32/女）：主播｜清瘦｜克制')[0]
  assert.equal(character.role, '主播')
  assert.equal(character.appearance, '清瘦')
  assert.equal(character.trait, '克制')
  assert.deepEqual(parseOutlineText('第一幕（1–3 集）：开端\n第二幕：发展').acts.map(act => act.range), ['1–3 集', ''])
  assert.equal(blueprintWorkMeta(BLUEPRINT(), { title: '深夜频率', genre: '都市悬疑' }).durationSeconds, 120)
  assert.equal(blueprintWorkMeta(emptyBlueprint(), { title: '新作品', episodes: 6, minutes: 1.5 }).durationSeconds, 90)
})
