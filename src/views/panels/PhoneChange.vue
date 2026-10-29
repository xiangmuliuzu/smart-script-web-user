<template>
  <PortalLayer v-model="visible" title="换绑手机" modal :before-close="beforeClose"><div class="note info">{{ step === 1 ? '先通过已绑定手机号或邮箱验证身份，再绑定新号码。' : '身份已验证，请填写新手机号与验证码。' }}</div><form class="top-gap" @submit.prevent="confirm">
    <label v-if="step === 1" class="field">当前账号<input :value="'验证码将发送至绑定邮箱或手机号'" readonly /></label><label v-else class="field">新手机号<input v-model="newPhone" inputmode="tel" maxlength="11" pattern="1[3-9][0-9]{9}" required :disabled="busy" /></label>
    <label class="field">验证码<div class="captcha-row"><input v-model="code" inputmode="numeric" maxlength="6" pattern="[0-9]{6}" required :disabled="busy" /><button type="button" class="btn ghost" :disabled="busy || countdown > 0" @click="sendCode">{{ countdown > 0 ? countdown + ' 秒后重试' : '获取验证码' }}</button></div></label><p v-if="error" class="note bad" role="alert">{{ error }}</p><button class="btn" :disabled="busy">{{ busy ? '处理中…' : step === 1 ? '验证并继续' : '确认换绑' }}</button>
  </form></PortalLayer>
</template>
<script setup>
import { computed, onUnmounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { usePortal } from '../../utils/portal.js'
const props = defineProps({ modelValue: Boolean, phone: String })
const emit = defineEmits(['update:modelValue', 'saved'])
const { api, handleError } = usePortal()
const visible = computed({ get: () => props.modelValue, set: value => emit('update:modelValue', value) })
const step = ref(1)
const code = ref('')
const newPhone = ref('')
const token = ref('')
const busy = ref(false)
const error = ref('')
const countdown = ref(0)
const deviceId = crypto.randomUUID()
let timer
function beforeClose(done) { if (busy.value) return; code.value = ''; token.value = ''; newPhone.value = ''; done() }
function startCountdown() { clearInterval(timer); countdown.value = 60; timer = setInterval(() => { countdown.value--; if (!countdown.value) clearInterval(timer) }, 1000) }
async function sendCode() {
  if (busy.value || countdown.value > 0) return
  if (step.value === 2 && !/^1[3-9]\d{9}$/.test(newPhone.value)) { error.value = '请输入有效的新手机号'; return }
  busy.value = true; error.value = ''
  try { await api.value.phoneChange(step.value === 1 ? 'old/send' : 'new/send', step.value === 1 ? undefined : { newPhone: newPhone.value, deviceId }); startCountdown(); ElMessage.success('验证码已发送') }
  catch (failure) { error.value = failure.message; await handleError(failure) }
  finally { busy.value = false }
}
async function confirm() {
  if (busy.value) return
  if (!/^\d{6}$/.test(code.value)) { error.value = '请输入有效的六位验证码'; return }
  busy.value = true; error.value = ''
  try {
    if (step.value === 1) { const result = await api.value.phoneChange('old/verify', { code: code.value, deviceId }); if (!result.stepUpToken) throw new Error('验证响应缺少凭证，请重试'); token.value = result.stepUpToken; step.value = 2; code.value = ''; countdown.value = 0; clearInterval(timer) }
    else { if (!/^1[3-9]\d{9}$/.test(newPhone.value)) throw new Error('请输入有效的新手机号'); await api.value.phoneChange('confirm', { newPhone: newPhone.value, code: code.value, stepUpToken: token.value, deviceId }); ElMessage.success('手机已换绑'); token.value = ''; code.value = ''; visible.value = false; emit('saved') }
  } catch (failure) { error.value = failure.message; await handleError(failure) }
  finally { busy.value = false }
}
onUnmounted(() => { clearInterval(timer); token.value = ''; code.value = '' })
</script>
