<template>
  <div class="demand-page">
    <DemandTabs />

    <header class="square-head">
      <div class="head-copy">
        <p class="kicker">TASK SQUARE · 公开接单</p>
        <h1>任务广场</h1>
        <p class="head-desc">只展示「征集中且发布者已完成托管付款」的任务，接了就能拿钱；你已接的单在「我的任务」里看。</p>
      </div>
      <dl class="head-stats">
        <div><dt>可接单任务</dt><dd>{{ stats.availableCount ?? '—' }}</dd></div>
        <div><dt>在途奖池</dt><dd class="money">{{ prizePoolText }}</dd></div>
        <div><dt>今日新发布</dt><dd>{{ stats.todayNewCount ?? '—' }}</dd></div>
      </dl>
    </header>

    <form class="square-filter" @submit.prevent="applyFilters">
      <div class="toolbar">
        <label class="field search-field">搜索<input v-model="filters.keyword" type="search" placeholder="输入任务标题或任务编号" @keyup.enter="applyFilters"></label>
        <label class="field sort-field">排序
          <select v-model="filters.sort" @change="applyFilters">
            <option v-for="option in SORT_OPTIONS" :key="option.value" :value="option.value">{{ option.label }}</option>
          </select>
        </label>
        <button class="filter-toggle" type="button" :aria-expanded="filterOpen" @click="filterOpen = !filterOpen">
          {{ filterOpen ? '收起筛选' : '筛选' }}<span v-if="filterCount" class="filter-tag">{{ filterCount }}</span>
        </button>
      </div>

      <div v-if="filterOpen" class="filter-panel">
        <div class="filter-block genre-block">
          <p class="filter-label">题材</p>
          <div class="genre-pager">
            <button v-if="genrePage > 0" class="genre-arrow" type="button" aria-label="上一页题材" @click="turnGenrePage(-1)">‹</button>
            <div class="genre-grid" :class="{ paged: genrePageCount > 1 }" @pointerdown="onGenrePointerDown" @pointerup="onGenrePointerUp">
              <button v-for="chip in pagedGenreChips" :key="String(chip.id)" type="button" class="chip-genre" :data-on="filters.genreId === chip.id" @click="pickGenre(chip.id)">
                {{ chip.label }}<em>{{ chip.count }}</em>
              </button>
            </div>
            <button v-if="genrePage < genrePageCount - 1" class="genre-arrow" type="button" aria-label="下一页题材" @click="turnGenrePage(1)">›</button>
          </div>
        </div>
        <div class="filter-block">
          <p class="filter-label">预算区间（元）</p>
          <div class="range-row">
            <input v-model.number="filters.budgetMinYuan" type="number" min="0" placeholder="最低">
            <span>—</span>
            <input v-model.number="filters.budgetMaxYuan" type="number" min="0" placeholder="最高">
          </div>
        </div>
        <div class="filter-block">
          <p class="filter-label">最少集数</p>
          <input v-model.number="filters.episodesMin" class="episodes-input" type="number" min="0" placeholder="不限">
        </div>
        <div class="filter-acts">
          <button class="btn sm" type="submit">应用</button>
          <button class="btn quiet sm" type="button" @click="resetFilters">清空</button>
        </div>
      </div>
    </form>

    <div v-if="filterCount" class="filter-banner">
      <span>已启用 {{ filterCount }} 项筛选</span>
      <button class="filter-clear" type="button" @click="clearFilters">清除</button>
    </div>

    <div class="result-head">
      <h2>{{ resultTitle }}</h2>
      <span class="count">共 {{ total }} 条</span>
    </div>

    <LoadState :pending="pending" :error="error" :retry="load" :empty="!pending && !error && !list.length" empty-text="当前条件下暂无可接单任务" />
    <DemandCard v-for="item in list" :key="item.demandId" :demand="item" mode="square" @open="goDemandDetail">
      <button class="btn sm ghost" @click.stop="goDemandDetail(item.demandId)">接单</button>
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
import { usePortal } from '../../utils/portal.js'
import LoadState from '../../components/LoadState.vue'
import DemandTabs from '../../components/demand/DemandTabs.vue'
import DemandCard from '../../components/demand/DemandCard.vue'
import { money, genreOptions, genreLabel, SORT_OPTIONS } from '../../utils/demand.js'
const { api, goDemandDetail, handleError } = usePortal()
// 分页口径与 APP 及 API 默认值一致
const PAGE_SIZE = 20
const list = ref([])
const total = ref(0)
const pageNum = ref(1)
const pending = ref(false)
const error = ref('')
const stats = ref({})
const filters = reactive({ keyword: '', genreId: null, budgetMinYuan: null, budgetMaxYuan: null, episodesMin: null, sort: 'created:desc' })
const filterOpen = ref(false)
const pageCount = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)))
// 生效中的筛选条件数（题材/预算/集数），供按钮角标与提示条
const filterCount = computed(() => (filters.genreId ? 1 : 0) + (Number(filters.budgetMinYuan) > 0 ? 1 : 0) + (Number(filters.budgetMaxYuan) > 0 ? 1 : 0) + (Number(filters.episodesMin) > 0 ? 1 : 0))
const resultTitle = computed(() => (filters.genreId ? `征集中的任务 · ${genreLabel(filters.genreId)}` : '征集中的任务'))
// 奖池口径与列表一致（公开可接单），后端给的是分
const prizePoolText = computed(() => money(stats.value.prizePoolFen))
// 题材角标直接用后端的 genreCounts（按 genreId 聚合），字典只负责取名
const genreCounts = computed(() => {
  const map = {}
  for (const row of stats.value.genreCounts || []) map[Number(row.genreId)] = Number(row.count) || 0
  return map
})
// 题材收进筛选面板：横排自动换行，一页 40 项（8 列 × 5 行），多页时可左右滑或点箭头翻页，不显示页码
const GENRE_PAGE_SIZE = 40
const genrePage = ref(0)
const genreChips = computed(() => [
  { id: null, label: '全部', count: Number(stats.value.availableCount) || 0 },
  ...genreOptions.map(option => ({ id: option.value, label: option.label, count: genreCounts.value[option.value] || 0 })),
])
const genrePageCount = computed(() => Math.max(1, Math.ceil(genreChips.value.length / GENRE_PAGE_SIZE)))
const pagedGenreChips = computed(() => genreChips.value.slice(genrePage.value * GENRE_PAGE_SIZE, (genrePage.value + 1) * GENRE_PAGE_SIZE))
function turnGenrePage(offset) {
  const next = genrePage.value + offset
  if (next < 0 || next >= genrePageCount.value) return
  genrePage.value = next
}
let genreDragX = null
function onGenrePointerDown(event) { genreDragX = event.clientX }
function onGenrePointerUp(event) {
  if (genreDragX == null) return
  const dx = event.clientX - genreDragX
  genreDragX = null
  if (Math.abs(dx) < 40) return
  turnGenrePage(dx < 0 ? 1 : -1)
}
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
// 清空只重置筛选条件，保留搜索词与排序（与 APP 筛选弹层的“清空”口径一致）
function resetFilters() {
  Object.assign(filters, { genreId: null, budgetMinYuan: null, budgetMaxYuan: null, episodesMin: null })
  applyFilters()
}
function clearFilters() { resetFilters() }
function turn(offset) {
  const next = pageNum.value + offset
  if (next < 1 || next > pageCount.value) return
  pageNum.value = next; load()
}
onMounted(async () => { await Promise.all([loadMeta(), load()]) })
</script>
<style scoped>
.demand-page { padding: 0 0 30px }

/* 页头：左侧标题说明，右侧三项统计，用双线收口 */
.square-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 36px; padding: 6px 0 18px; border-bottom: 2px solid var(--ink) }
.kicker { margin: 0 0 9px; font-size: 11.5px; letter-spacing: .22em; color: var(--ink-3) }
.square-head h1 { font-size: 30px; line-height: 1.2; letter-spacing: .06em }
.head-desc { margin: 9px 0 0; max-width: 56ch; font-size: 13.5px; line-height: 1.75; color: var(--ink-2) }
.head-stats { display: flex; flex: none; margin: 0; padding-bottom: 2px }
.head-stats > div { min-width: 118px; padding: 0 20px; border-left: 1px solid var(--rule) }
.head-stats > div:first-child { padding-left: 0; border-left: 0 }
.head-stats > div:last-child { padding-right: 0 }
.head-stats dt { font-size: 12px; letter-spacing: .06em; color: var(--ink-3); white-space: nowrap }
.head-stats dd { margin: 5px 0 0; font-family: var(--serif); font-size: 23px; line-height: 1.15; font-variant-numeric: tabular-nums; white-space: nowrap }
.head-stats dd.money { color: var(--cinnabar) }

/* 工具带：搜索 + 排序 + 筛选入口 */
.toolbar { display: flex; align-items: flex-end; gap: 12px; margin-top: 18px; padding-bottom: 13px; border-bottom: 1px solid var(--rule) }
.toolbar .field { display: flex; flex-direction: column; gap: 4px; font-size: 12.5px; color: var(--ink-3) }
.toolbar .field.search-field { flex: 1 1 auto; min-width: 220px }
.toolbar .field.sort-field { flex: 0 0 180px }
.toolbar .field input, .toolbar .field select { width: 100%; height: 36px; padding: 0 10px; border: 1px solid var(--rule-2); border-radius: var(--radius); background: var(--paper-2); color: var(--ink); font-size: 13px }
.toolbar .field input:focus, .toolbar .field select:focus { outline: none; border-color: var(--indigo); box-shadow: 0 0 0 3px var(--indigo-wash) }
.filter-toggle { display: inline-flex; align-items: center; gap: 6px; flex: none; height: 36px; padding: 0 4px; border: 0; background: none; color: var(--indigo); font-size: 13px }
.filter-toggle:hover { text-decoration: underline }
.filter-tag { min-width: 16px; height: 16px; padding: 0 4px; border-radius: 8px; background: var(--cinnabar); color: #fff; font-size: 10.5px; line-height: 16px; text-align: center }

/* 筛选面板：题材收进面板，横排换行；预算/集数并排 */
.filter-panel { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 16px 24px; padding: 16px 0 4px; border-bottom: 1px solid var(--rule) }
.filter-block { display: flex; flex-direction: column; gap: 6px; flex: 1 1 230px }
.filter-block.genre-block { flex-basis: 100% }
.filter-label { margin: 0; font-size: 12.5px; color: var(--ink-3) }
.genre-pager { display: flex; align-items: flex-start; gap: 10px }
.genre-grid { flex: 1; display: flex; flex-wrap: wrap; gap: 7px; min-width: 0 }
.genre-grid.paged { min-height: 187px; align-content: flex-start }
.genre-arrow { flex: none; align-self: center; width: 26px; height: 26px; border: 1px solid var(--rule-2); border-radius: 50%; background: var(--paper-2); color: var(--ink-3); font-size: 16px; line-height: 1; cursor: pointer }
.genre-arrow:hover { border-color: var(--indigo); color: var(--indigo) }
.chip-genre { display: inline-flex; align-items: baseline; gap: 6px; padding: 4px 11px; border: 1px solid var(--rule-2); border-radius: var(--radius); background: var(--paper-2); color: var(--ink-2); font-size: 12.5px; line-height: 1.5; transition: color .15s, border-color .15s, background .15s }
.chip-genre em { font-style: normal; font-size: 11.5px; color: var(--ink-3); font-variant-numeric: tabular-nums }
.chip-genre:hover { border-color: var(--indigo-dim); color: var(--ink) }
.chip-genre[data-on="true"] { background: var(--indigo); border-color: var(--indigo); color: #fff }
.chip-genre[data-on="true"] em { color: rgba(255, 255, 255, .72) }
.range-row { display: flex; align-items: center; gap: 8px }
.range-row input { flex: 1; min-width: 0; height: 36px; padding: 0 10px; border: 1px solid var(--rule-2); border-radius: var(--radius); background: var(--paper-2); color: var(--ink); font-size: 13px }
.range-row span { color: var(--ink-3) }
.episodes-input { width: 100%; height: 36px; padding: 0 10px; border: 1px solid var(--rule-2); border-radius: var(--radius); background: var(--paper-2); color: var(--ink); font-size: 13px }
.range-row input:focus, .episodes-input:focus { outline: none; border-color: var(--indigo); box-shadow: 0 0 0 3px var(--indigo-wash) }
.filter-acts { display: flex; justify-content: flex-end; gap: 8px; flex: 1 1 100% }
.filter-acts .btn { height: 36px }
.filter-banner { display: flex; align-items: center; gap: 10px; margin-top: 12px; padding: 8px 12px; border-radius: var(--radius); background: var(--indigo-wash); font-size: 12.5px; color: var(--ink-2) }
.filter-clear { margin-left: auto; border: 0; background: none; color: var(--indigo); font-size: 12.5px; font-weight: 600; cursor: pointer }

/* 结果区 */
.result-head { display: flex; align-items: baseline; gap: 12px; margin: 22px 0 12px; padding-bottom: 9px; border-bottom: 1px solid var(--rule) }
.result-head h2 { font-size: 16.5px }
.result-head .count { font-size: 12.5px; color: var(--ink-3) }
.pager { display: flex; align-items: center; justify-content: center; gap: 14px; margin-top: 16px }
.pager-text { font-size: 12.5px; color: var(--ink-3); font-variant-numeric: tabular-nums }

@media (max-width: 900px) {
  .square-head { flex-direction: column; align-items: stretch; gap: 16px }
  .head-stats { padding-top: 14px; border-top: 1px solid var(--rule) }
  .head-stats > div { flex: 1 1 0; min-width: 0; padding: 0 16px }
  .head-stats > div:first-child { padding-left: 0 }
  .square-head h1 { font-size: 26px }
}
</style>
