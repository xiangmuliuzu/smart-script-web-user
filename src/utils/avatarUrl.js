/** 平台头像按当前 API 地址加载，兼容历史开发机地址与本地预览图片。 */
export function avatarUrl(raw, apiBase = import.meta.env?.VITE_APP_BASE_API || '/dev-api') {
  const value = typeof raw === 'string' ? raw.trim() : ''
  if (!value) return ''
  if (/^data:image\/(?:png|jpeg|gif|webp|bmp);base64,/i.test(value)) return value
  let resource = value
  if (/^https?:\/\//i.test(value)) {
    try { resource = new URL(value).pathname } catch { return '' }
  } else if (!value.startsWith('/') || value.startsWith('//')) {
    return ''
  }
  const start = resource.search(/\/profile\/(?:upload|avatar|contract)\//)
  if (start < 0) return value
  resource = resource.slice(start)
  if (resource.includes('\\') || resource.split('/').some(part => part === '.' || part === '..')) return ''
  const root = apiBase.replace(/\/+$/, '').replace(/\/api\/v1$/, '')
  return root + encodeMediaPath(resource)
}

/**
 * 内容域静态资源归一（印章图 / 审核材料等），对齐：
 * - Admin：`resolveMediaUrl`（补 API 前缀走代理）
 * - App：`AppConfig.resolveAssetUrl`（按 `/profile/` 锚点截取后再拼可访问地址）
 *
 * 路径段会 encode，避免中文文件名在浏览器直链时变成 401。
 */
export function mediaUrl(raw, apiBase = import.meta.env?.VITE_APP_BASE_API || '/dev-api') {
  if (raw == null || raw === '') return ''
  let url = String(raw).trim()
  if (!url) return ''
  if (/^data:|^blob:/i.test(url)) return url

  const mediaIndex = url.indexOf('/profile/')
  if (mediaIndex >= 0) url = url.slice(mediaIndex)

  const root = String(apiBase || '').replace(/\/+$/, '').replace(/\/api\/v1$/, '')
  if (url.startsWith('/dev-api/') || url.startsWith('/prod-api/')) {
    const idx = url.indexOf('/profile/')
    if (idx >= 0) return url.slice(0, idx) + encodeMediaPath(url.slice(idx))
    return url
  }
  if (root && (url === root || url.startsWith(root + '/'))) return url

  if (url.startsWith('/') && !url.startsWith('//')) {
    return (root || '') + encodeMediaPath(url)
  }
  return url
}

/** 对路径每一段 decode 后再 encode，避免中文未编码或二次编码。 */
export function encodeMediaPath(path) {
  return String(path || '').split('/').map(seg => {
    if (!seg) return ''
    try { return encodeURIComponent(decodeURIComponent(seg)) }
    catch { return encodeURIComponent(seg) }
  }).join('/')
}

/**
 * 文本材料解码：兼容 UTF-8 / UTF-16（Windows 记事本）/ GBK。
 * 乱码多因记事本默认 UTF-16 LE，按 UTF-8 读会出现 �。
 */
export function decodeTextBuffer(buffer) {
  const bytes = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : new Uint8Array(buffer || [])
  if (!bytes.length) return ''
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes)
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes)
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(bytes)
  }
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
  if (!utf8.includes('\uFFFD')) return utf8
  for (const encoding of ['gbk', 'gb18030']) {
    try {
      const text = new TextDecoder(encoding, { fatal: false }).decode(bytes)
      if (text && !text.includes('\uFFFD')) return text
    } catch { /* 浏览器不支持该编码时跳过 */ }
  }
  return utf8
}

/**
 * 合同正文（HTML）内的静态资源改写：签名/印章图与签约 PDF 存的是 /profile 相对路径，
 * iframe srcdoc 以父页面为基址，不补 API 前缀必定 404；逐个 URL 属性走 avatarUrl 归一。
 */
export function contractHtml(html) {
  const value = typeof html === 'string' ? html : ''
  if (!value) return ''
  return value.replace(/(src|href|xlink:href)(\s*=\s*)(["'])([^"']+)\3/gi, (whole, attr, eq, quote, raw) => {
    if (!raw.includes('/profile/')) return whole
    const fixed = avatarUrl(raw)
    return fixed ? `${attr}${eq}${quote}${fixed}${quote}` : whole
  })
}
