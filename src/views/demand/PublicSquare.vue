<template>
  <div class="creator-portal guest-portal">
    <header class="topbar">
      <button class="brand" aria-label="剧云策工作台" @click="requireLogin('/works')"><b>剧云策</b><span>创作者中心</span></button>
      <nav class="nav" aria-label="主导航">
        <button @click="router.push('/')">首页</button>
        <button @click="requireLogin('/works', '创作者工作台')">工作台</button>
        <button aria-current="page" @click="router.push('/demand')">任务广场</button>
      </nav>
      <div class="topbar-right">
        <button class="topbar-login" @click="goLogin">请登录</button>
      </div>
    </header>
    <main class="portal-main"><Square /></main>
  </div>
</template>
<script setup>
import { shallowRef, provide } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { request, isAuthFailure } from '../../auth.js'
import { asList } from '../../utils/creator.js'
import { portalKey } from '../../utils/portal.js'
import Square from './Square.vue'

const router = useRouter()
const api = shallowRef({ listDemands, demandStats })

function requireLogin(redirect = '/works', feature = '该功能') {
  return ElMessageBox.confirm(`${feature}需要登录后使用，是否前往登录？`, '请先登录', {
    confirmButtonText:'去登录', cancelButtonText:'稍后再说', type:'info', closeOnClickModal:false
  }).then(() => router.push({ path:'/login', query:{ redirect } })).catch(() => {})
}
function goLogin() {
  return router.push({ path:'/login', query:{ redirect:'/works' } })
}

async function listDemands({ status, genreId, keyword, mine, sortBy, order, budgetMin, budgetMax, episodesMin, pageNum = 1, pageSize = 20 } = {}) {
  const params = { status, genreId, keyword, mine, sortBy, order, budgetMin, budgetMax, episodesMin, pageNum, pageSize }
  const query = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, value]) => value != null && value !== '')))
  const response = await request('/api/v1/trade/demand/list?' + query, { authenticated:false })
  const data = response?.data ?? response
  return { total:Number(data?.total || 0), list:asList(data) }
}

async function demandStats() {
  const response = await request('/api/v1/trade/demand/stats', { authenticated:false })
  return response?.data ?? response ?? {}
}

function goDemandDetail(id) {
  return requireLogin('/demand/' + encodeURIComponent(id), '查看任务详情或接单')
}

async function handleError(failure) {
  if (isAuthFailure(failure)) {
    await router.push({ path:'/login', query:{ redirect:'/demand' } })
    return
  }
  ElMessage.error(failure?.message || '任务加载失败，请稍后重试')
}

provide(portalKey, { api, goDemandDetail, handleError })
</script>
<style scoped>
.guest-portal .topbar{width:100%}
.guest-portal .topbar-login{padding:6px 14px;border:1px solid var(--rule-2);border-radius:var(--radius);background:transparent;color:var(--indigo);font-size:13px;transition:background .15s,color .15s}
.guest-portal .topbar-login:hover{background:var(--indigo-wash);color:var(--ink)}
</style>
