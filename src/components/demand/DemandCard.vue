<template>
  <article class="demand-card" role="button" tabindex="0" @click="$emit('open', demand.demandId)" @keydown.enter.prevent="$emit('open', demand.demandId)">
    <div class="dc-head">
      <h3 class="dc-title">{{ demand.title }}</h3>
      <!-- 任务类型决定交什么、要不要读源剧本，放在状态之前 -->
      <span class="dc-type" :data-type="taskTypeValue">{{ taskTypeLabel(demand.taskType) }}</span>
      <span class="dc-status" :data-tone="statusTone">{{ demandStatusLabel(demand.status) }}</span>
    </div>
    <p class="cost dc-meta">
      编号 {{ demand.demandNo }} · 预算 {{ money(demand.budget) }} · 截止 {{ dateText(demand.deadline) }}
      <template v-if="Number(demand.totalEpisodes) > 0"> · {{ demand.totalEpisodes }} 集 · 逐轮验收</template>
      <template v-else> · 整单时限 {{ formatHours(demand.durationHours) }}</template>
    </p>
    <p class="cost dc-meta">
      {{ genreLabel(demand.genreId) }}
      <template v-if="taskTypeValue === 'storyboard'"> · 平台提供源剧本</template>
      <!-- 标签必须带前缀：否则「玄幻 · 11 / 22」会被读成集数进度 -->
      <template v-if="tagList.length"> · 标签 {{ tagList.join(' / ') }}</template>
    </p>
    <p v-if="mode === 'mine' && demand.acceptedAt" class="cost dc-meta">接单于 {{ timeText(demand.acceptedAt) }}</p>
    <!-- 只有进行中的单才该有轮次倒计时：已完成/已关闭/已失败仍显示「剩余 N 天」会被读成还没结清 -->
    <p v-if="mode === 'mine' && demand.status === 'in_progress' && demand.dueAt" class="cost dc-meta">
      当前轮截止：{{ timeText(demand.dueAt) }}
      <span v-if="roundCountdown.overdue" class="dc-danger">已逾期</span>
      <span v-else class="dc-count" :class="{ 'dc-urgent': roundCountdown.urgent }">{{ roundCountdown.text }}</span>
    </p>
    <p v-if="demand.status === 'failed' && demand.failReason" class="cost dc-danger">{{ demand.failReason }}</p>
    <p class="dc-req">{{ brief }}</p>
    <div class="dc-foot">
      <span class="cost">{{ demand.clientName ? '需求方 ' + demand.clientName : '平台发布' }} · 发布于 {{ dateText(demand.createdAt) }}</span>
      <div class="dc-actions" @click.stop><slot :demand="demand" /></div>
    </div>
  </article>
</template>
<script setup>
import { computed } from 'vue'
import { demandStatusLabel, money, dateText, timeText, countdown, genreLabel, formatHours, taskTypeLabel } from '../../utils/demand.js'
// open 统一回传 demandId，与 layout 提供的 goDemandDetail(id) 直接对接
const props = defineProps({ demand: { type: Object, required: true }, mode: { type: String, default: 'square' } })
defineEmits(['open'])
const taskTypeValue = computed(() => props.demand.taskType || 'script')
const tagList = computed(() => String(props.demand.tags || '').split(/[,，]/).map(t => t.trim()).filter(Boolean).slice(0, 4))
const brief = computed(() => {
  const text = String(props.demand.requirement || '').replace(/\s+/g, ' ').trim()
  return text.length > 96 ? text.slice(0, 96) + '…' : (text || '暂无需求描述')
})
const statusTone = computed(() => ({ open: 'warn', in_progress: 'info', selected: 'info', completed: 'ok', closed: 'off', failed: 'danger' }[props.demand.status] || 'off'))
// 倒计时只算一次：剩余时间充裕时用常态灰字，只有临期/逾期才上橙、红，避免满屏告警色
const roundCountdown = computed(() => countdown(props.demand.dueAt))
</script>
<style scoped>
/* 纸感任务单：细线外框 + 左侧书脊高亮，hover 不发光只收边框 */
.demand-card { position: relative; margin-bottom: 10px; padding: 16px 18px 14px; background: var(--paper-2); border: 1px solid var(--rule); border-radius: var(--radius); cursor: pointer; transition: border-color .15s, background .15s }
.demand-card::before { content: ""; position: absolute; left: -1px; top: -1px; bottom: -1px; width: 2px; background: transparent; transition: background .15s }
.demand-card:hover { border-color: var(--indigo-dim); background: #FCFBF8 }
.demand-card:hover::before { background: var(--indigo) }
.demand-card:focus-visible { outline: 2px solid var(--indigo); outline-offset: 2px }
.dc-head { display: flex; align-items: baseline; gap: 12px }
.dc-title { margin: 0; min-width: 0; font-family: var(--serif); font-size: 16px; font-weight: 600; letter-spacing: .01em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.dc-status { flex: none; padding: 1px 7px; border: 1px solid currentColor; border-radius: var(--radius); font-size: 11.5px; font-weight: 500; color: var(--ink-3); background: none }
.dc-type { flex: none; padding: 1px 7px; border-radius: var(--radius); font-size: 11.5px; font-weight: 500; white-space: nowrap; color: var(--indigo); background: var(--indigo-wash) }
.dc-type[data-type="script_storyboard"] { color: var(--ochre); background: var(--ochre-w) }
.dc-type[data-type="storyboard"] { color: var(--bamboo); background: var(--bamboo-w) }
.dc-status[data-tone="warn"] { color: var(--ochre) }
.dc-status[data-tone="info"] { color: var(--indigo) }
.dc-status[data-tone="ok"] { color: var(--bamboo) }
.dc-status[data-tone="danger"] { color: var(--cinnabar) }
.dc-meta { margin: 6px 0 0; font-size: 12.5px; color: var(--ink-3); font-variant-numeric: tabular-nums }
.dc-req { margin: 9px 0 0; font-size: 13px; color: var(--ink-2); line-height: 1.7 }
.dc-foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 11px; padding-top: 10px; border-top: 1px dashed var(--rule); flex-wrap: wrap }
.dc-actions { display: flex; gap: 8px; flex-wrap: wrap }
.dc-danger { color: var(--cinnabar); font-weight: 600; margin-left: 6px }
.dc-count { margin-left: 6px }
.dc-urgent { color: var(--ochre); font-weight: 600 }
</style>
