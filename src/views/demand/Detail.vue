<template>
  <div class="demand-detail">
    <button class="btn sm quiet back" @click="$router.push('/demand')">← 返回任务广场</button>
    <LoadState :pending="pending" :error="error" :retry="load" />
    <template v-if="!pending && !error && demand">
      <header class="dd-head">
        <div>
          <h2>{{ demand.title }}</h2>
          <div class="dd-tags">
            <span class="dd-status" :data-tone="statusTone">{{ demandStatusLabel(demand.status) }}</span>
            <span class="chip-lite chip-type" :data-type="taskTypeValue">{{ taskTypeLabel(demand.taskType) }}</span>
            <span class="chip-lite">{{ genreLabel(demand.genreId) }}</span>
            <span v-for="tag in tagList" :key="tag" class="chip-lite">{{ tag }}</span>
          </div>
        </div>
        <div class="dd-money"><b>{{ money(demand.budget) }}</b><span>任务预算</span></div>
      </header>

      <dl class="dd-info">
        <div><dt>任务编号</dt><dd>{{ demand.demandNo }}</dd></div>
        <div><dt>任务类型</dt><dd>{{ taskTypeLabel(demand.taskType) }}</dd></div>
        <div><dt>需求方</dt><dd>{{ demand.clientName || '平台代发布，暂未提供' }}</dd></div>
        <div><dt>接单截止</dt><dd>{{ dateText(demand.deadline) }}</dd></div>
        <div><dt>总集数</dt><dd>{{ Number(demand.totalEpisodes) > 0 ? demand.totalEpisodes + ' 集 · ' + (taskTypeValue === 'storyboard' ? '按源剧本逐轮出分镜' : '逐轮验收') : '未设定 · 整单时限 ' + formatHours(demand.durationHours) }}</dd></div>
        <div v-if="isOwner"><dt>接单人</dt><dd>我 · {{ timeText(demand.acceptedAt) }} 接单</dd></div>
        <div class="dd-wide"><dt>交付要求</dt><dd>{{ taskTypeDeliverHint(demand.taskType) }}</dd></div>
      </dl>

      <p v-if="demand.status === 'failed' && demand.failReason" class="dd-fail">{{ demand.failReason }}</p>

      <section class="dd-block">
        <h3>需求描述</h3>
        <p class="dd-requirement">{{ demand.requirement || '平台未填写详细需求' }}</p>
      </section>
      <!-- 分镜类任务接单前必须能读到源剧本，否则无法评估工作量与出价 -->
      <section v-if="taskTypeValue === 'storyboard'" class="dd-block">
        <h3>源剧本</h3>
        <p class="dd-requirement">
          <template v-if="demand.sourceWorkTitle">作品《{{ demand.sourceWorkTitle }}》</template>
          <template v-if="demand.sourceScriptUrl"><span class="src-split">文件 {{ demand.sourceScriptName || '剧本文件' }}</span></template>
          <template v-if="!demand.sourceWorkTitle && !demand.sourceScriptUrl">平台提供的源剧本已失效，暂不建议接单。</template>
        </p>
        <p class="dd-src-acts"><button class="btn sm ghost" type="button" @click="openSource">查看源剧本</button></p>
      </section>
      <section v-if="demand.contactInfo" class="dd-block">
        <h3>联系方式</h3>
        <p class="dd-requirement">{{ demand.contactInfo }}</p>
      </section>

      <section v-if="!isOwner" class="dd-actions">
        <template v-if="canClaim">
          <button class="btn" :disabled="busy" @click="doClaim">{{ busy ? '接单中…' : '我要接单' }}</button>
          <button class="btn ghost" :disabled="busy" @click="openChat">联系平台</button>
          <p class="note">接单后按轮次交付，每轮通过验收即结算该轮款项。</p>
        </template>
        <p v-else-if="demand.status === 'open'" class="note">该任务当前不可接单，请另选其他任务。</p>
        <p v-else class="note">任务已{{ demandStatusLabel(demand.status) }}，不能再接单。</p>
      </section>
      <p v-else class="note dd-owned">你已接下此任务，请按当前轮时限交付，全部轮次验收通过后款项结清。</p>

      <h3 class="dd-section-title">验收进度</h3>
      <DemandStagePanel ref="panel" :demand="demand" :is-owner="isOwner" @changed="load" />
    </template>

    <!-- 源剧本查阅：作品源逐集读正文（后端已按纯文本下发），文件源给直链 -->
    <PortalLayer v-model="srcVisible" title="源剧本" wide>
      <div class="src-view">
        <LoadState :pending="srcPending" :error="srcError" :retry="loadSource" loading-text="正在加载源剧本…" />
        <template v-if="!srcPending && !srcError && source">
          <p v-if="source.fileUrl" class="cost src-file">剧本文件：<a :href="mediaUrl(source.fileUrl)" target="_blank" rel="noopener">{{ source.fileName || '查看下载' }}</a></p>
          <template v-if="source.work">
            <h4 class="src-title">《{{ source.work.title || '未命名作品' }}》</h4>
            <p class="cost">{{ source.work.authorName ? '作者 ' + source.work.authorName + ' · ' : '' }}共 {{ source.chapters.length }} 集<template v-if="source.work.wordCount"> · {{ source.work.wordCount }} 字</template></p>
            <p v-if="source.work.summary" class="src-summary">{{ source.work.summary }}</p>
            <ol class="src-chapters">
              <li v-for="chapter in source.chapters" :key="chapter.chapterId" class="src-chapter">
                <div class="src-chapter-head">
                  <b>第 {{ chapter.chapterNo }} 集 · {{ chapter.chapterTitle || ('章节#' + chapter.chapterId) }}</b>
                  <span v-if="chapter.wordCount" class="cost">{{ chapter.wordCount }} 字</span>
                  <button type="button" class="src-toggle" @click="srcOpened[chapter.chapterId] = !srcOpened[chapter.chapterId]">{{ srcOpened[chapter.chapterId] ? '收起 ▴' : '看正文 ▾' }}</button>
                </div>
                <div v-if="srcOpened[chapter.chapterId]" class="src-content">
                  <p v-for="(line, i) in paragraphs(chapter)" :key="i">{{ line }}</p>
                  <p v-if="!paragraphs(chapter).length" class="cost">该集暂无正文内容。</p>
                </div>
              </li>
              <li v-if="!source.chapters.length" class="cost">该作品暂无章节目录。</li>
            </ol>
          </template>
        </template>
      </div>
    </PortalLayer>
  </div>
</template>
<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { usePortal } from '../../utils/portal.js'
import LoadState from '../../components/LoadState.vue'
import PortalLayer from '../../components/PortalLayer.vue'
import DemandStagePanel from '../../components/demand/DemandStagePanel.vue'
import { demandStatusLabel, money, dateText, timeText, genreLabel, formatHours, taskTypeLabel, taskTypeDeliverHint } from '../../utils/demand.js'
import { mediaUrl } from '../../utils/avatarUrl.js'
const { api, user, handleError } = usePortal()
const route = useRoute()
const demandId = computed(() => Number(route.params.id))
const demand = ref(null)
const panel = ref(null)
const pending = ref(true)
const error = ref('')
const busy = ref(false)
const srcVisible = ref(false)
const srcPending = ref(false)
const srcError = ref('')
const source = ref(null)
const srcOpened = reactive({})
const taskTypeValue = computed(() => demand.value?.taskType || 'script')
const isOwner = computed(() => !!demand.value && !!user.value?.userId && String(demand.value.acceptedCreatorId) === String(user.value.userId))
// 平台代发即视为款项到位，广场上能看到的 open 单就是可接的单
const canClaim = computed(() => demand.value?.status === 'open')
const tagList = computed(() => String(demand.value?.tags || '').split(/[,，]/).map(t => t.trim()).filter(Boolean))
const statusTone = computed(() => ({ open: 'warn', in_progress: 'info', selected: 'info', completed: 'ok', closed: 'off', failed: 'danger' }[demand.value?.status] || 'off'))
async function load() {
  if (!demandId.value) { error.value = '任务编号无效'; pending.value = false; return }
  pending.value = !demand.value; error.value = ''
  try { demand.value = await api.value.getDemand(demandId.value) }
  catch (failure) { error.value = failure.message || '任务加载失败'; await handleError(failure) }
  finally { pending.value = false }
}
// 先到先得的原子抢单：并发下只有一人命中，其余按后端文案提示另选任务
async function doClaim() {
  if (busy.value) return
  busy.value = true
  try {
    await api.value.claimDemand(demand.value.demandId)
    ElMessage.success('接单成功，首轮计时开始')
    await load()
    await panel.value?.reload()
  } catch (failure) {
    if (failure?.code === 403) ElMessage.warning('请先开通创作者资格再接单')
    else await handleError(failure)
  } finally { busy.value = false }
}
async function openChat() {
  try { await api.value.demandChatSession(demand.value.demandId); ElMessage.success('会话已就绪，可在「会话」面板沟通') }
  catch (failure) { if (failure?.code === 403) ElMessage.warning('请先开通创作者资格再沟通'); else await handleError(failure) }
}
// 源剧本正文按行分段渲染：后端已转纯文本，这里用文本插值而非 v-html，不把正文当 HTML 执行
const paragraphs = chapter => String(chapter?.content || '').split(/\n+/).map(line => line.trim()).filter(Boolean)
async function loadSource() {
  srcPending.value = true; srcError.value = ''
  try {
    const result = await api.value.sourceScript(demand.value.demandId)
    source.value = { ...result, chapters: result?.chapters || [] }
    Object.keys(srcOpened).forEach(key => delete srcOpened[key])
  } catch (failure) {
    source.value = null
    srcError.value = failure.message || '源剧本加载失败'
    await handleError(failure)
  } finally { srcPending.value = false }
}
function openSource() {
  srcVisible.value = true
  loadSource()
}
onMounted(load)
</script>
<style scoped>
.demand-detail { padding: 10px 0 30px }
.back { margin-bottom: 12px }
.dd-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 18px; flex-wrap: wrap }
.dd-head h2 { margin: 0 0 8px; font-size: 19px }
.dd-tags { display: flex; gap: 7px; flex-wrap: wrap; align-items: center }
.dd-status { padding: 1px 10px; border-radius: 10px; font-size: 12px; font-weight: 500; background: #f4f4f5; color: #909399 }
.dd-status[data-tone="warn"] { background: #fdf6ec; color: #e6a23c }
.dd-status[data-tone="info"] { background: #ecf5ff; color: #409eff }
.dd-status[data-tone="ok"] { background: #f0f9eb; color: #67c23a }
.dd-status[data-tone="danger"] { background: #fef0f0; color: #f56c6c }
.chip-lite { border: 1px solid var(--rule-2, #dcdfe6); border-radius: 12px; padding: 1px 10px; font-size: 12px; color: var(--ink-2, #606266) }
.chip-type { border-color: var(--indigo, #409eff); color: var(--indigo, #409eff); background: var(--indigo-wash, #ecf5ff) }
.chip-type[data-type="script_storyboard"] { border-color: var(--ochre, #e6a23c); color: var(--ochre, #e6a23c); background: var(--ochre-w, #fdf6ec) }
.chip-type[data-type="storyboard"] { border-color: var(--bamboo, #67c23a); color: var(--bamboo, #67c23a); background: var(--bamboo-w, #f0f9eb) }
.dd-money { text-align: right }
.dd-money b { display: block; font-size: 22px; color: var(--cinnabar, #f56c6c) }
.dd-money span { font-size: 12px; color: var(--ink-3, #909399) }
.dd-info { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 10px 18px; margin: 16px 0; padding: 14px 16px; border: 1px solid var(--rule, #ebeef5); border-radius: 8px; background: #fcfbf8 }
.dd-info > div { display: flex; gap: 8px; font-size: 13px; min-width: 0 }
.dd-info .dd-wide { grid-column: 1 / -1 }
.dd-info dt { color: var(--ink-3, #909399); flex: none }
/* 任务编号这类长串不换行会挤进相邻格子造成字段粘连 */
.dd-info dd { margin: 0; min-width: 0; overflow-wrap: anywhere; color: var(--ink, #303133) }
.dd-fail { margin: 0 0 12px; padding: 9px 12px; border-radius: 6px; background: #fef0f0; color: #f56c6c; font-size: 13px }
.dd-block { margin-bottom: 14px }
.dd-block h3, .dd-section-title { margin: 0 0 8px; font-size: 15px }
.dd-requirement { margin: 0; white-space: pre-wrap; line-height: 1.8; font-size: 13.5px; color: var(--ink-2, #606266) }
.dd-actions { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin: 6px 0 16px }
.dd-src-acts { margin: 8px 0 0 }
.src-split { margin-left: 10px }
/* 源剧本抽屉 */
.src-view { display: flex; flex-direction: column; gap: 8px }
.src-file { margin: 0; font-size: 13px }
.src-title { margin: 0; font-size: 17px }
.src-summary { margin: 0; font-size: 13px; line-height: 1.7; color: var(--ink-2, #606266) }
.src-chapters { list-style: none; margin: 6px 0 0; padding: 0 }
.src-chapter { border: 1px solid var(--rule, #ebeef5); border-radius: 6px; margin-bottom: 8px; background: #fff }
.src-chapter-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 9px 12px; font-size: 13px }
.src-toggle { border: 0; background: none; padding: 0; font-size: 12px; color: var(--indigo, #409eff); cursor: pointer }
.src-content { padding: 4px 14px 12px; border-top: 1px dashed var(--rule, #ebeef5); font-size: 14px; line-height: 1.9; color: var(--ink-2, #5c5850) }
.src-content p { margin: 8px 0 0; white-space: pre-wrap }
.dd-owned { color: #67c23a }
.dd-actions .note { margin: 0; flex: 1 1 100%; }
.dd-section-title { margin-top: 22px; padding-top: 16px; border-top: 1px solid var(--rule, #ebeef5) }
.dialog-body { display: flex; flex-direction: column; gap: 12px }
.dialog-foot { display: flex; justify-content: flex-end }
</style>
