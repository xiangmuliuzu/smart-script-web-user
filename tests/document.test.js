import test from 'node:test'
import assert from 'node:assert/strict'
import { documentPrefix, documentText } from '../src/utils/document.js'
import { wordCount, validateChapter } from '../src/utils/creator.js'

test('formatted script counts only text, while legacy text containing brackets stays intact', () => {
  const html = documentPrefix + '<p><strong>林深</strong>：&lt;重逢&gt;</p><p>雨夜</p></div>'
  assert.equal(documentText(html), '林深：<重逢>\n雨夜')
  assert.equal(wordCount(html), 9)
  assert.equal(documentText('人物：<林深>\nA & B'), '人物：<林深>\nA & B')
  assert.equal(validateChapter({ chapterTitle: '第一集', content: documentPrefix + '<p><br></p></div>' }), '请输入正文或上传草稿')
})
