<template>
  <main class="login-page">
    <section class="login-left">
      <div class="login-panel">
        <div class="brand-row"><span class="logo-icon"><el-icon :size="22"><Document /></el-icon></span><span class="brand-name">剧云策</span><span class="portal-label">{{ portal.label }}</span></div>
        <div class="login-head"><h1 class="login-title">欢迎回来</h1><p class="login-desc">{{ portal.purpose }}，请使用平台账号登录</p></div>
        <el-form ref="formRef" :model="form" :rules="rules" class="login-form" label-position="top" size="large" @submit.prevent="submit">
          <el-form-item label="用户名 / 手机号" prop="username"><el-input v-model="form.username" placeholder="请输入用户名或手机号" autocomplete="username" :prefix-icon="User" /></el-form-item>
          <el-form-item label="密码" prop="password"><el-input v-model="form.password" type="password" placeholder="请输入密码" show-password autocomplete="current-password" :prefix-icon="Lock" /></el-form-item>
          <el-form-item v-if="captchaEnabled" label="验证码"><div class="captcha-row"><el-input v-model="form.code" placeholder="请输入验证码" maxlength="8" autocomplete="off" /><button type="button" class="captcha-img" :disabled="captchaLoading" aria-label="刷新验证码" @click="refreshCaptcha"><img v-if="captchaImage" :src="captchaImage" alt="验证码" /><span v-else>点击重试</span></button></div></el-form-item>
          <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon class="error-message" />
          <div class="form-options"><el-checkbox v-model="remember">记住账号</el-checkbox><button type="button" class="forgot-link" @click="ElMessage.info('请联系平台管理员找回密码')">忘记密码？</button></div>
          <el-button class="login-button" type="primary" native-type="submit" :loading="loading" :disabled="!captchaReady || captchaLoading">登录</el-button>
        </el-form>
        <p class="login-footer">{{ portal.label }}与平台共用账号，只记住账号，不保存密码</p>
      </div>
    </section>
    <aside class="login-right"><div class="visual-bg"></div><div class="visual-caption"><p class="visual-slogan">{{ portal.purpose }}</p><p class="visual-sub">剧云策 · 智能剧本创作平台</p></div></aside>
  </main>
</template>
<script setup>
import { reactive, ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Document, User, Lock } from '@element-plus/icons-vue'
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
<style scoped>
/* ==================== 页面布局：左右分屏 ==================== */
.login-page {
  display: flex;
  min-height: 100vh;
  background-color: #ffffff;
}

.login-left {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  padding: 40px 24px;
}

.login-right {
  position: relative;
  display: none;
  width: 50%;
  overflow: hidden;
}

@media (min-width: 992px) {
  .login-left {
    width: 50%;
  }

  .login-right {
    display: block;
  }
}

/* ==================== 左侧表单区 ==================== */
.login-panel {
  width: 100%;
  max-width: 400px;
}

.brand-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 48px;
}

.logo-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  background: linear-gradient(135deg, #1f2329 0%, #3a3f47 100%);
  border-radius: 10px;
  color: #ffffff;
}

.brand-name {
  font-size: 18px;
  font-weight: 600;
  color: #1f2329;
  letter-spacing: 2px;
}

.login-head {
  margin-bottom: 32px;
}

.login-title {
  font-size: 26px;
  font-weight: 600;
  color: #1f2329;
  margin: 0 0 10px 0;
  letter-spacing: 1px;
}

.login-desc {
  font-size: 14px;
  color: #8c8c8c;
  margin: 0;
  line-height: 1.6;
}

/* ==================== 表单样式 ==================== */
.login-form :deep(.el-form-item) {
  margin-bottom: 20px;
}

.login-form :deep(.el-form-item__label) {
  font-size: 13px;
  color: #595959;
  font-weight: 500;
  line-height: 1.5;
  margin-bottom: 6px;
  padding-bottom: 0;
}

.login-form :deep(.el-input__wrapper) {
  height: 44px;
  border-radius: 8px;
  box-shadow: 0 0 0 1px #d9d9d9 inset;
  padding: 0 14px;
  transition: box-shadow 0.2s ease;
}

.login-form :deep(.el-input__wrapper:hover) {
  box-shadow: 0 0 0 1px #1f2329 inset;
}

.login-form :deep(.el-input__wrapper.is-focus) {
  box-shadow: 0 0 0 2px rgba(31, 35, 41, 0.18) inset;
}

.login-form :deep(.el-input__inner) {
  font-size: 14px;
  color: #262626;
  height: 100%;
}

.login-form :deep(.el-input__inner::placeholder) {
  color: #bfbfbf;
}

.login-form :deep(.el-input__prefix) {
  color: #8c8c8c;
}

.captcha-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
}

.captcha-row .el-input {
  flex: 1;
}

.captcha-img {
  width: 120px;
  height: 44px;
  border-radius: 8px;
  cursor: pointer;
  object-fit: contain;
  background: #f5f6f8;
  box-shadow: 0 0 0 1px #e8e8e8 inset;
}

.captcha-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: #8c8c8c;
}

.form-options {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
}

.form-options :deep(.el-checkbox__label) {
  font-size: 13px;
  color: #595959;
}

.forgot-link {
  font-size: 13px;
  color: #1f2329;
  cursor: pointer;
}

.forgot-link:hover {
  text-decoration: underline;
}

.login-button {
  width: 100%;
  height: 44px;
  background-color: #1f2329;
  border-color: #1f2329;
  color: #ffffff;
  font-size: 15px;
  font-weight: 500;
  letter-spacing: 6px;
  border-radius: 8px;
  transition: background-color 0.2s ease, transform 0.15s ease;
}

.login-button:hover,
.login-button:focus {
  background-color: #000000;
  border-color: #000000;
  color: #ffffff;
}

.login-button:active {
  background-color: #000000;
  border-color: #000000;
  transform: scale(0.99);
}

.login-footer {
  margin-top: 40px;
  text-align: center;
  font-size: 12px;
  color: #bfbfbf;
  line-height: 1.5;
}

/* ==================== 右侧视觉面板 ==================== */
.visual-bg {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(80% 60% at 20% 10%, rgba(255, 255, 255, 0.14) 0%, transparent 60%),
    radial-gradient(60% 50% at 85% 90%, rgba(255, 255, 255, 0.1) 0%, transparent 55%),
    linear-gradient(150deg, #2b3038 0%, #1f2329 55%, #12151a 100%);
}

.visual-img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.visual-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.55) 0%, rgba(0, 0, 0, 0.08) 45%, rgba(0, 0, 0, 0.12) 100%);
}

.visual-caption {
  position: absolute;
  left: 48px;
  right: 48px;
  bottom: 48px;
  color: #ffffff;
}

.visual-slogan {
  font-size: 26px;
  font-weight: 600;
  letter-spacing: 2px;
  margin: 0 0 10px 0;
  text-shadow: 0 2px 12px rgba(0, 0, 0, 0.4);
}

.visual-sub {
  font-size: 14px;
  opacity: 0.82;
  letter-spacing: 1px;
  margin: 0;
  text-shadow: 0 1px 8px rgba(0, 0, 0, 0.4);
}

/* ==================== 入场动画 ==================== */
@media (prefers-reduced-motion: no-preference) {
  .brand-row,
  .login-head,
  .login-form,
  .login-footer {
    animation: fade-up 0.5s ease both;
  }

  .login-head {
    animation-delay: 0.08s;
  }

  .login-form {
    animation-delay: 0.16s;
  }

  .login-footer {
    animation-delay: 0.24s;
  }

  .visual-caption {
    animation: fade-up 0.7s ease 0.2s both;
  }
}

@keyframes fade-up {
  from {
    opacity: 0;
    transform: translateY(16px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
.portal-label { font-size: 12px; color: #7b8088; border-left: 1px solid #d9d9d9; padding-left: 12px; }
.captcha-img { border: 0; padding: 0; flex-shrink: 0; }
.captcha-img img { width: 100%; height: 100%; object-fit: contain; }
.forgot-link { border: 0; background: none; padding: 0; }
.error-message { margin-bottom: 16px; }
.visual-bg { background: radial-gradient(ellipse at 75% 25%, #545d64 0%, transparent 55%), linear-gradient(145deg, #292f38, #14171c); }
</style>
