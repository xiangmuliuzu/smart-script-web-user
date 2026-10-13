import { portal } from './portal.js'

const BASE_API = import.meta.env?.VITE_APP_BASE_API || '/dev-api'
export const getToken = () => localStorage.getItem(portal.tokenKey) || ''
export const clearSession = () => localStorage.removeItem(portal.tokenKey)
export function isAuthFailure(error) {
  return error?.status === 401 || [401, 40100, 40301].includes(error?.code)
}
export function safeRedirect(raw) {
  if (typeof raw !== 'string' || raw.includes('\\')) return '/session'
  try {
    const url = new URL(raw, 'https://portal.invalid')
    if (!raw.startsWith('/') || raw.startsWith('//') || url.origin !== 'https://portal.invalid') return '/session'
    return ['/session', '/session-check'].includes(url.pathname) ? url.pathname + url.search + url.hash : '/session'
  } catch { return '/session' }
}
export function assertUser(user) {
  if (!user?.userId || !['01', '02', '03'].includes(user.userType)) {
    const error = new Error('请使用普通用户账号登录，管理员请前往运维管理端')
    error.code = 40100
    throw error
  }
  return user
}
export async function request(path, { method = 'GET', body, authenticated = true } = {}) {
  const token = authenticated ? getToken() : ''
  const headers = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = 'Bearer ' + token
  const response = await fetch(BASE_API + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000) })
  const result = await response.json().catch(() => null)
  if (!response.ok || ![200, 0].includes(result?.code)) {
    const error = new Error(result?.msg || result?.message || '请求失败，请稍后重试')
    error.status = response.status
    error.code = result?.code
    if (authenticated && getToken() === token && isAuthFailure(error)) clearSession()
    throw error
  }
  // 若依认证返回 token/user/roles/permissions 顶层字段，不能只解包 data。
  return result
}
export async function getCaptcha() {
  const result = await request('/api/v1/auth/captchaImage', { authenticated: false })
  if (result.captchaEnabled !== false && !(result.img && result.uuid)) throw new Error('验证码加载失败，请重试')
  return result
}
export async function login(body) {
  clearSession()
  const result = await request('/api/v1/auth/login', { method: 'POST', body, authenticated: false })
  assertUser(result.user)
  if (typeof result.token !== 'string' || !result.token) throw new Error('登录响应缺少令牌，请重试')
  localStorage.setItem(portal.tokenKey, result.token)
  return result.user
}
export async function getInfo() {
  const result = await request('/api/v1/auth/getInfo')
  try { assertUser(result.user) } catch (error) { clearSession(); throw error }
  return result
}
export async function logout() {
  try {
    if (getToken()) await request('/api/v1/auth/logout', { method: 'POST' })
  } finally { clearSession() }
}
