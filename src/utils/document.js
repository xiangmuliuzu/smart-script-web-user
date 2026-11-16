// 仅识别本编辑器输出的文档；历史纯文本中包含尖括号时保持原样。
export const documentPrefix = '<div data-script-document="1">'
export const isFormattedDocument = value => typeof value === 'string' && value.startsWith(documentPrefix) && value.endsWith('</div>')
export function documentText(value) {
  const content = String(value || '')
  if (!isFormattedDocument(content)) return content
  const text = content.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '').replace(/<br\s*\/?>|<\/(?:p|div|h[1-6]|li|blockquote)>/gi, '\n').replace(/<[^>]*>/g, '')
  if (typeof DOMParser !== 'undefined') return new DOMParser().parseFromString(text, 'text/html').documentElement.textContent.trimEnd()
  return text.replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (_, entity) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' })[entity]).trimEnd()
}
