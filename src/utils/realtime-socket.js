/**
 * 站内实时通知长连接（WebSocket）。
 *
 * 约定：服务端帧只携带「发生了哪类事」和定位 id，正文一律由调用方回查接口获取，
 * 因此这条连接丢帧或断开都不会造成数据缺失——它只是把「最长等一个轮询周期」
 * 变成「立刻去拉一次」。
 *
 * 浏览器的 WebSocket 无法自定义请求头，令牌只能通过查询参数传递。
 */
import { getToken } from '../auth.js'

const HEARTBEAT_INTERVAL_MS = 25000
const PONG_TIMEOUT_MS = 35000
const RECONNECT_BASE_MS = 1000
const RECONNECT_MAX_MS = 30000

const handlers = new Map()
let socket = null
let heartbeatTimer = null
let pongTimer = null
let reconnectTimer = null
let attempt = 0
let closedByApp = false
let connectedOnce = false

function endpoint() {
  const scheme = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const token = encodeURIComponent(getToken() || '')
  return `${scheme}//${window.location.host}/ws/notify?token=${token}`
}

export function isRealtimeConnected() {
  return !!socket && typeof WebSocket !== 'undefined' && socket.readyState === WebSocket.OPEN
}

/**
 * 订阅一类实时事件。type 取值 connected / notification / chat / reconnect，
 * '*' 表示全部；返回取消订阅函数，组件卸载时必须调用，避免监听器堆积。
 */
export function onRealtime(type, handler) {
  if (!handlers.has(type)) handlers.set(type, new Set())
  handlers.get(type).add(handler)
  return () => handlers.get(type)?.delete(handler)
}

function emit(type, payload) {
  handlers.get(type)?.forEach(fn => {
    try { fn(payload) } catch (e) { console.warn('[realtime] handler failed', e) }
  })
  handlers.get('*')?.forEach(fn => {
    try { fn({ type, ...payload }) } catch (e) { console.warn('[realtime] handler failed', e) }
  })
}

/** 建立连接；已连接或正在连接时是空操作，可在任意组件挂载时安全调用。 */
export function connectRealtime() {
  if (isRealtimeConnected() || socket) return
  closedByApp = false
  try {
    socket = new WebSocket(endpoint())
  } catch (e) {
    console.warn('[realtime] 无法建立长连接，回退轮询', e)
    scheduleReconnect()
    return
  }
  socket.onopen = () => {
    // 断线重连后的第一次 open 才需要补拉：页面首次挂载时各视图本来就会拉一次
    const needsCatchUp = connectedOnce
    connectedOnce = true
    attempt = 0
    startHeartbeat()
    emit('connected', {})
    if (needsCatchUp) emit('reconnect', {})
  }
  socket.onmessage = event => {
    let frame
    try { frame = JSON.parse(event.data) } catch { return }
    if (!frame || typeof frame.type !== 'string') return
    clearPongTimeout()
    if (frame.type === 'pong') return
    emit(frame.type, frame)
  }
  socket.onclose = event => {
    cleanup()
    emit('disconnected', {})
    // 1008 = 服务端策略关闭（登录会话已失效），继续重连只会反复撞墙
    if (!closedByApp && event.code !== 1008) scheduleReconnect()
  }
  socket.onerror = () => {
    try { socket?.close() } catch { /* 交给 onclose 统一处理 */ }
  }
}

export function disconnectRealtime() {
  closedByApp = true
  connectedOnce = false
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
  try { socket?.close() } catch { /* 已关闭 */ }
  cleanup()
}

function cleanup() {
  stopHeartbeat()
  clearPongTimeout()
  socket = null
}

function scheduleReconnect() {
  if (reconnectTimer || closedByApp) return
  const delay = Math.min(RECONNECT_BASE_MS * (2 ** attempt), RECONNECT_MAX_MS)
  attempt += 1
  // 加抖动：避免几十台设备在服务重启后同一刻齐刷刷重连
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    connectRealtime()
  }, delay + Math.floor(Math.random() * 500))
}

function startHeartbeat() {
  stopHeartbeat()
  heartbeatTimer = setInterval(() => {
    if (!isRealtimeConnected()) return
    try { socket.send(JSON.stringify({ type: 'ping' })) } catch { return }
    clearPongTimeout()
    pongTimer = setTimeout(() => {
      // 长时间没有应答：链路已经不可用，主动断开走重连流程
      try { socket?.close() } catch { /* 已关闭 */ }
    }, PONG_TIMEOUT_MS)
  }, HEARTBEAT_INTERVAL_MS)
}

function stopHeartbeat() {
  if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null }
}

function clearPongTimeout() {
  if (pongTimer) { clearTimeout(pongTimer); pongTimer = null }
}
