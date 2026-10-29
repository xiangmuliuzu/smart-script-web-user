<template>
  <div class="login-wrap">
    <aside class="login-aside">
      <div class="brand"><b>剧云策</b><span>创作者中心</span></div>
      <blockquote>好故事值得一份<br />盖章的凭证。<footer>创作 · 审核 · 确权 · 收益</footer></blockquote>
      <picture>
        <source :srcset="creatorIllustration" type="image/webp" media="(min-width: 821px)" />
        <img src="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=" width="1254" height="1254" fetchpriority="high" decoding="async" class="login-illustration" alt="编剧使用电脑和笔记创作剧本，桌上摆放分镜与场记板" />
      </picture>
      <div class="fine">剧云策 · 智能剧本创作平台</div>
    </aside>
    <main class="login-main">
      <div class="login-form">
        <h1>{{ heading }}</h1><p>{{ subheading }}</p>
        <template v-if="mode === 'login'">
          <div v-if="route.query.reason === 'creator-required'" class="note bad error-message" role="alert">账号未开通创作者能力，暂时无法登录创作者端。</div>
          <el-form ref="formRef" :model="form" :rules="rules" class="auth-form" label-position="top" @submit.prevent="submit">
            <el-form-item label="用户名 / 手机号 / 邮箱" prop="username"><el-input v-model="form.username" placeholder="请输入用户名、手机号或邮箱" autocomplete="username" :prefix-icon="User" /></el-form-item>
            <el-form-item label="密码" prop="password"><el-input v-model="form.password" type="password" placeholder="请输入密码" show-password autocomplete="current-password" :prefix-icon="Lock" /></el-form-item>
            <el-form-item v-if="captchaEnabled" label="验证码"><div class="captcha-row"><el-input v-model="form.code" placeholder="请输入验证码" maxlength="8" autocomplete="off" /><button type="button" class="captcha-img" :disabled="captchaLoading" aria-label="刷新验证码" @click="refreshCaptcha"><img v-if="captchaImage" :src="captchaImage" alt="验证码" /><span v-else>点击重试</span></button></div></el-form-item>
            <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon class="error-message" />
            <div class="form-options"><el-checkbox v-model="remember">记住密码</el-checkbox><button type="button" class="forgot-link" @click="mode = 'reset'">忘记密码？</button></div>
            <el-button class="login-button" type="primary" native-type="submit" :loading="loading" :disabled="!captchaReady || captchaLoading">登录</el-button>
          </el-form>
          <p class="signup-row">还没有账号？<button type="button" class="forgot-link" @click="mode = 'register'">注册个人账号</button></p>
        </template>
        <AccountPanel
          v-else
          :mode="mode"
          register-desc="账号已创建。创作者中心仅向已开通创作者能力的账号开放，请打开剧云策 App 用该账号登录并提交创作者认证，审核通过后即可登录。"
          @back="mode = 'login'"
          @switch="mode = $event"
        />
      </div>
    </main>
  </div>
</template>
<script setup>
import { computed, reactive, ref, onMounted } from 'vue'
import creatorIllustration from '../assets/images/login-creator-v2.webp'
import { useRoute, useRouter } from 'vue-router'
import { User, Lock } from '@element-plus/icons-vue'
import { getCaptcha, login, safeRedirect } from '../auth.js'
import { portal } from '../portal.js'
import AccountPanel from '../components/AccountPanel.vue'
const route = useRoute()
const router = useRouter()
const formRef = ref(null)
// 登录 / 注册 / 找回密码在同一页切换，不再用弹窗。
const mode = ref('login')
const heading = computed(() => (mode.value === 'register' ? '注册个人账号' : mode.value === 'reset' ? '找回密码' : '登录创作者中心'))
const subheading = computed(() =>
  mode.value === 'register'
    ? '用手机号或邮箱注册剧云策账号，注册后可在 App 提交创作者认证。'
    : mode.value === 'reset'
      ? '通过绑定手机号或邮箱接收验证码，重置登录密码。'
      : '用手机号、邮箱或账号登录，管理你的作品、版权与收益。'
)
// 记住密码：勾选后把账号和密码一起写进本机 localStorage，取消勾选立即清除。
// 兼容早期只存账号的纯文本值，读到时按「只有账号」处理。
function readRemembered() {
  let raw = ''
  try { raw = localStorage.getItem(portal.rememberKey) || '' } catch { return {} }
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    return typeof parsed === 'string' ? { username: parsed } : parsed || {}
  } catch {
    return { username: raw }
  }
}
const remembered = readRemembered()
const form = reactive({ username: remembered.username || '', password: remembered.password || '', code: '', uuid: '' })
const remember = ref(Boolean(remembered.username || remembered.password))
const loading = ref(false)
const captchaLoading = ref(false)
const captchaEnabled = ref(true)
const captchaReady = ref(false)
const captchaImage = ref('')
const error = ref('')
const rules = { username: [{ validator: (rule, value, callback) => callback(value?.trim() ? undefined : new Error('请输入用户名、手机号或邮箱')), trigger: 'blur' }], password: [{ required: true, message: '请输入密码', trigger: 'blur' }] }
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
    if (remember.value) localStorage.setItem(portal.rememberKey, JSON.stringify({ username: form.username.trim(), password: form.password }))
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
<style scoped>
.login-button {
  --el-button-bg-color: #1f2329;
  --el-button-border-color: #1f2329;
  --el-button-hover-bg-color: #000;
  --el-button-hover-border-color: #000;
  --el-button-active-bg-color: #000;
  --el-button-active-border-color: #000;
  --el-button-disabled-bg-color: #9b968e;
  --el-button-disabled-border-color: #9b968e;
}
.login-main { background: #f1ece3; }
.login-aside {
  position: relative;
  isolation: isolate;
  padding: 40px clamp(32px, 4vw, 64px);
  background: #f1ece3;
  color: #292723;
  border-right: 1px solid #d8d0c4;
}
.login-aside .brand b { color: #292723; font-size: 28px; }
.login-aside .brand span { font-size: 14px; }
.login-aside blockquote {
  margin: 26px 0 auto;
  font-size: clamp(28px, 3vw, 40px);
  line-height: 1.35;
}
.login-aside blockquote footer { margin-top: 12px; color: #716a60; font-size: 15px; }
.login-aside .brand span, .login-aside .fine { color: #716a60; }
.login-illustration {
  position: absolute;
  z-index: -1;
  left: 50%;
  top: 58%;
  transform: translate(-50%, -50%);
  width: 99.36%;
  height: 69%;
  max-width: 772.8px;
  object-fit: contain;
}
@media (max-width: 820px) {
  .login-aside { padding: 28px 26px; border-right: 0; border-bottom: 1px solid #d8d0c4; }
  .login-illustration { display: none; }
  .login-aside .brand b { font-size: 24px; }
  .login-aside .brand span { display: inline; font-size: 13px; }
  .login-aside blockquote { margin: 20px 0; max-width: 13ch; font-size: 28px; }
  .login-aside blockquote footer { font-size: 14px; }
}
</style>
