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
    const implemented = ['/session', '/session-check', '/works', '/works/create'].includes(url.pathname) || /^\/works\/[1-9]\d*$/.test(url.pathname)
    return implemented ? url.pathname + url.search + url.hash : '/session'
  } catch { return '/session' }
}
export function assertUser(user) {
  if (!user?.userId || !['01', '02', '03'].includes(user.userType)) {
    const error = new Error('请使用普通用户账号登录，管理员请前往运维管理端')
    error.code = 40100
    throw error
  }
  if (user.authorCapability !== true) {
    const error = new Error('账号未开通创作者能力，暂时无法登录创作者端')
    error.code = 40100
    error.reason = 'creator-required'
    throw error
  }
  return user
}
export async function request(path, { method = 'GET', body, authenticated = true, timeout = 30000 } = {}) {
  const token = authenticated ? getToken() : ''
  const headers = { Accept: 'application/json' }
  const multipart = typeof FormData !== 'undefined' && body instanceof FormData
  if (body !== undefined && !multipart) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = 'Bearer ' + token
  const response = await fetch(BASE_API + path, { method, headers, body: body === undefined ? undefined : multipart ? body : JSON.stringify(body), signal: AbortSignal.timeout(timeout) })
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
/** PC 门户在服务端登记的设备标识：注册 / 发码都要求 deviceId，Web 端固定一个即可。 */
const PC_DEVICE_ID = 'pc-web'
const PC_DEVICE_NAME = 'PC Web'

/** 当前生效的用户协议与隐私政策。注册时按服务端返回的版本提交，避免本地硬编码导致 409。 */
export async function getAgreements() {
  const result = await request('/api/v1/auth/agreements', { authenticated: false })
  // 后端 AjaxResult.success(map) 会把协议放进 data.agreements，兼容两种形态。
  const list = Array.isArray(result.agreements) ? result.agreements : Array.isArray(result.data?.agreements) ? result.data.agreements : []
  if (list.length < 2) throw new Error('协议版本获取失败，请稍后重试')
  return list
}

/** 发送短信验证码，scene 取 REGISTER / RESET_PASSWORD。返回 cooldownSeconds 供倒计时使用。 */
export async function sendSmsCode({ phone, scene }) {
  return request('/api/v1/auth/sms/send', {
    method: 'POST',
    authenticated: false,
    body: { phone, scene, deviceId: PC_DEVICE_ID }
  })
}

export async function sendEmailCode(email, scene = 'REGISTER') {
  return request('/api/v1/auth/email/send', { method: 'POST', authenticated: false, body: { email: email.trim().toLowerCase(), ...(scene === 'REGISTER' ? {} : { scene }) } })
}

/** 注册个人账号：注册即完成手机号校验，服务端会同时记录当前协议版本。 */
export async function register({ phone, code, password }) {
  const agreements = await getAgreements()
  return request('/api/v1/auth/register', {
    method: 'POST',
    authenticated: false,
    body: {
      ...(phone.includes('@') ? { email: phone.trim().toLowerCase() } : { phone }),
      code,
      password,
      deviceId: PC_DEVICE_ID,
      deviceName: PC_DEVICE_NAME,
      agreementAcceptances: agreements.map(({ type, version }) => ({ type, version }))
    }
  })
}

/** 通过手机号 + 短信验证码重置密码；成功后该账号已有的 App 会话会被服务端吊销。 */
export async function resetPassword({ phone, code, newPassword }) {
  return request('/api/v1/auth/password/reset', { method: 'POST', authenticated: false, body: { ...(phone.includes('@') ? { email: phone.trim().toLowerCase() } : { phone }), code, newPassword } })
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

