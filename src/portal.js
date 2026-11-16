export const portal = { label: '创作者端', tokenKey: 'PcUser-Token', rememberKey: 'user-remember-username', purpose: '登录创作者中心，开启你的故事' }

// 登录页右上角的另一端入口。生产同域按 base 路径跳；本地两个 Vite 服务
// 分别跑在 3001/3002，需要连同端口一起切换。
export const portalSwitch = { label: '企业端', target: '/enterprise/' }

export function portalSwitchHref(location = window.location) {
  const devPorts = { '3001': '3002', '3002': '3001' }
  const targetPort = devPorts[String(location.port)]
  const origin = targetPort
    ? `${location.protocol}//${location.hostname}:${targetPort}`
    : location.origin
  return `${origin}${portalSwitch.target}`
}

