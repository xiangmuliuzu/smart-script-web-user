<template>
  <PortalLayer v-model="visible" title="账号" size="min(560px, 96vw)" :before-close="beforeClose"><PortalTabs v-model="tab" :items="tabs" drawer label="账号功能" /><div class="panel-content">
    <template v-if="tab === 'profile'"><LoadState :pending="pending" :error="loadError" :retry="load" /><template v-if="!pending && !loadError">
      <div class="sub-head"><h3>个人资料</h3></div><form class="panel attached" @submit.prevent="save"><div class="row profile-avatar-row"><el-avatar class="avatar profile-avatar" :size="48" :src="avatarUrl(profile.avatar)" alt="个人头像">{{ profile.nickname?.slice(0, 1) || '用' }}</el-avatar><label class="btn quiet sm upload-control"><input type="file" accept="image/png,image/jpeg" :disabled="busy" @change="uploadAvatar($event.target.files[0]); $event.target.value = ''" /><span>更换头像</span></label></div><label class="field">笔名 / 昵称<input v-model="profile.nickname" maxlength="30" required /></label><label class="field">擅长题材<input :value="specialties" readonly placeholder="未填写" /></label><label class="field">个人简介<input v-model="profile.bio" maxlength="500" /></label><p class="cost">擅长题材由创作者资料维护，此处展示已填写信息。</p><p v-if="error" class="note bad" role="alert">{{ error }}</p><button class="btn sm" :disabled="busy">{{ busy ? '处理中…' : '保存修改' }}</button></form>
      <div class="sub-head sub"><h3>实名认证</h3><span class="count">{{ realNameLabels[realName?.status] || '待确认' }}</span></div><div class="panel attached"><LoadState :pending="realNameLoading" :error="realNameError" :retry="loadRealName" /><template v-if="realName && !realNameError"><div class="note" :class="realName.status === 'APPROVED' ? 'good' : 'bad'">{{ realName.status === 'APPROVED' ? '实名认证已通过。' : realName.status === 'PENDING' ? '实名认证处理中，请耐心等待。' : realName.rejectReason || '未完成实名，无法申请版权、签署合同与提现。' }}</div><form v-if="['NOT_SUBMITTED', 'REJECTED'].includes(realName.status)" class="top-gap" @submit.prevent="verify"><label class="field">真实姓名<input v-model="identity.realName" autocomplete="off" maxlength="30" required /></label><label class="field">身份证号<input v-model="identity.idNumber" autocomplete="off" maxlength="18" required /></label><p v-if="identityError" class="note bad" role="alert">{{ identityError }}</p><button class="btn sm" :disabled="verifying">{{ verifying ? '提交中…' : '提交认证' }}</button></form></template></div>
      <div class="sub-head sub"><h3>账号安全</h3></div><ul class="rows"><li><span class="k">登录密码</span><span class="v muted">定期修改更安全</span><button class="btn quiet sm" @click="passwordVisible = true">修改</button></li><li><span class="k">绑定手机</span><span class="v muted">{{ profile.phoneMasked || '未绑定' }}</span><button class="btn quiet sm" @click="phoneVisible = true">换绑</button></li><li><span class="k">登录设备</span><span class="v muted">当前浏览器</span><button class="btn quiet sm" disabled>管理</button></li></ul>
    </template></template>
    <template v-else><div class="sub-head"><h3>提交反馈</h3></div><form class="panel attached" @submit.prevent="submitFeedback"><label class="field">反馈类型<select v-model="feedbackForm.category"><option value="BUG">功能异常</option><option value="EXPERIENCE">体验建议</option><option value="COMPLAINT">内容违规举报</option><option value="OTHER">其他</option></select></label><label class="field">描述你遇到的问题或建议<textarea v-model="feedbackForm.content" placeholder="写点什么…" maxlength="5000" required /></label><label class="field">相关截图（选填）<input type="file" accept="image/*" disabled /></label><p class="cost">截图上传暂未开放，可在描述中补充说明。</p><label class="field">联系方式（选填）<input v-model="feedbackForm.contact" placeholder="手机号或邮箱，便于我们回复你" maxlength="100" /></label><p v-if="feedbackError" class="note bad" role="alert">{{ feedbackError }}</p><button class="btn sm" :disabled="feedbackSending">{{ feedbackSending ? '提交中…' : '提交反馈' }}</button></form><div class="sub-head sub"><h3>处理须知</h3></div><div class="panel attached"><div class="note info">提交后 1–3 个工作日内处理，结果会通过站内消息通知你。</div><ul class="rows top-gap"><li><span class="k">版权、合同类问题</span><span class="v muted">请走「版权与收益」入口</span></li><li><span class="k">作品审核结果申诉</span><span class="v muted">请查看作品审核记录</span></li><li><span class="k">账号被盗</span><span class="v muted">请先修改密码并换绑手机</span></li></ul></div><div class="sub-head sub"><h3>我的反馈</h3><span class="count">{{ feedback.length }} 条</span></div><LoadState :pending="feedbackLoading" :error="feedbackLoadError" :retry="loadFeedback" :empty="!feedbackLoading && !feedbackLoadError && !feedback.length" /><ul v-if="!feedbackLoadError" class="rows"><li v-for="item in feedback" :key="item.feedbackId"><span class="k">{{ item.content }}</span><span class="v muted">{{ feedbackLabels[item.status] || item.status }} · {{ dateText(item.submittedAt || item.createTime).slice(5, 10) }}</span><button class="btn quiet sm" @click="selectedFeedback = item; feedbackDetailVisible = true">查看</button></li></ul></template>
  </div>
  <PortalLayer v-model="passwordVisible" title="修改登录密码" modal :before-close="closePassword"><form @submit.prevent="updatePassword"><label class="field">原密码<input v-model="password.oldPassword" type="password" autocomplete="current-password" minlength="8" maxlength="64" required /></label><label class="field">新密码<input v-model="password.newPassword" type="password" autocomplete="new-password" minlength="8" maxlength="64" required /></label><label class="field">确认新密码<input v-model="password.confirm" type="password" autocomplete="new-password" minlength="8" maxlength="64" required /></label><p class="cost">密码长度 8–64 位，修改后需要重新登录。</p><p v-if="passwordError" class="note bad" role="alert">{{ passwordError }}</p><button class="btn" :disabled="passwordSaving">{{ passwordSaving ? '保存中…' : '确认修改' }}</button></form></PortalLayer>
  <PhoneChange v-if="phoneVisible" v-model="phoneVisible" :phone="profile.phoneMasked" @saved="load" />
  <PortalLayer v-model="feedbackDetailVisible" title="反馈详情" modal><p>{{ selectedFeedback?.content }}</p><p class="cost">{{ feedbackLabels[selectedFeedback?.status] || selectedFeedback?.status }}</p><div class="note info">{{ selectedFeedback?.reply || '暂无平台回复，处理结果会通过站内消息通知你。' }}</div></PortalLayer>
  </PortalLayer>
</template>
<script setup>
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { usePortal } from '../../utils/portal.js'
import { validateFile, dateText } from '../../utils/creator.js'
import { avatarUrl } from '../../utils/avatarUrl.js'
import { clearSession } from '../../auth.js'
import PortalLayer from '../../components/PortalLayer.vue'
import PortalTabs from '../../components/PortalTabs.vue'
import LoadState from '../../components/LoadState.vue'
import PhoneChange from './PhoneChange.vue'
const props = defineProps({ modelValue: Boolean, initialTab: String })
const emit = defineEmits(['update:modelValue'])
const { api, user, handleError } = usePortal()
const router = useRouter()
const visible = computed({ get: () => props.modelValue, set: value => emit('update:modelValue', value) })
const tab = ref(props.initialTab || 'profile')
const tabs = [{ value: 'profile', label: '个人资料' }, { value: 'feedback', label: '意见反馈' }]
const profile = reactive({ nickname: '', bio: '', avatar: '', phoneMasked: '', creatorProfile: null })
const originalProfile = ref('')
const specialties = computed(() => profile.creatorProfile?.specialties?.map(s => s.name || s.label || s.specialtyName).filter(Boolean).join(' · ') || '')
const pending = ref(false)
const loadError = ref('')
const busy = ref(false)
const error = ref('')
const realName = ref(null)
const realNameLoading = ref(false)
const realNameError = ref('')
const realNameLabels = { NOT_SUBMITTED: '未完成', PENDING: '审核中', APPROVED: '已认证', REJECTED: '需重新提交' }
const identity = reactive({ realName: '', idNumber: '' })
const identityError = ref('')
const verifying = ref(false)
const passwordVisible = ref(false)
const password = reactive({ oldPassword: '', newPassword: '', confirm: '' })
const passwordError = ref('')
const passwordSaving = ref(false)
const phoneVisible = ref(false)
const feedbackForm = reactive({ category: 'BUG', content: '', contact: '' })
const feedback = ref([])
const feedbackLoading = ref(false)
const feedbackLoadError = ref('')
const feedbackError = ref('')
const feedbackSending = ref(false)
const feedbackLabels = { PENDING: '待处理', PROCESSING: '处理中', RESOLVED: '已解决', CLOSED: '已关闭' }
const selectedFeedback = ref(null)
const feedbackDetailVisible = ref(false)
async function load() {
  pending.value = true; loadError.value = ''
  try { Object.assign(profile, await api.value.getProfile()); originalProfile.value = JSON.stringify(profile) }
  catch (failure) { loadError.value = failure.message; await handleError(failure) }
  finally { pending.value = false }
}
async function loadRealName() { realNameLoading.value = true; realNameError.value = ''; try { realName.value = await api.value.getRealName() } catch (failure) { realNameError.value = failure.message; await handleError(failure) } finally { realNameLoading.value = false } }
async function beforeClose(done) {
  if (busy.value || verifying.value || feedbackSending.value) return
  if ((originalProfile.value && JSON.stringify(profile) !== originalProfile.value) || feedbackForm.content.trim() || identity.realName || identity.idNumber) { try { await ElMessageBox.confirm('还有未保存的资料或表单，确定离开？', '未保存的内容', { confirmButtonText: '离开', cancelButtonText: '继续编辑' }) } catch { return } }
  identity.realName = ''; identity.idNumber = ''; done()
}
async function uploadAvatar(file) {
  if (!file || busy.value) return
  error.value = validateFile(file, ['png', 'jpg', 'jpeg'], 5)
  if (error.value) return
  busy.value = true
  try { const result = await api.value.upload(file, 'avatar'); if (!result.url) throw new Error('头像上传响应缺少图片地址，请重试'); profile.avatar = result.url }
  catch (failure) { error.value = failure.message; await handleError(failure) }
  finally { busy.value = false }
}
async function save() {
  if (busy.value) return
  error.value = ''
  if (!profile.nickname.trim()) { error.value = '请输入笔名 / 昵称'; return }
  busy.value = true
  try { const result = await api.value.saveProfile(profile); Object.assign(profile, result); Object.assign(user.value, { nickname: profile.nickname, avatar: profile.avatar }); originalProfile.value = JSON.stringify(profile); ElMessage.success('个人资料已保存') }
  catch (failure) { error.value = failure.message; await handleError(failure) }
  finally { busy.value = false }
}
async function verify() {
  if (verifying.value) return
  identityError.value = ''
  if (!identity.realName.trim() || !/^\d{17}[\dXx]$/.test(identity.idNumber)) { identityError.value = '请填写真实姓名和有效的 18 位身份证号'; return }
  verifying.value = true
  try { realName.value = await api.value.submitRealName(identity, realName.value.status === 'REJECTED'); identity.realName = ''; identity.idNumber = ''; ElMessage.success('实名申请已提交') }
  catch (failure) { identityError.value = failure.message; await handleError(failure) }
  finally { verifying.value = false }
}
function closePassword(done) { if (passwordSaving.value) return; Object.assign(password, { oldPassword: '', newPassword: '', confirm: '' }); passwordError.value = ''; done() }
async function updatePassword() {
  if (passwordSaving.value) return
  passwordError.value = ''
  if (password.newPassword.length < 8 || password.newPassword.length > 64 || password.newPassword !== password.confirm) { passwordError.value = '新密码需为 8–64 位，且两次输入一致'; return }
  passwordSaving.value = true
  try { await api.value.changePassword({ oldPassword: password.oldPassword, newPassword: password.newPassword }); Object.assign(password, { oldPassword: '', newPassword: '', confirm: '' }); passwordVisible.value = false; ElMessage.success('密码已修改，请重新登录'); clearSession(); await router.replace('/login') }
  catch (failure) { passwordError.value = failure.message; await handleError(failure) }
  finally { passwordSaving.value = false }
}
async function loadFeedback() { feedbackLoading.value = true; feedbackLoadError.value = ''; try { feedback.value = await api.value.listFeedback() } catch (failure) { feedbackLoadError.value = failure.message; await handleError(failure) } finally { feedbackLoading.value = false } }
async function submitFeedback() {
  if (feedbackSending.value) return
  feedbackError.value = ''
  if (!feedbackForm.content.trim()) { feedbackError.value = '请填写反馈内容'; return }
  feedbackSending.value = true
  try { await api.value.sendFeedback({ category: feedbackForm.category, content: feedbackForm.content.trim() + (feedbackForm.contact.trim() ? '\n联系方式：' + feedbackForm.contact.trim() : '') }); feedbackForm.content = ''; feedbackForm.contact = ''; ElMessage.success('反馈已提交'); await loadFeedback() }
  catch (failure) { feedbackError.value = failure.message; await handleError(failure) }
  finally { feedbackSending.value = false }
}
watch(tab, value => { if (value === 'feedback') loadFeedback() })
watch(() => props.initialTab, value => { if (value) tab.value = value })
onMounted(() => { load(); loadRealName(); if (tab.value === 'feedback') loadFeedback() })
onUnmounted(() => { identity.realName = ''; identity.idNumber = ''; Object.assign(password, { oldPassword: '', newPassword: '', confirm: '' }) })
</script>
