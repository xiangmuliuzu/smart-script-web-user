<template>
  <div class="demand-page">
    <DemandTabs />
    <p class="note">这里是你已付押金接下的任务。每轮交付后由发布者验收，验收通过即放出该轮款项并进入你的待结算余额。</p>
    <form class="filters" @submit.prevent="applyFilters">
      <label class="field">状态
        <select v-model="filters.status">
          <option value="">全部状态</option>
          <option v-for="option in demandStatusOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
        </select>
      </label>
      <label class="field">搜索<input v-model="filters.keyword" type="search" placeholder="标题或任务编号"></label>
      <label class="field">排序
        <select v-model="filters.sort">
          <option v-for="option in SORT_OPTIONS" :key="option.value" :value="option.value">{{ option.label }}</option>
        </select>
      </label>
      <button class="btn" type="submit">筛选</button>
      <button class="btn quiet" type="button" @click="resetFilters">清空</button>
    </form>

    <LoadState :pending="pending" :error="error" :retry="load" />
    <p v-if="!pending && !error && !list.length" class="load-state">还没有接下的任务，去<a class="link" @click="$router.push('/demand')">任务广场</a>看看</p>
    <DemandCard v-for="item in list" :key="item.demandId" :demand="item" mode="mine" @open="goDemandDetail">
      <button class="btn sm" @click.stop="goDemandDetail(item.demandId)">去交付</button>
      <button class="btn sm ghost" @click.stop="openChat(item)">联系发布方</button>
    </DemandCard>
    <div v-if="total > PAGE_SIZE" class="pager">
      <button class="btn sm ghost" :disabled="pageNum <= 1" @click="turn(-1)">上一页</button>
      <span class="pager-text">第 {{ pageNum }} / {{ pageCount }} 页 · 共 {{ total }} 条</span>
      <button class="btn sm ghost" :disabled="pageNum >= pageCount" @click="turn(1)">下一页</button>
    </div>
  </div>
</template>
<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { usePortal } from '../../utils/portal.js'
import LoadState from '../../components/LoadState.vue'
import DemandTabs from '../../components/demand/DemandTabs.vue'
import DemandCard from '../../components/demand/DemandCard.vue'
import { demandStatusOptions, SORT_OPTIONS } from '../../utils/demand.js'
const { api, openPanel, goDemandDetail, handleError } = usePortal()
const PAGE_SIZE = 10
const list = ref([])
const total = ref(0)
const pageNum = ref(1)
const pending = ref(false)
const error = ref('')
const filters = reactive({ status: '', keyword: '', sort: 'created:desc' })
const pageCount = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)))
async function load() {
  pending.value = true; error.value = ''
  const [sortBy, order] = String(filters.sort).split(':')
  try {
    // mine=claimed 走「我接取的」分支，后端此分支才真正接受 status 过滤（广场分支会忽略它）
    const result = await api.value.listDemands({
      mine: 'claimed',
      status: filters.status || undefined,
      keyword: filters.keyword?.trim() || undefined,
      sortBy, order,
      pageNum: pageNum.value, pageSize: PAGE_SIZE,
    })
    list.value = result.list; total.value = result.total
  } catch (failure) { error.value = failure.message || '任务加载失败'; await handleError(failure) }
  finally { pending.value = false }
}
function applyFilters() { pageNum.value = 1; load() }
function resetFilters() { Object.assign(filters, { status: '', keyword: '', sort: 'created:desc' }); applyFilters() }
function turn(offset) {
  const next = pageNum.value + offset
  if (next < 1 || next > pageCount.value) return
  pageNum.value = next; load()
}
async function openChat(demand) {
  try {
    await api.value.demandChatSession(demand.demandId)
    openPanel('cooperation', 'session')
  } catch (failure) { await handleError(failure); if (failure?.code === 403) ElMessage.warning('请先开通创作者资格再沟通') }
}
onMounted(load)
</script>
<style scoped>
.demand-page { padding: 0 0 30px }
.pager { display: flex; align-items: center; justify-content: center; gap: 14px; margin-top: 16px }
.pager-text { font-size: 12.5px; color: var(--ink-3); font-variant-numeric: tabular-nums }
.link { color: var(--indigo); cursor: pointer }
</style>
