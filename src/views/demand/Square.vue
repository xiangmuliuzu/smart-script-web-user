<template>
  <div class="demand-page">
    <DemandTabs />
    <div class="hero">
      <div class="hero-item"><b>{{ stats.availableCount ?? '-' }}</b><span>可接单任务</span></div>
      <div class="hero-item"><b>{{ prizePoolText }}</b><span>在途奖池</span></div>
      <div class="hero-item"><b>{{ stats.todayNewCount ?? '-' }}</b><span>今日新发布</span></div>
    </div>
    <p class="note">任务广场只展示「征集中且发布者已完成托管付款」的任务，接了就能拿钱；你已接的单在「我的任务」里看。</p>

    <div class="chips">
      <button type="button" class="chip-genre" :data-on="!filters.genreId" @click="pickGenre(null)">全部题材<em>{{ stats.availableCount ?? 0 }}</em></button>
      <button v-for="option in genreOptions" :key="option.value" type="button" class="chip-genre" :data-on="Number(filters.genreId) === option.value" @click="pickGenre(option.value)">
        {{ option.label }}<em>{{ genreCounts[option.value] || 0 }}</em>
      </button>
    </div>

    <form class="filters" @submit.prevent="applyFilters">
      <label class="field">搜索<input v-model="filters.keyword" type="search" placeholder="标题或任务编号"></label>
      <label class="field">预算下限（元）<input v-model.number="filters.budgetMinYuan" type="number" min="0" placeholder="0"></label>
      <label class="field">预算上限（元）<input v-model.number="filters.budgetMaxYuan" type="number" min="0" placeholder="不限"></label>
      <label class="field">最少集数<input v-model.number="filters.episodesMin" type="number" min="0" placeholder="不限"></label>
      <label class="field">排序
        <select v-model="filters.sort">
          <option v-for="option in SORT_OPTIONS" :key="option.value" :value="option.value">{{ option.label }}</option>
        </select>
      </label>
      <button class="btn" type="submit">筛选</button>
      <button class="btn quiet" type="button" @click="resetFilters">清空</button>
    </form>

    <LoadState :pending="pending" :error="error" :retry="load" />
    <p v-if="!pending && !error && !list.length" class="load-state">当前条件下暂无可接单任务</p>
    <DemandCard v-for="item in list" :key="item.demandId" :demand="item" mode="square" @open="goDemandDetail">
      <button class="btn sm" @click.stop="openSubmit(item)">投稿</button>
      <button class="btn sm ghost" @click.stop="goDemandDetail(item.demandId)">接单</button>
    </DemandCard>
    <div v-if="total > PAGE_SIZE" class="pager">
      <button class="btn sm ghost" :disabled="pageNum <= 1" @click="turn(-1)">上一页</button>
      <span class="cost">第 {{ pageNum }} / {{ pageCount }} 页 · 共 {{ total }} 条</span>
      <button class="btn sm ghost" :disabled="pageNum >= pageCount" @click="turn(1)">下一页</button>
    </div>

    <PortalLayer v-model="submitVisible" :title="'投稿 - ' + (submitTarget?.title || '')" modal>
      <div class="dialog-body">
        <label class="field">投稿作品
          <select v-model.number="submitForm.workId">
            <option :value="null">选择您的作品</option>
            <option v-for="work in works" :key="work.workId" :value="Number(work.workId)">{{ work.title || ('作品#' + work.workId) }}</option>
          </select>
        </label>
        <label class="field">附言（可选）<textarea v-model="submitForm.message" rows="4" placeholder="介绍您的作品与该需求的适配度…"></textarea></label>
        <p class="cost">投稿是「等发布者选标」，走询盘与订单成交；若想立刻拿下这一单，请在详情页「付押金接单」，走逐轮验收与放款。两者互斥，选标后征集即关闭。</p>
        <div class="dialog-foot"><button class="btn" :disabled="busy" @click="doSubmit">{{ busy ? '提交中…' : '确认投稿' }}</button></div>
      </div>
    </PortalLayer>
  </div>
</template>
<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { usePortal } from '../../utils/portal.js'
import LoadState from '../../components/LoadState.vue'
import PortalLayer from '../../components/PortalLayer.vue'
import DemandTabs from '../../components/demand/DemandTabs.vue'
import DemandCard from '../../components/demand/DemandCard.vue'
import { money, genreOptions, SORT_OPTIONS } from '../../utils/demand.js'
const { api, goDemandDetail, handleError } = usePortal()
const PAGE_SIZE = 10
const list = ref([])
const total = ref(0)
const pageNum = ref(1)
const pending = ref(false)
const error = ref('')
const stats = ref({})
const busy = ref(false)
const submitVisible = ref(false)
const submitTarget = ref(null)
const submitForm = reactive({ workId: null, message: '' })
const works = ref([])
const filters = reactive({ keyword: '', genreId: null, budgetMinYuan: null, budgetMaxYuan: null, episodesMin: null, sort: 'created:desc' })
const pageCount = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)))
// 奖池口径与列表一致（公开可接单），后端给的是分
const prizePoolText = computed(() => money(stats.value.prizePoolFen))
// 题材角标直接用后端的 genreCounts（按 genreId 聚合），字典只负责取名
const genreCounts = computed(() => {
  const map = {}
  for (const row of stats.value.genreCounts || []) map[Number(row.genreId)] = Number(row.count) || 0
  return map
})
async function load() {
  pending.value = true; error.value = ''
  const [sortBy, order] = String(filters.sort).split(':')
  // budgetMin/Max 后端按「分」接收后转元与库中预算比较，所以这里元 → 分
  const toFen = value => (Number(value) > 0 ? Math.round(Number(value) * 100) : undefined)
  try {
    const result = await api.value.listDemands({
      genreId: filters.genreId || undefined,
      keyword: filters.keyword?.trim() || undefined,
      sortBy, order,
      budgetMin: toFen(filters.budgetMinYuan), budgetMax: toFen(filters.budgetMaxYuan),
      episodesMin: Number(filters.episodesMin) > 0 ? Number(filters.episodesMin) : undefined,
      pageNum: pageNum.value, pageSize: PAGE_SIZE,
    })
    list.value = result.list; total.value = result.total
  } catch (failure) { error.value = failure.message || '任务加载失败'; await handleError(failure) }
  finally { pending.value = false }
}
async function loadMeta() {
  try { stats.value = await api.value.demandStats() || {} } catch { stats.value = {} }
}
function applyFilters() { pageNum.value = 1; load() }
function pickGenre(genreId) { filters.genreId = genreId; applyFilters() }
function resetFilters() {
  Object.assign(filters, { keyword: '', genreId: null, budgetMinYuan: null, budgetMaxYuan: null, episodesMin: null, sort: 'created:desc' })
  applyFilters()
}
function turn(offset) {
  const next = pageNum.value + offset
  if (next < 1 || next > pageCount.value) return
  pageNum.value = next; load()
}
function openSubmit(demand) {
  submitTarget.value = demand
  Object.assign(submitForm, { workId: null, message: '' })
  submitVisible.value = true
  api.value.listWorks().then(items => { works.value = items || [] }).catch(() => { works.value = [] })
}
async function doSubmit() {
  if (!submitForm.workId) { ElMessage.warning('请选择投稿作品'); return }
  busy.value = true
  try {
    await api.value.submitToDemand(submitTarget.value.demandId, { workId: submitForm.workId, message: submitForm.message?.trim() || undefined })
    submitVisible.value = false
    ElMessage.success('投稿成功，等待发布者选标')
    await load()
  } catch (failure) { await handleError(failure) } finally { busy.value = false }
}
onMounted(async () => { await Promise.all([loadMeta(), load()]) })
</script>
<style scoped>
.demand-page { padding: 4px 0 24px }
.hero { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 12px }
.hero-item { flex: 1 1 150px; border: 1px solid var(--rule, #ebeef5); border-radius: 8px; padding: 12px 14px; background: #fff }
.hero-item b { display: block; font-size: 21px; color: var(--indigo, #409eff) }
.hero-item span { font-size: 12px; color: var(--ink-3, #909399) }
.chips { display: flex; gap: 8px; flex-wrap: wrap; margin: 6px 0 4px }
.chip-genre { border: 1px solid var(--rule-2, #dcdfe6); background: #fff; border-radius: 14px; padding: 4px 12px; font-size: 12.5px; color: var(--ink-2, #606266); cursor: pointer }
.chip-genre em { font-style: normal; margin-left: 5px; color: var(--cinnabar, #f56c6c); font-weight: 600 }
.chip-genre[data-on="true"] { border-color: var(--indigo, #409eff); color: var(--indigo, #409eff); background: #ecf5ff }
.pager { display: flex; align-items: center; justify-content: center; gap: 14px; margin-top: 14px }
.dialog-body { display: flex; flex-direction: column; gap: 12px }
.dialog-foot { display: flex; justify-content: flex-end }
</style>
