<template>
  <div class="creator-portal">
    <LoadState v-if="pending || error" :pending="pending" :error="error" :retry="load" />
    <template v-else-if="user && api">
      <header class="topbar">
        <button class="brand" @click="goWorks"><b>剧云策</b><span>创作者中心</span></button>
        <nav class="nav" aria-label="主导航"><button aria-current="page" @click="goWorks">工作台</button></nav>
        <div class="topbar-right">
          <button v-if="realNameStatus && realNameStatus !== 'APPROVED'" class="chip verify-chip" @click="openPanel('account', 'profile')">⚠ 实名认证{{ realNameStatus === 'PENDING' ? '审核中' : '未完成' }}</button>
          <button class="nav-icon" aria-label="我的合作" @click="openPanel('cooperation', 'inquiry')"><span class="ico"><el-icon><HandshakeIcon /></el-icon></span><span class="lbl">我的合作</span></button>
          <button class="nav-icon" aria-label="版权与收益" @click="openPanel('rights', 'apply')"><span class="ico"><el-icon><Collection /></el-icon></span><span class="lbl">版权与收益</span></button>
          <button class="nav-icon" aria-label="消息" @click="openPanel('messages')"><span class="ico"><el-icon><Bell /></el-icon><span v-if="unread" class="badge">{{ unread > 99 ? '99+' : unread }}</span></span><span class="lbl">消息</span></button>
          <button class="nav-icon" aria-label="平台客服" @click="openPanel('chat')"><span class="ico"><el-icon><ChatDotRound /></el-icon><span v-if="chatUnread" class="badge">{{ chatUnread > 99 ? '99+' : chatUnread }}</span></span><span class="lbl">平台客服</span></button>
          <el-dropdown trigger="click" @command="accountCommand">
            <button class="avatar-btn" aria-label="账号菜单"><el-avatar class="avatar" :size="28" :src="avatarUrl(user.avatar)" :alt="displayName + '的头像'">{{ displayName.slice(0, 1) }}</el-avatar><em>{{ displayName }}</em><el-icon><ArrowDown /></el-icon></button>
            <template #dropdown><el-dropdown-menu class="portal-menu"><div class="who"><b>{{ displayName }}</b><span>{{ user.userName || '平台用户' }}</span></div><el-dropdown-item command="profile">个人资料</el-dropdown-item><el-dropdown-item command="feedback">意见反馈</el-dropdown-item><el-dropdown-item command="logout" divided :disabled="leaving">退出登录</el-dropdown-item></el-dropdown-menu></template>
          </el-dropdown>
        </div>
      </header>
      <main class="portal-main" :class="{ 'portal-main-editor': route.path.endsWith('/create') }"><router-view :key="route.path" /></main>
      <MessagesPanel v-if="panel === 'messages'" v-model="panelVisible" />
      <PlatformChatPanel v-if="panel === 'chat'" v-model="panelVisible" />
      <CooperationPanel v-if="panel === 'cooperation'" v-model="panelVisible" :initial-tab="panelTab" />
      <RightsPanel v-if="panel === 'rights'" v-model="panelVisible" :initial-tab="panelTab" />
      <AccountPanel v-if="panel === 'account'" v-model="panelVisible" :initial-tab="panelTab" />
    </template>
  </div>
</template>
<script setup>
import { computed, onMounted, provide, ref, shallowRef } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Bell, ChatDotRound, Collection, Suitcase as HandshakeIcon, ArrowDown } from '@element-plus/icons-vue'
import { getInfo, isAuthFailure, logout } from '../auth.js'
import { portalKey } from '../utils/portal.js'
import { avatarUrl } from '../utils/avatarUrl.js'
import LoadState from '../components/LoadState.vue'
import MessagesPanel from '../views/panels/Messages.vue'
import PlatformChatPanel from '../views/panels/PlatformChat.vue'
import CooperationPanel from '../views/panels/Cooperation.vue'
import RightsPanel from '../views/panels/Rights.vue'
import AccountPanel from '../views/panels/Account.vue'
const router = useRouter()
const route = useRoute()
const api = shallowRef(null)
const user = ref(null)
const pending = ref(true)
const error = ref('')
const leaving = ref(false)
const unread = ref(0)
const chatUnread = ref(0)
const realNameStatus = ref('')
const panel = ref('')
const panelTab = ref('')
const panelVisible = ref(false)
const displayName = computed(() => user.value?.nickname || user.value?.userName || '用户')
const canCreate = computed(() => user.value?.authorCapability === true)
const basePath = '/works'
function openPanel(name, tab) { panelVisible.value = false; panel.value = name; panelTab.value = tab; panelVisible.value = true }
function goWorks() { panelVisible.value = false; return router.push(basePath) }
function goWork(id) { panelVisible.value = false; return router.push(`${basePath}/${id}`) }
async function handleError(failure) {
  if (isAuthFailure(failure)) { await router.replace({ path: '/login', query: { redirect: route.fullPath, ...(failure.reason === 'creator-required' ? { reason: 'creator-required' } : {}) } }); return }
  ElMessage.error(failure.message || '网络暂时不可用，请重试')
}
async function refreshUnread() {
  try { unread.value = Number(await api.value.unreadCount()) || 0 }
  catch (failure) { if (isAuthFailure(failure)) await handleError(failure) }
  try { chatUnread.value = Number(await api.value.chatUnreadCount()) || 0 }
  catch (failure) { if (isAuthFailure(failure)) await handleError(failure) }
}
async function load() {
  pending.value = true; error.value = ''; user.value = null
  try {
    const info = await getInfo(); user.value = info.user; api.value = await import('../api/creator.js')
    pending.value = false
    await Promise.allSettled([refreshUnread(), refreshRealName()])
  } catch (failure) { if (isAuthFailure(failure)) await handleError(failure); else error.value = failure.message || '暂时无法确认登录状态' }
  finally { pending.value = false }
}
async function accountCommand(command) {
  if (command !== 'logout') { openPanel('account', command); return }
  if (leaving.value) return
  leaving.value = true
  try { await logout() }
  catch { ElMessage.warning('服务端退出未成功，已清理本地登录状态') }
  finally { user.value = null; panelVisible.value = false; await router.replace('/login'); leaving.value = false }
}
provide(portalKey, { api, user, canCreate, basePath, openPanel, goWork, goWorks, handleError, refreshUnread })
async function refreshRealName() { try { realNameStatus.value = (await api.value.getRealName())?.status || '' } catch (failure) { if (isAuthFailure(failure)) await handleError(failure) } }
onMounted(load)
</script>
