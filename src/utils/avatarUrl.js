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
  const start = resource.search(/\/profile\/(?:upload|avatar)\//)
  if (start < 0) return value
  resource = resource.slice(start)
  if (resource.includes('\\') || resource.split('/').some(part => part === '.' || part === '..')) return ''
  const root = apiBase.replace(/\/+$/, '').replace(/\/api\/v1$/, '')
  return root + resource
}
