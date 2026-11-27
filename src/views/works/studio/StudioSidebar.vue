<template>
  <aside class="sidebar" aria-label="作品导航">
    <div class="work-info">
      <small>当前作品</small>
      <h2>《{{ work?.title || '未命名作品' }}》</h2>
      <div class="meta">{{ metaLine }}</div>
      <span class="stamp" :data-s="displayState.stamp">{{ displayState.label }}</span>
    </div>

    <div v-if="reviewing" class="review-banner" role="status">作品正在审核中，当前为只读状态；审核结束前不能修改章节与资料。</div>
    <div v-else-if="rejected" class="review-banner bad" role="alert">
      {{ rejectedReason || '审核未通过，请按审核意见修改后重新提交。' }}
      <button type="button" @click="emit('action', 'submit')">修改并重新提交</button>
    </div>

    <div class="dir-label">作品资料</div>
    <button
      v-for="item in infoNav"
      :key="item.view"
      type="button"
      class="nav-item"
      :class="{ active: activeView === item.view }"
      :aria-current="activeView === item.view ? 'page' : undefined"
      @click="emit('navigate', item.view)"
    >
      <span class="glyph" aria-hidden="true">{{ item.glyph }}</span>{{ item.label }}
    </button>

    <div class="dir-label">结构与章节</div>
    <button
      type="button"
      class="nav-item"
      :class="{ active: activeView === 'outline' }"
      :aria-current="activeView === 'outline' ? 'page' : undefined"
      @click="emit('navigate', 'outline')"
    >
      <span class="glyph" aria-hidden="true">▤</span>作品大纲
    </button>

    <div class="dir-label">作品</div>
    <div class="work-menu">
      <select :value="work?.workId || ''" aria-label="切换作品" :disabled="switching" @change="emit('switch-work', Number($event.target.value))">
        <option :value="work?.workId || ''">{{ work?.title || '当前作品' }}</option>
        <option v-for="item in otherWorks" :key="item.workId" :value="item.workId">{{ item.title }}（{{ stateOf(item.status).label }}）</option>
      </select>
      <button type="button" :disabled="!editable" @click="emit('action', 'settings')">作品设置</button>
      <button type="button" :disabled="!editable || submitting" @click="emit('action', 'submit')">{{ submitting ? '提交中…' : work?.status === 'published' ? '重新提交审核' : '提交审核' }}</button>
      <button v-if="work?.status === 'published'" type="button" :disabled="shelfing" @click="emit('action', 'shelf')">{{ shelfing ? '处理中…' : onShelf ? '下架作品' : '上架到书城' }}</button>
      <button type="button" @click="emit('action', 'versions')">版本历史</button>
      <button type="button" @click="emit('action', 'archive')">作品档案</button>
      <button type="button" class="danger" :disabled="!editable || deleting" @click="emit('action', 'delete')">删除作品</button>
    </div>

    <div class="sidebar-footer">作品资料为只读参考，可让 AI 重新整理任一资料；点「作品大纲」查看章节与新建。</div>
  </aside>
</template>
<script setup>
import { computed } from 'vue'
import { stateOf } from '../../../utils/creator.js'
import { minutesText } from '../../../utils/blueprint.js'

// 第一栏：作品信息 + 作品资料导航 + 作品级操作（切换/设置/提审/上下架/档案/删除）。
const props = defineProps({
  work: Object,
  blueprint: Object,
  works: { type: Array, default: () => [] },
  activeView: { type: String, default: 'outline' },
  editable: Boolean,
  reviewing: Boolean,
  rejected: Boolean,
  rejectedReason: { type: String, default: '' },
  submitting: Boolean,
  shelfing: Boolean,
  deleting: Boolean,
  switching: Boolean
})
const emit = defineEmits(['navigate', 'action', 'switch-work'])
const infoNav = [
  { view: 'intro', glyph: '▣', label: '作品简介' },
  { view: 'characters', glyph: '◎', label: '人物信息' },
  { view: 'objects', glyph: '◇', label: '物品信息' }
]
const onShelf = computed(() => props.work?.shelfStatus === 'on_shelf')
const displayState = computed(() => {
  if (props.work?.status === 'published' && onShelf.value) return { label: '已上架', stamp: 'passed' }
  if (props.work?.status === 'published') return { label: '审核通过 · 待上架', stamp: 'passed' }
  return stateOf(props.work?.status)
})
const metaLine = computed(() => {
  const genre = props.blueprint?.genre || props.work?.genreName || '未分类'
  const episodes = props.blueprint?.planEpisodes || props.work?.episodeCount || '—'
  const minutes = props.blueprint?.minutesPerEpisode || 2
  return `${genre} · ${episodes} 集 · ${minutesText(minutes)}/集`
})
const otherWorks = computed(() => (props.works || []).filter(item => Number(item.workId) !== Number(props.work?.workId)))
</script>
