<template>
  <div class="login-wrap">
    <aside class="login-aside"><div class="brand"><b>剧云策</b><span>创作者中心</span></div><blockquote>好故事值得一份<br />盖章的凭证。<footer>创作 · 审核 · 确权 · 收益</footer></blockquote><div class="fine">剧云策 · 智能剧本创作平台</div></aside>
    <main class="login-main">
      <div class="login-form">
        <h1>登录创作者中心</h1><p>用手机号或账号登录，管理你的作品、版权与收益。</p>
        <div v-if="route.query.reason === 'creator-required'" class="note bad error-message" role="alert">账号未开通创作者能力，暂时无法登录创作者端。</div>
        <el-form ref="formRef" :model="form" :rules="rules" class="auth-form" label-position="top" @submit.prevent="submit">
          <el-form-item label="用户名 / 手机号" prop="username"><el-input v-model="form.username" placeholder="请输入用户名或手机号" autocomplete="username" :prefix-icon="User" /></el-form-item>
          <el-form-item label="密码" prop="password"><el-input v-model="form.password" type="password" placeholder="请输入密码" show-password autocomplete="current-password" :prefix-icon="Lock" /></el-form-item>
          <el-form-item v-if="captchaEnabled" label="验证码"><div class="captcha-row"><el-input v-model="form.code" placeholder="请输入验证码" maxlength="8" autocomplete="off" /><button type="button" class="captcha-img" :disabled="captchaLoading" aria-label="刷新验证码" @click="refreshCaptcha"><img v-if="captchaImage" :src="captchaImage" alt="验证码" /><span v-else>点击重试</span></button></div></el-form-item>
          <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon class="error-message" />
          <div class="form-options"><el-checkbox v-model="remember">记住账号</el-checkbox><button type="button" class="forgot-link" @click="ElMessage.info('请联系平台管理员找回密码')">忘记密码？</button></div>
          <el-button class="login-button" type="primary" native-type="submit" :loading="loading" :disabled="!captchaReady || captchaLoading">登录</el-button>
        </el-form>
        <p class="login-footer">仅限已开通创作者能力的账号登录。<br />只记住账号，不保存密码。</p>
      </div>
    </main>
  </div>
</template>
<script setup>
import { reactive, ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { User, Lock } from '@element-plus/icons-vue'
import { getCaptcha, login, safeRedirect } from '../auth.js'
import { portal } from '../portal.js'
const route = useRoute()
const router = useRouter()
const formRef = ref(null)
const form = reactive({ username: localStorage.getItem(portal.rememberKey) || '', password: '', code: '', uuid: '' })
const remember = ref(!!form.username)
const loading = ref(false)
const captchaLoading = ref(false)
const captchaEnabled = ref(true)
const captchaReady = ref(false)
const captchaImage = ref('')
const error = ref('')
const rules = { username: [{ validator: (rule, value, callback) => callback(value?.trim() ? undefined : new Error('请输入用户名或手机号')), trigger: 'blur' }], password: [{ required: true, message: '请输入密码', trigger: 'blur' }] }
async function refreshCaptcha() {
  if (captchaLoading.value) return
  captchaLoading.value = true
  captchaReady.value = false
  form.code = ''
  form.uuid = ''
  captchaImage.value = ''
  try {
    const result = await getCaptcha()
    captchaEnabled.value = result.captchaEnabled !== false
    form.uuid = result.uuid || ''
    captchaImage.value = result.img ? (result.img.startsWith('data:') ? result.img : 'data:image/gif;base64,' + result.img) : ''
    captchaReady.value = true
    error.value = ''
  } catch (failure) { error.value = failure.message || '验证码加载失败，请重试' }
  finally { captchaLoading.value = false }
}
async function submit() {
  if (loading.value || !captchaReady.value || captchaLoading.value) return
  loading.value = true
  error.value = ''
  try {
    const valid = await formRef.value.validate().catch(() => false)
    if (!valid) return
    if (captchaEnabled.value && !form.code.trim()) { error.value = '请输入验证码'; return }
    await login({ ...form, username: form.username.trim() })
    if (remember.value) localStorage.setItem(portal.rememberKey, form.username.trim())
    else localStorage.removeItem(portal.rememberKey)
    await router.replace(safeRedirect(route.query.redirect))
  } catch (failure) {
    const message = failure.message || '登录失败，请重试'
    await refreshCaptcha()
    error.value = message
  } finally { loading.value = false }
}
onMounted(refreshCaptcha)
</script>
