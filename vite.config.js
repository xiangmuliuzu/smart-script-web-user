import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const prefix = env.VITE_APP_BASE_API || '/dev-api'
  return { plugins: [vue()], server: { port: 3001, strictPort: true, proxy: { [prefix]: { target: env.VITE_API_TARGET || 'http://localhost:8080', changeOrigin: true, rewrite: path => path.slice(prefix.length) } } } }
})
