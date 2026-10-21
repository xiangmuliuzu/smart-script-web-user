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
        }
      }
    }
  }
})
