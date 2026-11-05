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
            <span class="chip-lite">{{ genreLabel(demand.genreId) }}</span>
            <span v-for="tag in tagList" :key="tag" class="chip-lite">{{ tag }}</span>
          </div>
        </div>
        <!-- 预算旁边的托管说明必须取真实状态：写死「全额已托管」会在 pending_payment / 已退回时变成假话 -->
        <div class="dd-money"><b>{{ money(demand.budget) }}</b><span>任务预算 · {{ escrowStatusLabel(demand.escrowStatus) }}</span></div>
      </header>

      <dl class="dd-info">
        <div><dt>任务编号</dt><dd>{{ demand.demandNo }}</dd></div>
        <div><dt>发布方</dt><dd>{{ demand.clientName || '-' }}</dd></div>
        <div><dt>投稿截止</dt><dd>{{ dateText(demand.deadline) }}</dd></div>
        <div><dt>总集数</dt><dd>{{ Number(demand.totalEpisodes) > 0 ? demand.totalEpisodes + ' 集 · 逐轮验收' : '未设定 · 整单时限 ' + (demand.durationHours || '-') + ' 小时' }}</dd></div>
        <div><dt>投稿数</dt><dd>{{ demand.submissionCount || 0 }}</dd></div>
        <div><dt>托管状态</dt><dd>{{ escrowStatusLabel(demand.escrowStatus) }}（{{ money(demand.escrowAmount) }}）</dd></div>
        <div><dt>我的押金</dt><dd>{{ depositStatusLabel(demand.depositStatus) }}<template v-if="Number(demand.depositAmount) > 0">（{{ money(demand.depositAmount) }}）</template></dd></div>
        <div v-if="isOwner"><dt>接单人</dt><dd>我 · {{ timeText(demand.acceptedAt) }} 接单</dd></div>
      </dl>

      <p v-if="demand.status === 'failed' && demand.failReason" class="dd-fail">{{ demand.failReason }}</p>

      <section class="dd-block">
        <h3>需求描述</h3>
        <p class="dd-requirement">{{ demand.requirement || '发布者未填写详细需求' }}</p>
      </section>
      <section v-if="demand.contactInfo" class="dd-block">
        <h3>联系方式</h3>
        <p class="dd-requirement">{{ demand.contactInfo }}</p>
      </section>

      <section v-if="!isOwner" class="dd-actions">
        <template v-if="canClaim">
          <button class="btn" :disabled="busy" @click="openDeposit">付押金接单（{{ depositText }}）</button>
          <button class="btn quiet" :disabled="busy" @click="openSubmit">投稿等选标</button>
          <button class="btn ghost" :disabled="busy" @click="openChat">联系发布方</button>
        </template>
        <p v-else-if="demand.status === 'open' && demand.escrowStatus !== 'escrowed'" class="note">该任务尚未完成托管付款，暂不可接单；发布方付完托管款后会出现在任务广场。</p>
        <p v-else-if="demand.status === 'open'" class="note">该任务当前不可接单，可在「我的投稿」查看你的处理结果或另选任务。</p>
        <p v-else class="note">任务已{{ demandStatusLabel(demand.status) }}，不能再接单或投稿。</p>
      </section>
      <p v-else class="note dd-owned">你已接下此任务，押金 {{ money(demand.depositAmount) }} 在全部轮次验收通过后退还；逾期未通过将被没收。</p>

      <h3 class="dd-section-title">验收进度</h3>
      <DemandStagePanel ref="panel" :demand="demand" :is-owner="isOwner" @changed="load" />
    </template>

    <PortalLayer v-model="payVisible" title="付押金接单" modal>
      <div class="pay-body">
        <p class="cost">押金 {{ payAmountText }}（预算的 10%，以后端返回金额为准），沙箱收款不产生真实资金。</p>
        <p class="cost">支付成功并查单确认后即视为接单成功，首轮验收计时同步开始。</p>
        <img v-if="payQr" :src="payQr" alt="支付宝沙箱押金收款二维码" width="220" height="220">
        <p v-if="payMessage" class="cost pay-message">{{ payMessage }}</p>
        <button class="btn" :disabled="payChecking" @click="checkDeposit">{{ payChecking ? '查询中…' : '我已完成支付' }}</button>
      </div>
    </PortalLayer>

    <PortalLayer v-model="submitVisible" title="投稿" modal>
      <div class="dialog-body">
        <label class="field">投稿作品
          <select v-model.number="submitForm.workId">
            <option :value="null">选择您的作品</option>
            <option v-for="work in works" :key="work.workId" :value="Number(work.workId)">{{ work.title || ('作品#' + work.workId) }}</option>
          </select>
        </label>
        <label class="field">附言（可选）<textarea v-model="submitForm.message" rows="4" placeholder="介绍您的作品与该需求的适配度…"></textarea></label>
        <div class="dialog-foot"><button class="btn" :disabled="busy" @click="doSubmit">{{ busy ? '提交中…' : '确认投稿' }}</button></div>
      </div>
    </PortalLayer>
  </div>
</template>
<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import QRCode from 'qrcode'
import { usePortal } from '../../utils/portal.js'
import LoadState from '../../components/LoadState.vue'
import PortalLayer from '../../components/PortalLayer.vue'
import DemandStagePanel from '../../components/demand/DemandStagePanel.vue'
import { demandStatusLabel, escrowStatusLabel, depositStatusLabel, money, dateText, timeText, genreLabel } from '../../utils/demand.js'
const { api, user, handleError } = usePortal()
const route = useRoute()
const demandId = computed(() => Number(route.params.id))
const demand = ref(null)
const works = ref([])
const panel = ref(null)
const pending = ref(true)
const error = ref('')
const busy = ref(false)
const payVisible = ref(false)
const payQr = ref('')
const payAmount = ref(0)
const payMessage = ref('')
const payChecking = ref(false)
const submitVisible = ref(false)
const submitForm = reactive({ workId: null, message: '' })
const isOwner = computed(() => !!demand.value && !!user.value?.userId && String(demand.value.acceptedCreatorId) === String(user.value.userId))
const canClaim = computed(() => demand.value?.status === 'open' && demand.value?.escrowStatus === 'escrowed')
const tagList = computed(() => String(demand.value?.tags || '').split(/[,，]/).map(t => t.trim()).filter(Boolean))
const statusTone = computed(() => ({ open: 'warn', in_progress: 'info', selected: 'info', completed: 'ok', closed: 'off', failed: 'danger' }[demand.value?.status] || 'off'))
// 押金 = floor(预算/10)，展示以后端 payDeposit 返回值为准，这里只是接单前的预告值
const depositText = computed(() => money(Math.floor((Number(demand.value?.budget) || 0) / 10)))
const payAmountText = computed(() => money(payAmount.value))
async function load() {
  if (!demandId.value) { error.value = '任务编号无效'; pending.value = false; return }
  pending.value = !demand.value; error.value = ''
  try { demand.value = await api.value.getDemand(demandId.value) }
  catch (failure) { error.value = failure.message || '任务加载失败'; await handleError(failure) }
  finally { pending.value = false }
}
async function openDeposit() {
  busy.value = true
  try {
    const result = await api.value.payDeposit(demand.value.demandId)
    if (!result?.qrCode) throw Object.assign(new Error('未取到沙箱支付二维码'), { code: 500 })
    payAmount.value = Number(result.amount) || 0
    payQr.value = await QRCode.toDataURL(result.qrCode, { width: 220, margin: 2 })
    payMessage.value = ''
    payVisible.value = true
  } catch (failure) {
    if (failure?.code === 403) ElMessage.warning('请先开通创作者资格再接单')
    else if (failure?.code === 500) ElMessage.warning('沙箱支付暂不可用，请稍后再试')
    else await handleError(failure)
  } finally { busy.value = false }
}
async function checkDeposit() {
  if (payChecking.value) return
  payChecking.value = true
  try {
    const result = await api.value.confirmDeposit(demand.value.demandId)
    if (result?.claimed) {
      payVisible.value = false
      ElMessage.success('押金已入账，接单成功，首轮计时开始')
      await load()
      await panel.value?.reload()
    } else if (result?.paid) {
      payMessage.value = result.reason || '押金已扣款但接单未成功，请联系平台核对'
    } else {
      payMessage.value = result?.reason || '尚未查询到支付成功，请完成支付后重试'
    }
  } catch (failure) { payMessage.value = failure.message || '查询失败，请稍后重试' }
  finally { payChecking.value = false }
}
function openSubmit() {
  Object.assign(submitForm, { workId: null, message: '' })
  submitVisible.value = true
  api.value.listWorks().then(items => { works.value = items || [] }).catch(() => { works.value = [] })
}
async function doSubmit() {
  if (!submitForm.workId) { ElMessage.warning('请选择投稿作品'); return }
  busy.value = true
  try {
    await api.value.submitToDemand(demand.value.demandId, { workId: submitForm.workId, message: submitForm.message?.trim() || undefined })
    submitVisible.value = false
    ElMessage.success('投稿成功，等待发布者选标')
    await load()
  } catch (failure) { await handleError(failure) } finally { busy.value = false }
}
async function openChat() {
  try { await api.value.demandChatSession(demand.value.demandId); ElMessage.success('会话已就绪，可在「会话」面板沟通') }
  catch (failure) { if (failure?.code === 403) ElMessage.warning('请先开通创作者资格再沟通'); else await handleError(failure) }
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
.dd-money { text-align: right }
.dd-money b { display: block; font-size: 22px; color: var(--cinnabar, #f56c6c) }
.dd-money span { font-size: 12px; color: var(--ink-3, #909399) }
.dd-info { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 10px 18px; margin: 16px 0; padding: 14px 16px; border: 1px solid var(--rule, #ebeef5); border-radius: 8px; background: #fcfbf8 }
.dd-info > div { display: flex; gap: 8px; font-size: 13px }
.dd-info dt { color: var(--ink-3, #909399); flex: none }
.dd-info dd { margin: 0; color: var(--ink, #303133) }
.dd-fail { margin: 0 0 12px; padding: 9px 12px; border-radius: 6px; background: #fef0f0; color: #f56c6c; font-size: 13px }
.dd-block { margin-bottom: 14px }
.dd-block h3, .dd-section-title { margin: 0 0 8px; font-size: 15px }
.dd-requirement { margin: 0; white-space: pre-wrap; line-height: 1.8; font-size: 13.5px; color: var(--ink-2, #606266) }
.dd-actions { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin: 6px 0 16px }
.dd-owned { color: #67c23a }
.dd-section-title { margin-top: 22px; padding-top: 16px; border-top: 1px solid var(--rule, #ebeef5) }
.pay-body { display: flex; flex-direction: column; align-items: center; gap: 10px; text-align: center }
.pay-body .cost { margin: 0; font-size: 12.5px; color: var(--ink-3, #909399) }
.pay-message { color: #e6a23c }
.dialog-body { display: flex; flex-direction: column; gap: 12px }
.dialog-foot { display: flex; justify-content: flex-end }
</style>
