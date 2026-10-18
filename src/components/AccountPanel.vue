<template>
  <div class="account-panel">
    <div v-if="success" class="account-result">
      <p class="result-title">{{ resultTitle }}</p>
      <p class="result-desc">{{ resultDesc }}</p>
      <el-button type="primary" class="result-back" @click="emit('back')">返回登录</el-button>
    </div>
    <el-form v-else ref="formRef" :model="form" :rules="rules" label-position="top" class="account-form" @submit.prevent="submit">
      <el-form-item label="手机号" prop="phone">
        <el-input v-model="form.phone" maxlength="11" placeholder="请输入 11 位手机号" autocomplete="tel" inputmode="numeric" />
      </el-form-item>
      <el-form-item label="短信验证码" prop="code">
        <div class="code-row">
          <el-input v-model="form.code" maxlength="8" placeholder="请输入验证码" autocomplete="one-time-code" inputmode="numeric" />
          <button type="button" class="code-button" :disabled="countdown > 0 || sending" @click="sendCode">
            {{ countdown > 0 ? countdown + 's 后重发' : sending ? '发送中…' : '获取验证码' }}
          </button>
        </div>
      </el-form-item>
      <el-form-item :label="mode === 'register' ? '设置密码' : '新密码'" prop="password">
        <el-input v-model="form.password" type="password" show-password placeholder="8–64 位，需同时包含字母和数字" autocomplete="new-password" />
      </el-form-item>
      <el-form-item label="确认密码" prop="confirm">
        <el-input v-model="form.confirm" type="password" show-password placeholder="请再次输入密码" autocomplete="new-password" />
      </el-form-item>
      <el-form-item v-if="mode === 'register'" prop="agreed" class="agreement-item">
        <el-checkbox v-model="form.agreed">我已阅读并同意</el-checkbox>
        <span class="agreement-links">
          <a v-for="item in agreements" :key="item.type" :href="item.url" target="_blank" rel="noopener noreferrer" class="agreement-link">《{{ item.title }}》</a>
        </span>
      </el-form-item>
      <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon class="account-error" />
      <el-button class="account-submit" type="primary" native-type="submit" :loading="submitting">
        {{ mode === 'register' ? '注册' : '重置密码' }}
      </el-button>
    </el-form>
    <p v-if="!success" class="account-switch">
      <button type="button" class="switch-link" @click="emit('back')">返回登录</button>
      <span class="switch-divider">·</span>
      <button type="button" class="switch-link" @click="switchMode">{{ mode === 'register' ? '忘记密码' : '注册个人账号' }}</button>
    </p>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { getAgreements, register, resetPassword, sendSmsCode } from '../auth.js'

const props = defineProps({
  // reset=忘记密码；register=注册个人账号
  mode: { type: String, default: 'reset' },
  // 注册成功后的引导文案（用户端需要提示去 App 完成创作者认证）
  registerTitle: { type: String, default: '账号已创建' },
  registerDesc: { type: String, default: '请使用新账号登录。' }
})
const emit = defineEmits(['back', 'switch', 'registered'])

const formRef = ref(null)
const form = reactive({ phone: '', code: '', password: '', confirm: '', agreed: false })
const agreements = ref([])
const error = ref('')
const sending = ref(false)
const submitting = ref(false)
const success = ref(false)
const countdown = ref(0)
let timer = null

const resultTitle = computed(() => (props.mode === 'register' ? props.registerTitle : '密码已重置'))
const resultDesc = computed(() =>
  props.mode === 'register' ? props.registerDesc : '请使用新密码登录，此前已登录的设备需要重新登录。'
)

function passwordError(value) {
  const text = value || ''
  if (text.length < 8 || text.length > 64) return '密码需为 8–64 位'
  if (new TextEncoder().encode(text).length > 72) return '密码过长，请缩短后重试'
  if (!/\p{L}/u.test(text) || !/\p{Nd}/u.test(text)) return '密码需同时包含字母和数字'
  return ''
}

const rules = {
  phone: [{ validator: (rule, value, callback) => (/^1\d{10}$/.test((value || '').trim()) ? callback() : callback(new Error('请输入 11 位手机号'))), trigger: 'blur' }],
  code: [{ validator: (rule, value, callback) => (/^\d{4,8}$/.test((value || '').trim()) ? callback() : callback(new Error('请输入 4–8 位短信验证码'))), trigger: 'blur' }],
  password: [{ validator: (rule, value, callback) => (passwordError(value) ? callback(new Error(passwordError(value))) : callback()), trigger: 'blur' }],
  confirm: [{ validator: (rule, value, callback) => (value && value === form.password ? callback() : callback(new Error('两次输入的密码不一致'))), trigger: 'blur' }],
  agreed: [{ validator: (rule, value, callback) => (value ? callback() : callback(new Error('请先阅读并同意用户协议与隐私政策'))), trigger: 'change' }]
}

function resetState({ keepPhone = false } = {}) {
  error.value = ''
  success.value = false
  form.code = ''
  form.password = ''
  form.confirm = ''
  form.agreed = false
  if (!keepPhone) form.phone = ''
  formRef.value?.clearValidate()
  stopCountdown()
}

async function ensureAgreements() {
  if (agreements.value.length) return
  try {
    agreements.value = await getAgreements()
  } catch (failure) {
    // 协议拿不到只影响勾选展示；注册提交时 auth.register 会重新拉取并明确报错。
    agreements.value = []
    if (props.mode === 'register') error.value = failure.message || ''
  }
}

function startCountdown(seconds) {
  stopCountdown()
  const total = Number.isFinite(seconds) && seconds > 0 ? Math.min(Math.floor(seconds), 300) : 60
  countdown.value = total
  timer = setInterval(() => {
    countdown.value -= 1
    if (countdown.value <= 0) stopCountdown()
  }, 1000)
}

function stopCountdown() {
  if (timer) clearInterval(timer)
  timer = null
  countdown.value = 0
}

async function sendCode() {
  if (countdown.value > 0 || sending.value) return
  const phoneValid = await formRef.value?.validateField('phone').then(() => true).catch(() => false)
  if (!phoneValid) return
  sending.value = true
  error.value = ''
  try {
    const result = await sendSmsCode({
      phone: form.phone.trim(),
      scene: props.mode === 'register' ? 'REGISTER' : 'RESET_PASSWORD'
    })
    startCountdown(Number(result?.data?.cooldownSeconds) || 60)
    ElMessage.success('验证码已发送，请查收短信')
  } catch (failure) {
    error.value = failure.message || '验证码发送失败，请稍后重试'
  } finally {
    sending.value = false
  }
}

async function submit() {
  if (submitting.value) return
  error.value = ''
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  submitting.value = true
  try {
    const phone = form.phone.trim()
    const code = form.code.trim()
    if (props.mode === 'register') {
      const result = await register({ phone, code, password: form.password })
      if (typeof result?.token !== 'string' || !result.token) throw new Error('注册响应缺少会话，请稍后重试')
      success.value = true
      form.code = ''
      form.password = ''
      form.confirm = ''
      stopCountdown()
      emit('registered', result)
    } else {
      await resetPassword({ phone, code, newPassword: form.password })
      success.value = true
      form.code = ''
      form.password = ''
      form.confirm = ''
      stopCountdown()
    }
  } catch (failure) {
    error.value = failure.message || (props.mode === 'register' ? '注册失败，请稍后重试' : '重置失败，请稍后重试')
  } finally {
    submitting.value = false
  }
}

function switchMode() {
  const next = props.mode === 'register' ? 'reset' : 'register'
  resetState({ keepPhone: true })
  emit('switch', next)
}

watch(() => props.mode, () => {
  resetState({ keepPhone: true })
  if (props.mode === 'register') ensureAgreements()
})
onMounted(() => {
  if (props.mode === 'register') ensureAgreements()
})
onBeforeUnmount(stopCountdown)
</script>

<style scoped>
.account-panel { width: 100%; }
.account-form :deep(.el-form-item) { margin-bottom: 16px; }
.account-form :deep(.el-form-item__label) { font-size: 12px; color: var(--muted, #667); line-height: 1.6; margin-bottom: 6px; padding: 0; }
.code-row { display: flex; gap: 10px; width: 100%; }
.code-row .el-input { flex: 1; }
.code-button { flex: none; width: 116px; border: 1px solid var(--line, #d8dee3); border-radius: 5px; background: #f5f7f7; color: var(--brand, #1f6f5c); font-size: 12px; cursor: pointer; }
.code-button:disabled { color: #9aa5ab; cursor: not-allowed; }
.agreement-item :deep(.el-form-item__content) { flex-wrap: wrap; gap: 2px; line-height: 1.8; }
.agreement-links { display: inline-flex; flex-wrap: wrap; }
.agreement-link { color: var(--brand, #1f6f5c); text-decoration: none; font-size: 12px; }
.account-error { margin-top: 4px; }
.account-submit { width: 100%; margin-top: 6px; }
.account-switch { margin: 14px 0 0; font-size: 12px; color: var(--muted, #667); text-align: center; }
.switch-divider { margin: 0 6px; color: var(--line, #d8dee3); }
.switch-link { border: 0; background: none; padding: 0 2px; color: var(--brand, #1f6f5c); font-size: 12px; cursor: pointer; }
.switch-link:hover { text-decoration: underline; }
.account-result { padding: 4px 0 0; }
.result-title { margin: 0 0 10px; font-size: 16px; font-weight: 600; color: var(--ink, #1b2a32); }
.result-desc { margin: 0 0 20px; font-size: 13px; line-height: 1.9; color: var(--muted, #667); }
.result-back { width: 100%; }
</style>
