<template>
  <main class="session-page"><section class="session-card">
    <p class="brand">剧云策 · {{ portal.label }}</p>
    <template v-if="pending"><h1>正在确认登录状态</h1><p>请稍候</p></template>
    <template v-else-if="error"><h1>暂时无法确认登录状态</h1><p role="alert">{{ error }}</p><el-button type="primary" @click="load">重试</el-button></template>
    <template v-else-if="user"><h1>登录成功</h1><p>欢迎，{{ user.nickname || user.userName || '用户' }}</p><p>欢迎使用剧云策{{ portal.label }}</p></template>
    <el-button :loading="leaving" @click="leave">退出登录</el-button>
  </section></main>
</template>
<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { portal } from '../portal.js'
import { getInfo, logout, isAuthFailure } from '../auth.js'
const router = useRouter()
const user = ref(null)
const pending = ref(true)
const leaving = ref(false)
const error = ref('')
let generation = 0
async function load() {
  const current = ++generation
  pending.value = true
  error.value = ''
  user.value = null
  try {
    const result = await getInfo()
    if (current === generation) user.value = result.user
  } catch (failure) {
    if (current !== generation) return
    if (isAuthFailure(failure)) { await router.replace('/login'); return }
    error.value = failure.message || '网络暂时不可用，请重试'
  } finally { if (current === generation) pending.value = false }
}
async function leave() {
  if (leaving.value) return
  ++generation
  user.value = null
  leaving.value = true
  try { await logout() }
  catch { ElMessage.warning('服务端退出未成功，已清理本地登录状态') }
  finally { await router.replace('/login'); leaving.value = false }
}
onMounted(load)
</script>
<style scoped>
.session-page { min-height: 100vh; display: grid; place-items: center; padding: 24px; background: #f5f6f8; }
.session-card { width: 100%; max-width: 480px; padding: 40px; background: white; border: 1px solid #e8e8e8; border-radius: 16px; }
.brand { font-size: 13px; color: #767d87; letter-spacing: 2px; }
h1 { margin: 24px 0 16px; font-size: 26px; }
p { line-height: 1.7; overflow-wrap: anywhere; }
.el-button { margin-top: 16px; }
</style>
