import fs from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'

const MEDIA_ROOT = '/profile/'

/**
 * 共享库里媒体 URL 只记 /profile/**，原件却落在「发起上传那台机器」的磁盘上，
 * 因此本机 dev 服务读不到别人（或服务器）上传的图。本插件只影响 dev server：
 * 本机有原件就照常交给本地后端，本机没有就从远端取，远端也没有就保持原有 404 行为。
 */
export function remoteMediaFallback({ apiPrefix = '', remoteBase = '', localDir = '' } = {}) {
  const upstreamBase = (remoteBase || '').replace(/\/+$/, '')
  const rootDir = localDir ? path.resolve(localDir) : ''
  return {
    name: 'remote-media-fallback',
    apply: 'serve',
    configureServer(server) {
      if (!upstreamBase || !rootDir) return
      server.middlewares.use((req, res, next) => {
        if (req.method !== 'GET') return next()
        const mediaPath = toMediaPath(req.url || '', apiPrefix)
        // 合同材料受 ProfileAccessSigner 签名保护，本地与远端密钥不同，不做回源以免把 403 调成“看起来正常”
        if (!mediaPath || mediaPath.startsWith('/profile/contract/')) return next()
        if (localFileExists(rootDir, mediaPath)) return next()
        fetchFromUpstream(upstreamBase, mediaPath, req, res, next)
      })
    }
  }
}

function toMediaPath(rawUrl, apiPrefix) {
  let clean
  try {
    clean = decodeURIComponent(rawUrl.split('?')[0])
  } catch {
    return null
  }
  const withoutPrefix = apiPrefix && clean.startsWith(`${apiPrefix}/`) ? clean.slice(apiPrefix.length) : clean
  return withoutPrefix.startsWith(MEDIA_ROOT) ? withoutPrefix : null
}

function localFileExists(rootDir, mediaPath) {
  const absolute = path.resolve(rootDir, mediaPath.slice('/profile'.length))
  const inside = absolute === rootDir || absolute.startsWith(rootDir + path.sep)
  return inside && fs.existsSync(absolute)
}

function encodeMediaPath(mediaPath) {
  return mediaPath.split('/').map(encodeURIComponent).join('/')
}

async function fetchFromUpstream(upstreamBase, mediaPath, req, res, next) {
  try {
    const upstream = await fetch(upstreamBase + encodeMediaPath(mediaPath), { redirect: 'follow' })
    if (!upstream.ok) {
      upstream.body?.cancel()
      return next()
    }
    res.setHeader('content-type', upstream.headers.get('content-type') || 'application/octet-stream')
    res.setHeader('cache-control', 'no-store')
    res.writeHead(upstream.status)
    Readable.fromWeb(upstream.body).pipe(res)
  } catch {
    // 离线或远端不可达：交回原有代理链，行为与未装本插件时一致
    next()
  }
}
