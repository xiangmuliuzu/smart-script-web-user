import { validateFile } from './creator.js'

// 使用浏览器原生解压读取 DOCX 的正文，不运行文档脚本、不导入外链。
export async function readDraft(file) {
  const error = validateFile(file, ['txt', 'md', 'docx'])
  if (error) throw new Error(error)
  if (!/\.docx$/i.test(file.name)) return file.text()
  try { return await readDocx(file) }
  catch (failure) {
    if (failure instanceof RangeError || failure instanceof TypeError || failure instanceof DOMException) throw new Error('无法读取 DOCX 正文，请另存为标准 Word 文档后重试')
    throw failure
  }
}
async function readDocx(file) {
  const buffer = await file.arrayBuffer()
  const view = new DataView(buffer)
  let end = buffer.byteLength - 22
  while (end >= Math.max(0, buffer.byteLength - 65557) && view.getUint32(end, true) !== 0x06054b50) end--
  if (end < Math.max(0, buffer.byteLength - 65557)) throw new Error('DOCX 文件损坏，请重新导出后上传')
  let offset = view.getUint32(end + 16, true)
  const count = view.getUint16(end + 10, true)
  for (let i = 0; i < count; i++) {
    if (offset + 46 > buffer.byteLength || view.getUint32(offset, true) !== 0x02014b50) break
    const nameLength = view.getUint16(offset + 28, true)
    const extraLength = view.getUint16(offset + 30, true)
    const commentLength = view.getUint16(offset + 32, true)
    const name = new TextDecoder().decode(new Uint8Array(buffer, offset + 46, nameLength))
    if (name === 'word/document.xml') {
      if (view.getUint16(offset + 8, true) & 1) throw new Error('请上传未加密的 DOCX 文件')
      const method = view.getUint16(offset + 10, true)
      const size = view.getUint32(offset + 20, true)
      if (view.getUint32(offset + 24, true) > 20 * 1024 * 1024) throw new Error('文档正文过大，请分章上传')
      const local = view.getUint32(offset + 42, true)
      if (local + 30 > buffer.byteLength || view.getUint32(local, true) !== 0x04034b50) throw new Error('DOCX 正文损坏')
      const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true)
      if (start + size > buffer.byteLength) throw new Error('DOCX 正文不完整')
      let stream = new Blob([buffer.slice(start, start + size)]).stream()
      if (method === 8) stream = stream.pipeThrough(new DecompressionStream('deflate-raw'))
      else if (method !== 0) throw new Error('暂不支持此文档压缩方式，请另存为标准 DOCX')
      const reader = stream.getReader()
      const chunks = []
      let total = 0
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        total += value.byteLength
        if (total > 20 * 1024 * 1024) { await reader.cancel(); throw new Error('文档正文过大，请分章上传') }
        chunks.push(value)
      }
      const xml = await new Blob(chunks).text()
      const doc = new DOMParser().parseFromString(xml, 'application/xml')
      if (doc.querySelector('parsererror')) throw new Error('DOCX 正文格式错误')
      const ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
      return [...doc.getElementsByTagNameNS(ns, 'p')].map(p => [...p.getElementsByTagNameNS(ns, 't')].map(t => t.textContent).join('')).join('\n\n')
    }
    offset += 46 + nameLength + extraLength + commentLength
  }
  throw new Error('未找到 DOCX 正文，请选择标准 Word 文档')
}
