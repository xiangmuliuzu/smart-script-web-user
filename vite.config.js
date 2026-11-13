import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const prefix = env.VITE_APP_BASE_API || '/dev-api'
  const target = env.VITE_API_TARGET || 'http://localhost:8080'
  return {
    base: '/user/',
    plugins: [vue()],
    server: {
      port: 3001,
      strictPort: true,
      proxy: {
        // 业务 API：/dev-api → 后端（剥前缀）
        [prefix]: {
          target,
          changeOrigin: true,
          rewrite: path => path.slice(prefix.length)
        },
        // 静态资源：与 Admin 一致，直接代理 /profile/**，避免未带 API 前缀的图片破图
        '/profile': {
          target,
          changeOrigin: true
        },
        // 实时通知长连接。ws:true 才会转发 Upgrade 握手；生产环境需 Nginx 配
        // proxy_http_version 1.1 + Proxy Upgrade 头，否则浏览器只会拿到 SPA 的 HTML。
        '/ws': {
          target,
          changeOrigin: true,
          ws: true
        }
      }
    }
  }
})
