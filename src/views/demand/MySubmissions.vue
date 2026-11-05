<template>
  <div class="demand-page">
    <DemandTabs />
    <p class="note">投稿是「等发布者选标」：被选中的任务会生成询盘并关闭征集，后续在「我的合作 - 询盘 / 订单 / 合同」里成交；未中标的投稿会一并被回绝。</p>
    <div class="sub-filter">
      <select v-model="statusFilter" class="field-select">
        <option value="">全部投稿状态</option>
        <option value="submitted">已投稿</option>
        <option value="shortlisted">入围</option>
        <option value="accepted">已选用</option>
        <option value="rejected">未选用</option>
      </select>
      <button class="btn quiet sm" @click="load">刷新</button>
    </div>

    <LoadState :pending="pending" :error="error" :retry="load" />
    <p v-if="!pending && !error && !filtered.length" class="load-state">还没有投稿记录，去<a class="link" @click="$router.push('/demand')">任务广场</a>响应需求</p>
    <article v-for="item in filtered" :key="item.submissionId" class="sub-card">
      <div class="sub-head">
        <b>《{{ item.workTitle || ('作品#' + item.workId) }}》</b>
        <span class="sub-status" :data-tone="tone(item.status)">{{ submissionStatusLabel(item.status) }}</span>
      </div>
      <p class="cost">任务：{{ demandTitles[item.demandId] || ('任务#' + item.demandId) }} · 投稿于 {{ timeText(item.createdAt) }}</p>
      <p v-if="item.submitMessage" class="sub-msg">{{ item.submitMessage }}</p>
      <p v-if="item.reviewRemark" class="cost">发布者意见：{{ item.reviewRemark }}</p>
      <p v-if="item.reviewedAt" class="cost">处理时间：{{ timeText(item.reviewedAt) }}</p>
      <div class="sub-foot">
        <button class="btn sm ghost" @click="goDemandDetail(item.demandId)">查看任务</button>
        <button v-if="item.status === 'accepted'" class="btn sm" @click="openPanel('cooperation', 'inquiry')">查看询盘 →</button>
      </div>
    </article>
  </div>
</template>
<script setup>
import { computed, onMounted, ref } from 'vue'
import { usePortal } from '../../utils/portal.js'
import LoadState from '../../components/LoadState.vue'
import DemandTabs from '../../components/demand/DemandTabs.vue'
import { submissionStatusLabel, timeText } from '../../utils/demand.js'
const { api, openPanel, goDemandDetail, handleError } = usePortal()
const list = ref([])
const pending = ref(false)
const error = ref('')
const statusFilter = ref('')
// 后端 my-submissions 不带任务标题，按去重后的 demandId 补拉详情，条数与投稿数同量级
const demandTitles = ref({})
const filtered = computed(() => statusFilter.value ? list.value.filter(item => item.status === statusFilter.value) : list.value)
const tone = status => ({ submitted: 'info', shortlisted: 'warn', accepted: 'ok', rejected: 'off' }[status] || 'off')
async function load() {
  pending.value = true; error.value = ''
  try {
    list.value = await api.value.mySubmissions() || []
    const ids = [...new Set(list.value.map(item => item.demandId).filter(Boolean))]
    const settled = await Promise.allSettled(ids.map(id => api.value.getDemand(id)))
    const map = {}
    settled.forEach((result, index) => { if (result.status === 'fulfilled' && result.value?.title) map[ids[index]] = result.value.title })
    demandTitles.value = map
  } catch (failure) { error.value = failure.message || '投稿记录加载失败'; await handleError(failure) }
  finally { pending.value = false }
}
onMounted(load)
</script>
<style scoped>
.demand-page { padding: 4px 0 24px }
.sub-filter { display: flex; gap: 10px; align-items: center; margin-bottom: 12px }
.field-select { padding: 6px 10px; border: 1px solid var(--rule-2, #dcdfe6); border-radius: 5px; font-size: 13px; background: #fff }
.sub-card { border: 1px solid var(--rule, #ebeef5); border-radius: 6px; padding: 12px 14px; margin-bottom: 10px; background: #fff }
.sub-head { display: flex; align-items: center; gap: 10px }
.sub-head b { font-size: 14.5px }
.sub-status { padding: 1px 9px; border-radius: 10px; font-size: 12px; background: #f4f4f5; color: #909399 }
.sub-status[data-tone="info"] { background: #ecf5ff; color: #409eff }
.sub-status[data-tone="warn"] { background: #fdf6ec; color: #e6a23c }
.sub-status[data-tone="ok"] { background: #f0f9eb; color: #67c23a }
.sub-card .cost { margin: 6px 0 0; font-size: 12px; color: var(--ink-3, #909399) }
.sub-msg { margin: 8px 0 0; font-size: 13px; color: var(--ink-2, #606266); white-space: pre-wrap }
.sub-foot { display: flex; gap: 8px; margin-top: 10px }
.link { color: var(--indigo, #409eff); cursor: pointer }
</style>
