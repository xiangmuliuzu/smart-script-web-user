const GENERIC = '操作未完成，请稍后再试'

const STATUS_MESSAGES = {
  400: '您的信息不符合规范，请检查后重试',
  401: '登录状态已过期，请重新登录',
  403: '暂无权限执行此操作',
  404: '内容不存在或暂时不可用',
  405: '请求方式不正确，请稍后再试',
  413: '文件过大，请更换后重试',
  429: '操作过于频繁，请稍后再试',
  500: '服务暂时不可用，请稍后再试',
  502: '服务暂时不可用，请稍后再试',
  503: '服务暂时不可用，请稍后再试',
  408: '请求超时，请稍后再试',
  504: '请求超时，请稍后再试'
}

const CODE_MESSAGES = {
  40000: '您的信息不符合规范，请检查后重试',
  40001: '验证码错误，请重新输入',
  40002: '验证码已过期，请重新获取',
  40901: '验证码已使用，请重新获取',
  40902: '该手机号或邮箱已注册，请直接登录',
  40903: '协议已更新，请重新阅读并同意',
  40905: '实名认证正在审核或已通过，请勿重复提交',
  40906: '请勿重复提交',
  40907: '该昵称已被使用，请更换后重试',
  40908: '创作者申请正在审核或已通过，请勿重复提交',
  40100: '登录状态已过期，请重新登录',
  40101: '登录状态已过期，请重新登录',
  40102: '登录状态已过期，请重新登录',
  40300: '暂无权限执行此操作',
  40301: '账号暂时无法使用，请联系客服或管理员',
  40400: '内容不存在或暂时不可用',
  41300: '文件过大，请更换后重试',
  42901: '操作过于频繁，请稍后再试',
  42902: '操作过于频繁，请稍后再试',
  50000: '服务暂时不可用，请稍后再试'
}

const TECH_MARKERS = ['http', 'exception', 'traceback', 'stacktrace', 'sqlexception',
  'null', 'undefined', 'com.ruoyi', 'com.smartscript', 'java.']

export function safeMessage(message) {
  if (typeof message !== 'string') return null
  const text = message.trim()
  if (!text) return null
  if (!/[一-鿿]/.test(text)) return null
  const lower = text.toLowerCase()
  if (TECH_MARKERS.some(marker => lower.includes(marker))) return null
  if (text.includes('/') || text.includes('\\')) return null
  return text
}

export function messageForStatus(status) {
  return STATUS_MESSAGES[Number(status)] || null
}

export function messageForCode(code) {
  return CODE_MESSAGES[Number(code)] || null
}

export function friendlyErrorMessage({ status, code, message, fallback = GENERIC } = {}) {
  return safeMessage(message) || messageForCode(code) || messageForStatus(status) || fallback
}

export function networkErrorMessage(error, fallback = GENERIC) {
  if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
    return '请求超时，请稍后再试'
  }
  if (error instanceof TypeError || /failed to fetch|networkerror|load failed|network request failed/i.test(error?.message || '')) {
    return '网络连接异常，请检查网络后重试'
  }
  return friendlyErrorMessage({
    status: error?.status,
    code: error?.code,
    message: error?.message,
    fallback
  })
}
