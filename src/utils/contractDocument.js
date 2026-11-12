// 合同正文条款富文本：只识别本编辑器产出的版本标记，历史纯文本保持原样按行处理。
export const contractDocumentPrefix = '<div data-contract-document="1">'
export const isContractDocument = value => typeof value === 'string' && value.startsWith(contractDocumentPrefix) && value.endsWith('</div>')

/** 取富文本条款的纯文本形态，用于字数展示与非空校验；纯文本条款原样返回。 */
export function contractDocumentText(value) {
  const content = String(value || '')
  if (!isContractDocument(content)) return content
  const body = content.slice(contractDocumentPrefix.length, -'</div>'.length)
  const text = body.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '').replace(/<br\s*\/?>|<\/(?:p|div|h[1-6]|li|blockquote)>/gi, '\n').replace(/<[^>]*>/g, '')
  if (typeof DOMParser !== 'undefined') return new DOMParser().parseFromString(text, 'text/html').documentElement.textContent.trimEnd()
  return text.replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (_, entity) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' })[entity]).trimEnd()
}
