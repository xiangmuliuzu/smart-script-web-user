<template>
  <PortalLayer v-model="visible" title="删除作品" modal :before-close="beforeClose">
    <form @submit.prevent="confirm">
      <p>确定删除《{{ work.title || '未命名作品' }}》吗？</p>
      <p class="note bad">删除后作品将下架，并从我的作品中移除，无法自行恢复。有关联订单、合同或付费记录的作品不能删除，请使用下架功能。</p>
      <p class="cost">{{ phoneMasked ? '验证码已发送至 ' + phoneMasked : '请获取绑定手机号或邮箱的验证码，验证身份后删除。' }}</p>
      <label class="field">验证码
        <div class="captcha-row">
          <input v-model="code" inputmode="numeric" autocomplete="one-time-code" maxlength="8" pattern="[0-9]{4,8}" required :disabled="busy" />
          <button type="button" class="btn quiet" :disabled="busy || countdown > 0" @click="sendCode">{{ countdown > 0 ? countdown + ' 秒后重发' : sending ? '发送中…' : '获取验证码' }}</button>
        </div>
      </label>
      <p v-if="error" class="note bad" role="alert">{{ error }}</p>
      <div class="row section-actions">
        <button type="button" class="btn quiet" :disabled="busy" @click="visible = false">取消</button>
        <button class="btn" :disabled="busy">{{ deleting ? '删除中…' : '验证并删除' }}</button>
      </div>
    </form>
  </PortalLayer>
</template>
<script setup>
import { computed, onBeforeUnmount, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { usePortal } from '../../utils/portal.js'
import PortalLayer from '../../components/PortalLayer.vue'

const props = defineProps({ modelValue: Boolean, work: Object })
const emit = defineEmits(['update:modelValue', 'deleted'])
const { api, handleError } = usePortal()
const visible = computed({ get: () => props.modelValue, set: value => emit('update:modelValue', value) })
const code = ref('')
const phoneMasked = ref('')
const error = ref('')
const sending = ref(false)
const deleting = ref(false)
const countdown = ref(0)
const busy = computed(() => sending.value || deleting.value)
let timer
const codeErrors = { 40001: '验证码错误', 40002: '验证码已失效，请重新获取', 40901: '验证码已使用，请重新获取' }

function beforeClose(done) { if (!busy.value) done() }
async function sendCode() {
  if (busy.value || countdown.value > 0) return
  sending.value = true
  error.value = ''
  try {
    const result = await api.value.sendWorkDeletionCode(props.work.workId)
    if (result?.sent !== true) throw new Error('验证码发送失败，请稍后重试')
    phoneMasked.value = result.phoneMasked
    countdown.value = Number(result.cooldownSeconds) || 60
    clearInterval(timer)
    timer = setInterval(() => { if (--countdown.value <= 0) clearInterval(timer) }, 1000)
  } catch (failure) { error.value = failure.message; await handleError(failure) }
  finally { sending.value = false }
}
async function confirm() {
  if (busy.value) return
  if (!/^\d{4,8}$/.test(code.value.trim())) { error.value = '请输入正确格式的验证码'; return }
  deleting.value = true
  error.value = ''
  try {
    await api.value.deleteWork(props.work.workId, code.value.trim())
    ElMessage.success('作品已删除')
    visible.value = false
    emit('deleted')
  } catch (failure) { error.value = codeErrors[failure.code] || failure.message; await handleError(failure) }
  finally { deleting.value = false }
}
onBeforeUnmount(() => clearInterval(timer))
</script>
