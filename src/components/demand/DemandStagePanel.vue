<template>
  <section class="stage-panel">
    <LoadState :pending="pending" :error="error" :retry="reload" loading-text="正在加载验收轮次…" />
    <div v-if="!pending && !error && !stages.length" class="note">该任务未配置逐轮验收，接单后按整单时限（{{ demand.durationHours || '-' }} 小时）交付。</div>
    <template v-else>
      <p v-if="activeRound" class="round-banner" :data-urgent="countdown(activeRound.dueAt).urgent">第 {{ activeRound.stageOrder }} 轮 · {{ countdown(activeRound.dueAt).text }}</p>
      <p v-else-if="stages.every(s => s.status === 'approved')" class="round-banner done">全部 {{ stages.length }} 轮已验收通过，款项已逐轮放出</p>

      <article v-for="stage in stages" :key="stage.stageId" class="stage-card" :data-tone="stageTone(stage)">
        <div class="sc-head">
          <b>第 {{ stage.stageOrder }} 轮 · 验收到第 {{ stage.episodeTo }} 集</b>
          <span class="sc-amount">{{ money(stage.amount) }}</span>
          <span class="sc-status">{{ stageStatusLabel(stage) }}</span>
        </div>
        <p class="cost">时限 {{ durationText(stage) }} · <span :class="dueClass(stage)">截止 {{ timeText(stage.dueAt) }}</span><template v-if="stage.startedAt"> · 开始于 {{ timeText(stage.startedAt) }}</template></p>
        <template v-if="stage.workId || stage.deliverableDesc">
          <p class="cost">交付作品：《{{ stage.workTitle || ('作品#' + stage.workId) }}》<template v-if="stage.submittedAt"> · 提交于 {{ timeText(stage.submittedAt) }}</template></p>
          <p v-if="stage.deliverableDesc" class="sc-desc">{{ stage.deliverableDesc }}</p>
          <a v-if="stage.deliverableUrl" class="sc-link" :href="stage.deliverableUrl" target="_blank" rel="noopener">交付物链接 ↗</a>
        </template>
        <p v-if="stage.aiScore != null" class="cost">AI 审核 {{ stage.aiScore }} 分：{{ aiBrief(stage.aiResult) }}（{{ timeText(stage.aiReviewedAt) }}）</p>
        <p v-if="stage.status === 'ai_reviewing'" class="cost sc-warn">交付物正在 AI 审核中，本轮计时已暂停，结果出来后自动流转。</p>
        <p v-if="stage.status === 'rejected' && stage.rejectReason" class="cost sc-danger">驳回原因：{{ stage.rejectReason }}</p>
        <p v-if="Number(stage.releaseFlag) === 1" class="cost sc-ok">已放款 {{ money(stage.amount) }}（已入创作者待结算）</p>
        <p v-if="stage.reviewedAt" class="cost">验收时间：{{ timeText(stage.reviewedAt) }}</p>

        <div v-if="isOwner && isActive(stage)" class="sc-actions">
          <button class="btn sm" :disabled="busy" @click="openDeliver(stage)">提交交付物</button>
          <button v-if="stage.extendStatus !== 'pending'" class="btn sm quiet" :disabled="busy" @click="openExtend(stage)">申请延时</button>
          <span v-else class="cost sc-pending">延时申请待发布者处理（{{ stage.extendDays || 0 }} 天 {{ stage.extendHours || 0 }} 小时）</span>
        </div>

        <div class="sc-history">
          <button class="history-toggle" type="button" @click="toggleHistory(stage)">延时记录（{{ historyOf(stage.stageId).length }} 条）<span v-if="historyOpen[stage.stageId]"> ▴</span><span v-else> ▾</span></button>
          <ul v-if="historyOpen[stage.stageId]" class="history-list">
            <li v-if="!historyOf(stage.stageId).length" class="cost">本轮暂无延时记录</li>
            <li v-for="row in historyOf(stage.stageId)" :key="row.applyId" class="history-row">
              <span class="cost">{{ extendTypeLabel(row.applyType) }} · {{ row.days || 0 }} 天 {{ row.hours || 0 }} 小时</span>
              <span v-if="row.reason" class="cost">原因：{{ row.reason }}</span>
              <span class="tone" :data-tone="extendTone(row.status, row.applyType)">{{ extendStatusLabel(row.status, row.applyType) }}</span>
              <span class="cost">{{ timeText(row.appliedAt || row.createdAt) }}</span>
            </li>
          </ul>
        </div>
      </article>
    </template>

    <PortalLayer v-model="deliverVisible" :title="`提交交付物 - 第 ${current?.stageOrder || ''} 轮`" modal>
      <div class="dialog-body">
        <label class="field">交付作品
          <select v-model.number="deliverForm.workId">
            <option :value="null">选择作品（仅本人未上架售卖的作品可交付）</option>
            <option v-for="work in works" :key="work.workId" :value="Number(work.workId)">{{ work.title || ('作品#' + work.workId) }}（{{ work.status }}）</option>
          </select>
        </label>
        <label class="field">交付说明<textarea v-model="deliverForm.deliverableDesc" rows="4" placeholder="本轮完成的集数、主要内容与待确认事项…"></textarea></label>
        <label class="field">交付物链接（可选）<input v-model="deliverForm.deliverableUrl" placeholder="网盘/文档链接"></label>
        <p class="cost">提交后本轮计时暂停，先走 AI 审核再进入发布者验收。</p>
        <div class="dialog-foot"><button class="btn" :disabled="busy" @click="doDeliver">{{ busy ? '提交中…' : '确认提交' }}</button></div>
      </div>
    </PortalLayer>

    <PortalLayer v-model="extendVisible" :title="`申请延时 - 第 ${current?.stageOrder || ''} 轮`" modal>
      <div class="dialog-body">
        <div class="field-row">
          <label class="field">延长天数<input v-model.number="extendForm.days" type="number" min="0" max="30"></label>
          <label class="field">延长小时<input v-model.number="extendForm.hours" type="number" min="0" max="72"></label>
        </div>
        <label class="field">延时原因<textarea v-model="extendForm.reason" rows="3" placeholder="说明为什么需要延长（发布者可据此判断）…"></textarea></label>
        <p class="cost">延时申请需发布者同意才会顺延截止时间；发布者超过 24 小时未处理将自动驳回。</p>
        <div class="dialog-foot"><button class="btn" :disabled="busy" @click="doRequestExtend">{{ busy ? '提交中…' : '提交申请' }}</button></div>
      </div>
    </PortalLayer>
  </section>
</template>
<script setup>
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { usePortal } from '../../utils/portal.js'
import LoadState from '../LoadState.vue'
import PortalLayer from '../PortalLayer.vue'
import { money, timeText, countdown, durationText, stageStatusLabel, stageTone, isActiveStage, extendTypeLabel, extendStatusLabel, extendTone, aiBrief, dueTone } from '../../utils/demand.js'
const props = defineProps({ demand: { type: Object, required: true }, isOwner: Boolean })
// 提交交付/延时动作后通知父页重拉任务详情（整单状态可能随之变化）
const emit = defineEmits(['changed'])
const { api, handleError } = usePortal()
const stages = ref([])
const pending = ref(false)
const error = ref('')
const busy = ref(false)
const works = ref([])
const history = ref([])
const historyOpen = reactive({})
const current = ref(null)
const deliverVisible = ref(false)
const extendVisible = ref(false)
const deliverForm = reactive({ workId: null, deliverableDesc: '', deliverableUrl: '' })
const extendForm = reactive({ days: null, hours: null, reason: '' })
// 倒计时每分钟翻一次用的心跳值（与定时器 id 分离，避免把 id 当成响应式变量写回）
const tick = ref(0)
let clockTimer = null
let pollTimer = null

const isActive = stage => props.isOwner && isActiveStage(stage)
// 当前活动轮：面板顶部的倒计时条只标这一轮，后续轮次的时限在各自卡片里展示
const activeRound = computed(() => { void tick.value; return stages.value.find(stage => isActiveStage(stage)) || null })
const historyOf = stageId => history.value.filter(row => String(row.stageId) === String(stageId))
// 截止时间颜色跟阶段走（逾期红/临期橙/其余中性），不再无条件标红
const dueClass = stage => ['sc-due', dueTone(stage) === 'danger' ? 'sc-danger' : dueTone(stage) === 'warn' ? 'sc-warn' : '']
async function loadStages() {
  pending.value = true; error.value = ''
  try { stages.value = await api.value.demandStages(props.demand.demandId) || [] }
  catch (failure) { error.value = failure.message || '轮次加载失败'; await handleError(failure) }
  finally { pending.value = false }
}
async function loadHistory() {
  try { history.value = await api.value.demandExtendHistory(props.demand.demandId) || [] }
  catch { history.value = [] } // 历史为空属正常，不打断面板
}
// 提交交付物后本轮进 ai_reviewing，后端异步出结果，沿用 APP 的 5 秒轮询口径
async function reload() { await Promise.all([loadStages(), loadHistory()]) }
function toggleHistory(stage) { historyOpen[stage.stageId] = !historyOpen[stage.stageId] }
function openDeliver(stage) {
  current.value = stage
  Object.assign(deliverForm, { workId: null, deliverableDesc: '', deliverableUrl: '' })
  deliverVisible.value = true
  api.value.deliverableWorks().then(list => { works.value = list || [] }).catch(() => { works.value = [] })
}
function openExtend(stage) {
  current.value = stage
  Object.assign(extendForm, { days: null, hours: null, reason: '' })
  extendVisible.value = true
}
async function doDeliver() {
  if (!deliverForm.workId) { ElMessage.warning('请选择交付作品'); return }
  if (!deliverForm.deliverableDesc?.trim()) { ElMessage.warning('请填写交付说明'); return }
  busy.value = true
  try {
    await api.value.deliverStage(props.demand.demandId, current.value.stageId, { workId: deliverForm.workId, deliverableDesc: deliverForm.deliverableDesc.trim(), deliverableUrl: deliverForm.deliverableUrl?.trim() || undefined })
    deliverVisible.value = false
    ElMessage.success('交付已提交，等待 AI 审核与发布者验收')
    await reload()
    emit('changed')
  } catch (failure) { await handleError(failure) } finally { busy.value = false }
}
async function doRequestExtend() {
  const days = Number(extendForm.days) || 0
  const hours = Number(extendForm.hours) || 0
  if (days + hours <= 0) { ElMessage.warning('延长时长必须大于 0'); return }
  busy.value = true
  try {
    await api.value.requestStageExtend(props.demand.demandId, current.value.stageId, { days, hours, reason: extendForm.reason?.trim() || undefined })
    extendVisible.value = false
    ElMessage.success('延时申请已提交，等待发布者处理')
    await reload()
    emit('changed')
  } catch (failure) { await handleError(failure) } finally { busy.value = false }
}
onMounted(async () => {
  await reload()
  clockTimer = setInterval(() => { tick.value++ }, 60000)
  // 有轮次卡在 AI 审核中时按 5 秒轮询取结果（与 APP 同口径）
  pollTimer = setInterval(() => { if (stages.value.some(stage => stage.status === 'ai_reviewing')) reload() }, 5000)
})
onUnmounted(() => { clearInterval(clockTimer); clearInterval(pollTimer) })
defineExpose({ reload })
</script>
<style scoped>
.stage-panel { margin-top: 16px }
.round-banner { margin: 0 0 10px; padding: 9px 12px; border-radius: 6px; background: #ecf5ff; color: #409eff; font-size: 13px; font-weight: 600 }
.round-banner[data-urgent="true"] { background: #fef0f0; color: #f56c6c }
.round-banner.done { background: #f0f9eb; color: #67c23a }
.stage-card { border: 1px solid var(--rule, #ebeef5); border-left-width: 3px; border-radius: 6px; padding: 12px 14px; margin-bottom: 10px; background: #fff }
.stage-card[data-tone="ok"] { border-left-color: #67c23a }
.stage-card[data-tone="warn"] { border-left-color: #e6a23c }
.stage-card[data-tone="danger"] { border-left-color: #f56c6c }
.stage-card[data-tone="info"] { border-left-color: #409eff }
.stage-card[data-tone="off"] { border-left-color: #dcdfe6 }
.sc-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font-size: 14px }
.sc-amount { color: var(--cinnabar, #f56c6c); font-weight: 600 }
.sc-status { margin-left: auto; padding: 1px 9px; border-radius: 10px; font-size: 12px; background: #f4f4f5; color: #909399 }
.stage-card .cost { margin: 6px 0 0; font-size: 12px; color: var(--ink-3, #909399) }
/* 基类不再写死红色：具体色调由 dueClass 按逾期/临期判定追加 sc-danger / sc-warn */
.sc-due { color: inherit }
.sc-warn { color: #e6a23c }
.sc-danger { color: #f56c6c }
.sc-ok { color: #67c23a }
.sc-pending { color: #e6a23c; align-self: center }
.sc-desc { white-space: pre-wrap; color: var(--ink-2, #606266) }
.sc-link { display: inline-block; margin-top: 4px; font-size: 12px; color: var(--indigo, #409eff) }
.sc-actions { display: flex; align-items: center; gap: 8px; margin-top: 10px; flex-wrap: wrap }
.sc-history { margin-top: 8px }
.history-toggle { border: 0; background: none; padding: 0; font-size: 12px; color: var(--indigo, #409eff); cursor: pointer }
.history-list { list-style: none; margin: 6px 0 0; padding: 0 0 0 10px; border-left: 2px solid var(--rule, #ebeef5) }
.history-row { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; padding: 4px 0; font-size: 12px }
.tone { padding: 0 8px; border-radius: 9px; font-size: 11.5px; background: #f4f4f5; color: #909399 }
.tone[data-tone="warn"] { background: #fdf6ec; color: #e6a23c }
.tone[data-tone="ok"] { background: #f0f9eb; color: #67c23a }
.dialog-body { display: flex; flex-direction: column; gap: 12px }
.field-row { display: flex; gap: 12px }
.field-row .field { flex: 1 }
.dialog-foot { display: flex; justify-content: flex-end; gap: 8px }
</style>
