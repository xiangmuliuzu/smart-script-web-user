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
        <div><dt>接单截止</dt><dd>{{ dateText(demand.deadline) }}</dd></div>
        <div><dt>总集数</dt><dd>{{ Number(demand.totalEpisodes) > 0 ? demand.totalEpisodes + ' 集 · 逐轮验收' : '未设定 · 整单时限 ' + formatHours(demand.durationHours) }}</dd></div>
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
          <button class="btn" :disabled="busy" @click="openDepositSandbox()">{{ busy ? '获取收款码…' : `支付宝扫码付押金 ¥${depositYuan} 接单` }}</button>
          <button class="btn ghost" :disabled="busy" @click="openChat">联系发布方</button>
          <button class="btn quiet" :disabled="busy" @click="doDepositPass">开发环境一键直通接单</button>
        </template>
        <p v-else-if="demand.status === 'open' && demand.escrowStatus !== 'escrowed'" class="note">该任务尚未完成托管付款，暂不可接单；发布方付完托管款后会出现在任务广场。</p>
        <p v-else-if="demand.status === 'open'" class="note">该任务当前不可接单，请另选其他任务。</p>
        <p v-else class="note">任务已{{ demandStatusLabel(demand.status) }}，不能再接单。</p>
      </section>
      <p v-else class="note dd-owned">你已接下此任务，押金 {{ money(demand.depositAmount) }} 在全部轮次验收通过后退还；逾期未通过将被没收。</p>

      <h3 class="dd-section-title">验收进度</h3>
      <DemandStagePanel ref="panel" :demand="demand" :is-owner="isOwner" @changed="load" />
    </template>

    <PortalLayer v-model="payVisible" title="支付宝沙箱扫码付押金" modal>
      <div class="pay-body">
        <p class="cost">押金 {{ payAmountText }}，金额以后端返回值为准；沙箱收款不产生真实资金。</p>
        <p class="cost">支付成功并查单确认后即视为接单成功，首轮验收计时同步开始。</p>
        <img v-if="payQr" :src="payQr" alt="支付宝沙箱押金收款二维码" width="220" height="220">
        <button class="btn pay-refresh" :disabled="payRefreshing" @click="refreshDepositQr">{{ payRefreshing ? '生成新码中…' : '刷新二维码' }}</button>
        <p class="cost pay-message">{{ payMessage || '等待支付结果…扫码完成后会自动确认' }}</p>
        <button class="btn" :disabled="payChecking" @click="checkDeposit">{{ payChecking ? '查询中…' : '我已完成支付' }}</button>
      </div>
    </PortalLayer>
  </div>
</template>
<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import QRCode from 'qrcode'
import { usePortal } from '../../utils/portal.js'
import LoadState from '../../components/LoadState.vue'
import PortalLayer from '../../components/PortalLayer.vue'
import DemandStagePanel from '../../components/demand/DemandStagePanel.vue'
import { demandStatusLabel, escrowStatusLabel, depositStatusLabel, money, dateText, timeText, genreLabel, formatHours } from '../../utils/demand.js'
const { api, user, handleError } = usePortal()
const route = useRoute()
const demandId = computed(() => Number(route.params.id))
const demand = ref(null)
const panel = ref(null)
const pending = ref(true)
const error = ref('')
const busy = ref(false)
const payVisible = ref(false)
const payQr = ref('')
const payAmount = ref(0)
const payMessage = ref('')
const payChecking = ref(false)
const payRefreshing = ref(false)
const isOwner = computed(() => !!demand.value && !!user.value?.userId && String(demand.value.acceptedCreatorId) === String(user.value.userId))
const canClaim = computed(() => demand.value?.status === 'open' && demand.value?.escrowStatus === 'escrowed')
const tagList = computed(() => String(demand.value?.tags || '').split(/[,，]/).map(t => t.trim()).filter(Boolean))
const statusTone = computed(() => ({ open: 'warn', in_progress: 'info', selected: 'info', completed: 'ok', closed: 'off', failed: 'danger' }[demand.value?.status] || 'off'))
// 押金 = floor(预算/10)，与 APP 按钮预告口径一致；实际扣款金额与接单结果以后端查单响应为准
const depositYuan = computed(() => Math.floor((Number(demand.value?.budget) || 0) / 1000))
const payAmountText = computed(() => money(payAmount.value))
async function load() {
  if (!demandId.value) { error.value = '任务编号无效'; pending.value = false; return }
  pending.value = !demand.value; error.value = ''
  try { demand.value = await api.value.getDemand(demandId.value) }
  catch (failure) { error.value = failure.message || '任务加载失败'; await handleError(failure) }
  finally { pending.value = false }
}
// 备用通路：一键直通付押金并接单（沙箱未配置或被护栏拒绝时使用）
async function doDepositPass() {
  if (busy.value) return
  busy.value = true
  try {
    await api.value.devPassDeposit(demand.value.demandId)
    ElMessage.success('押金已入账，接单成功，首轮计时开始')
    await load()
    await panel.value?.reload()
  } catch (failure) {
    if (failure?.code === 403) ElMessage.warning('请先开通创作者资格再接单')
    else if (failure?.code === 400) ElMessage.warning(failure.message || '开发直通不可用，请改用支付宝沙箱扫码付款')
    else await handleError(failure)
  } finally { busy.value = false }
}
// 主路径：支付宝沙箱扫码付押金并接单，收款码打开后每 3 秒静默查单（与 APP 弹窗同口径）。
// refresh=true 让服务端换新商户单号重出码，用于旧码失效后手动/自动换码。
async function openDepositSandbox({ refresh = false } = {}) {
  busy.value = true
  try {
    const result = await api.value.payDeposit(demand.value.demandId, refresh)
    if (result?.paid) {
      // 旧收款码其实已被扫付，服务端已就地结算接单，这里按成功收尾
      stopPayPolling()
      payVisible.value = false
      ElMessage.success('押金此前已支付，请查看任务最新状态')
      await load()
      await panel.value?.reload()
      return
    }
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
async function refreshDepositQr() {
  if (payRefreshing.value) return
  payRefreshing.value = true
  payMessage.value = '正在生成新的收款码…'
  try { await openDepositSandbox({ refresh: true }) } finally { payRefreshing.value = false }
}
let payTimer = null
let payRotateTimer = null
function stopPayPolling() { if (payTimer) { clearInterval(payTimer); payTimer = null } }
watch(payVisible, visible => {
  stopPayPolling()
  if (payRotateTimer) { clearInterval(payRotateTimer); payRotateTimer = null }
  if (visible) {
    payTimer = setInterval(() => { checkDeposit({ silent: true }) }, 3000)
    // 沙箱收款码有有效期，弹窗停留超过 5 分钟自动换一张新码（与 APP 同口径）
    payRotateTimer = setInterval(() => { refreshDepositQr() }, 5 * 60 * 1000)
  }
})
onUnmounted(() => { stopPayPolling(); if (payRotateTimer) clearInterval(payRotateTimer) })
async function checkDeposit({ silent = false } = {}) {
  if (payChecking.value) return
  if (!silent) { payChecking.value = true; payMessage.value = '' }
  try {
    const result = await api.value.confirmDeposit(demand.value.demandId)
    if (result?.claimed) {
      stopPayPolling()
      payVisible.value = false
      ElMessage.success('押金已入账，接单成功，首轮计时开始')
      await load()
      await panel.value?.reload()
    } else if (result?.paid) {
      // 扣到钱却没接成功（多半被抢先），继续轮询没有意义
      stopPayPolling()
      payMessage.value = result.reason || '押金已扣款但接单未成功，请联系平台核对'
    } else if (result?.closed) {
      // 支付宝侧旧单已关闭，当前码再怎么扫也不会到账，自动换一张新码
      await refreshDepositQr()
    } else if (result?.reason) {
      stopPayPolling()
      payMessage.value = result.reason
    } else if (!silent) payMessage.value = '尚未查询到支付成功，请完成支付后重试'
  } catch (failure) { if (!silent) payMessage.value = failure.message || '查询失败，请稍后重试' }
  finally { if (!silent) payChecking.value = false }
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
.dd-info > div { display: flex; gap: 8px; font-size: 13px; min-width: 0 }
.dd-info dt { color: var(--ink-3, #909399); flex: none }
/* 任务编号这类长串不换行会挤进相邻格子造成字段粘连 */
.dd-info dd { margin: 0; min-width: 0; overflow-wrap: anywhere; color: var(--ink, #303133) }
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
.pay-refresh { padding: 4px 16px; font-size: 12px }
.dialog-body { display: flex; flex-direction: column; gap: 12px }
.dialog-foot { display: flex; justify-content: flex-end }
</style>
