<template>
  <div class="workspace-layout">
    <section class="workspace-main" aria-label="我的作品">
      <div class="sec-head sec-head-lg"><div><h2>我的作品</h2><span class="count">{{ summary }}</span></div><button class="more" :aria-expanded="filterOpen" @click="filterOpen = !filterOpen">筛选 / 搜索</button></div>
      <div v-if="!canCreate" class="note info capability-note">创作者能力尚未开通，开通后即可上传作品与使用 AI 创作。<button class="text-button" @click="openPanel('account', 'profile')">查看个人资料 →</button></div>
      <form v-if="filterOpen" class="filters" @submit.prevent>
        <label class="field">搜索作品<input v-model="keyword" placeholder="输入书名或简介" type="search" aria-label="搜索作品" /></label>
        <label class="field">作品状态<select v-model="status" aria-label="作品状态"><option value="">全部状态</option><option value="draft">草稿</option><option value="reviewing">审核中</option><option value="revision">待修改</option><option value="published">已发布</option></select></label>
        <button type="button" class="btn quiet sm" @click="keyword = ''; status = ''">重置</button>
      </form>
      <LoadState :pending="pending" :error="error" :retry="load" />
      <div v-if="!pending && !error" class="worklist">
        <button class="workitem new-work" :disabled="!canCreate" @click="router.push(basePath + '/create')"><span class="work-cover"><span class="plus" aria-hidden="true">＋</span></span><span class="work-copy"><span class="work-title"><h3>创作与上传</h3><span class="work-kind">新建作品</span></span><span class="work-synopsis">从一个新故事开始，或上传你已经完成的剧本。创建后可以继续补充简介、章节和版权信息。</span><span class="work-foot"><span class="work-meta">点击此处进入创作页面</span><span class="btn sm">开始创作</span></span></span></button>
        <button v-for="work in filtered" :key="work.workId" class="workitem" :data-reviewing="work.status === 'reviewing'" @click="goWork(work.workId)">
          <span class="work-cover"><img v-if="avatarUrl(work.cover) && failedCovers[work.workId] !== work.cover" :src="avatarUrl(work.cover)" alt="" @error="failedCovers[work.workId] = work.cover" /><span v-else class="glyph">{{ work.title?.slice(0, 1) }}</span><span class="stamp" :data-s="stateOf(work.status).stamp">{{ stateOf(work.status).label }}</span></span>
          <span class="work-copy"><span class="work-title"><h3>{{ work.title }}</h3><span class="work-kind">{{ workType(work.workType) }} · {{ work.genreName || '未分类' }}</span></span><span class="work-synopsis">{{ work.summary || '故事还在酝酿中，继续写下你的下一章。' }}</span><span class="work-foot"><span class="work-meta">{{ work.episodeCount != null ? work.episodeCount + ' 章 · ' : '' }}{{ words(work.wordCount) }} · 更新于 {{ dateText(work.updateTime || work.createTime).slice(5) }}</span><span class="btn sm" :class="{ quiet: !['revision', 'rejected'].includes(work.status) }">{{ stateOf(work.status).action }}</span></span></span>
        </button>
      </div>
      <LoadState v-if="!pending && !error" :empty="!filtered.length" :empty-text="keyword || status ? '没有找到符合条件的作品' : '你的故事，从第一部作品开始。'" />
    </section>
    <aside class="desk-workspace" aria-label="工作台">
      <div class="aside-head"><h2>工作台</h2><span class="aside-note">{{ orderPending || orderError ? '订单待办' : todos.length + ' 项待办' }}</span></div>
      <div class="aside-block"><h3>待办<span v-if="!orderPending && !orderError" class="count">{{ todos.length }}</span></h3>
        <LoadState :pending="orderPending" :error="orderError" :retry="loadTodo" loading-text="正在加载订单…" />
        <template v-if="!orderError"><button v-for="order in todos" :key="order.orderId" class="todo-item order-todo" @click="openPanel('cooperation', 'order', order.orderNo || order.workTitle || '')"><span class="todo-order-head"><b>《{{ order.workTitle || '订单#' + order.orderId }}》</b><em>{{ orderStatusLabel(order.status) }}</em></span><span>订单号：{{ order.orderNo || '#' + order.orderId }} · {{ money(Number(order.amount || 0) / 100) }}</span><span class="todo-progress"><span v-for="(step, i) in orderSteps" :key="step" :class="{ active: orderStepIndex(order.status) >= i }">{{ step }}</span></span></button></template>
        <p v-if="!orderPending && !orderError && !todos.length" class="cost">暂无待处理订单。</p>
      </div>
      <details class="aside-block activity-list"><summary><h3>最近动态</h3></summary><ul class="aside-log"><li v-for="work in recent" :key="work.workId"><time>{{ dateText(work.updateTime || work.createTime) }}</time>{{ work.title }} · {{ stateOf(work.status).label }}</li></ul><p v-if="!pending && !recent.length" class="cost">暂无最近动态</p></details>
    </aside>
  </div>
</template>
<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { usePortal } from '../../utils/portal.js'
import { avatarUrl } from '../../utils/avatarUrl.js'
import { stateOf, words, dateText, money } from '../../utils/creator.js'
import { loadTodoOrders, orderStatusLabel, orderSteps, orderStepIndex } from '../../utils/orderTodo.js'
import LoadState from '../../components/LoadState.vue'
const { api, canCreate, basePath, goWork, openPanel, handleError } = usePortal()
const router = useRouter()
const works = ref([])
const failedCovers = ref({})
const pending = ref(true)
const error = ref('')
const filterOpen = ref(false)
const keyword = ref('')
const status = ref('')
const workType = value => ({ short_drama: '短剧', novel: '小说', script: '剧本' })[value] || '短剧'
const filtered = computed(() => works.value.filter(w => (!keyword.value.trim() || (w.title + ' ' + (w.summary || '')).includes(keyword.value.trim())) && (!status.value || w.status === status.value || (status.value === 'revision' && w.status === 'rejected'))))
const todos = ref([])
const orderPending = ref(true)
const orderError = ref('')
const recent = computed(() => [...works.value].sort((a, b) => String(b.updateTime || b.createTime || '').localeCompare(String(a.updateTime || a.createTime || ''))).slice(0, 4))
const summary = computed(() => `${works.value.length} 部 · 草稿 ${works.value.filter(w => w.status === 'draft').length} · 审核中 ${works.value.filter(w => w.status === 'reviewing').length} · 待修改 ${works.value.filter(w => ['revision', 'rejected'].includes(w.status)).length} · 已发布 ${works.value.filter(w => w.status === 'published').length}`)
async function load() {
  pending.value = true; error.value = ''
  try { works.value = await api.value.listWorks(); failedCovers.value = {} }
  catch (failure) { error.value = failure.message || '作品加载失败'; await handleError(failure) }
  finally { pending.value = false }
}
async function loadTodo() {
  orderPending.value = true; orderError.value = ''
  try { todos.value = await loadTodoOrders(api.value, 'seller') }
  catch (failure) { orderError.value = failure.message || '订单加载失败'; await handleError(failure) }
  finally { orderPending.value = false }
}
onMounted(() => { load(); loadTodo() })
defineExpose({ loadTodo })
</script>
<style scoped>
.activity-list summary { display: flex; align-items: center; justify-content: space-between; cursor: pointer; list-style: none; }
.activity-list summary::-webkit-details-marker { display: none; }
.activity-list summary h3 { margin: 0; }
.activity-list summary::after { content: '⌄'; color: var(--ink-3); font-size: 16px; }
.activity-list[open] summary::after { transform: rotate(180deg); }
.activity-list summary:focus-visible { outline: 2px solid var(--indigo); outline-offset: 3px; }
.order-todo .todo-order-head { display: flex; align-items: center; gap: 8px; justify-content: space-between; margin: 0; }
.order-todo .todo-order-head b { min-width: 0; overflow-wrap: anywhere; }
.order-todo .todo-order-head em { flex: none; border-radius: 10px; padding: 2px 7px; background: #ecf5ff; color: #409eff; font-size: 12px; font-style: normal; }
.order-todo .todo-progress { display: flex; gap: 3px; margin-top: 10px; }
.order-todo .todo-progress span { flex: 1; margin: 0; border-top: 2px solid #e4e7ed; padding-top: 4px; text-align: center; font-size: 10px; color: #909399; }
.order-todo .todo-progress span.active { border-color: #409eff; color: #409eff; }
</style>
