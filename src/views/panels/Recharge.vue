<template>
  <component :is="embedded ? 'div' : PortalLayer" v-model="visible" title="积分充值" :wide="!embedded">
    <div class="panel-content recharge-panel">
      <LoadState :pending="loading" :error="error" :retry="load" />
      <template v-if="!loading && !error && config">
        <div class="r-balance">
          <div class="r-balance-main"><span>当前积分</span><b>{{ config.balance }}</b></div>
          <em>1 元 = {{ config.pointsPerYuan }} 积分</em>
        </div>

        <h4 class="r-title">选择充值金额</h4>
        <div class="r-plans">
          <button
            v-for="plan in config.plans"
            :key="plan.yuan"
            type="button"
            class="r-plan"
            :class="{ on: customYuan === '' && selectedPlan === plan.yuan }"
            @click="pickPlan(plan.yuan)"
          >
            <b>¥{{ plan.yuan }}</b>
            <span>{{ plan.points }} 积分</span>
          </button>
        </div>

        <label class="field r-custom">
          <span>自定义金额（{{ config.minYuan }}–{{ config.maxYuan }} 元，必须为 1 元的整数倍）</span>
          <el-input v-model="customYuan" type="text" inputmode="numeric" clearable placeholder="自定义金额" @input="onCustomInput">
            <template #prefix>¥</template>
          </el-input>
        </label>
        <p v-if="yuan > 0" class="r-convert">预计到账 <b>{{ pointsOf(yuan) }}</b> 积分</p>

        <h4 class="r-title">选择付费方式</h4>
        <div class="r-channels">
          <button
            v-for="item in channels"
            :key="item.code"
            type="button"
            class="r-channel"
            :class="{ on: channel === item.code }"
            :disabled="!item.enabled"
            @click="channel = item.code"
          >
            <i class="dot" :class="item.code === 'ALIPAY' ? 'dot-alipay' : 'dot-wechat'" />
            <span>{{ item.name }}</span>
            <em>{{ channel === item.code ? '已选择' : '选择' }}</em>
          </button>
        </div>

        <div class="r-pay">
          <div class="r-pay-amount">
            <span>应付</span>
            <b>{{ yuan > 0 ? '¥' + yuan : '—' }}</b>
            <em v-if="yuan > 0">到账 {{ pointsOf(yuan) }} 积分</em>
          </div>
          <button class="btn" type="button" :disabled="paying || !valid" @click="pay">
            {{ paying ? '支付处理中…' : '立即支付' }}
          </button>
        </div>
        <p class="r-tip">当前为模拟支付：确认后积分立即到账。微信 / 支付宝真实通道由支付组接入，页面与订单流程保持不变。</p>

        <h4 class="r-title">最近充值</h4>
        <div v-if="orders.length" class="tbl">
          <table>
            <thead><tr><th>时间</th><th>订单号</th><th class="num">金额</th><th class="num">积分</th><th>渠道</th><th>状态</th></tr></thead>
            <tbody>
              <tr v-for="order in orders" :key="order.orderNo">
                <td>{{ order.createTime || '—' }}</td>
                <td class="mono">{{ order.orderNo }}</td>
                <td class="num">¥{{ (Number(order.amountFen) / 100).toFixed(2) }}</td>
                <td class="num">{{ order.points }}</td>
                <td>{{ order.channel === 'ALIPAY' ? '支付宝' : '微信支付' }}</td>
                <td>{{ order.status === 'PAID' ? '已到账' : order.status === 'CANCELLED' ? '已取消' : '待支付' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-else class="r-tip">还没有充值记录。</p>
      </template>
    </div>
  </component>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { usePortal } from '../../utils/portal.js'
import PortalLayer from '../../components/PortalLayer.vue'
import LoadState from '../../components/LoadState.vue'

const props = defineProps({ modelValue: Boolean, initialTab: String, embedded: Boolean })
const emit = defineEmits(['update:modelValue'])
const { api, user, handleError } = usePortal()
const visible = computed({ get: () => props.modelValue, set: value => emit('update:modelValue', value) })

const config = ref(null)
const orders = ref([])
const loading = ref(false)
const error = ref('')
const selectedPlan = ref(0)
const customYuan = ref('')
const channel = ref('')
const paying = ref(false)

const yuan = computed(() => {
  if (customYuan.value !== '' && customYuan.value !== null) return Number(customYuan.value) || 0
  return selectedPlan.value
})
const valid = computed(() => {
  if (!config.value) return false
  const value = yuan.value
  return value >= config.value.minYuan && value <= config.value.maxYuan && value % 1 === 0
})
const channels = computed(() => config.value?.channels?.length
  ? config.value.channels
  : [{ code: 'WECHAT', name: '微信支付', enabled: true }, { code: 'ALIPAY', name: '支付宝', enabled: true }])

function pointsOf(value) {
  return config.value ? value * config.value.pointsPerYuan : 0
}
function pickPlan(value) {
  selectedPlan.value = value
  customYuan.value = ''
}
function onCustomInput(value) {
  const digits = String(value ?? '').replace(/\D/g, '')
  customYuan.value = digits
}

async function load() {
  if (!api.value?.getRechargeConfig || !user.value?.userId) return
  loading.value = true
  error.value = ''
  try {
    config.value = await api.value.getRechargeConfig(user.value.userId)
    const result = await api.value.listRechargeOrders(user.value.userId, 10)
    orders.value = result?.orders || []
    if (!channel.value || !channels.value.some(item => item.code === channel.value)) {
      channel.value = channels.value.find(item => item.enabled)?.code || ''
    }
  } catch (failure) {
    error.value = failure.message || '充值信息加载失败'
    await handleError(failure)
  } finally {
    loading.value = false
  }
}

async function pay() {
  if (!valid.value) {
    ElMessage.warning(`充值金额需在 ${config.value.minYuan}–${config.value.maxYuan} 元之间，且为 1 元的整数倍`)
    return
  }
  paying.value = true
  try {
    const order = await api.value.createRechargeOrder({ userId: user.value.userId, yuan: yuan.value, channel: channel.value })
    await ElMessageBox.confirm(
      `支付金额 ¥${yuan.value}，到账 ${order.points} 积分，付费方式为${channel.value === 'ALIPAY' ? '支付宝' : '微信支付'}。当前为模拟支付，确认后积分立即入账。`,
      '确认支付',
      { confirmButtonText: '确认支付', cancelButtonText: '取消', type: 'info' }
    )
    const result = await api.value.mockPayRecharge({ userId: user.value.userId, orderNo: order.orderNo })
    ElMessage.success(`充值成功 +${result.points} 积分，当前余额 ${result.balance}`)
    selectedPlan.value = 0
    customYuan.value = ''
    window.dispatchEvent(new CustomEvent('recharge-success'))
    await load()
  } catch (failure) {
    if (failure === 'cancel' || failure === 'close' || failure?.message === 'cancel') return
    await handleError(failure)
  } finally {
    paying.value = false
  }
}

watch(() => props.modelValue, value => { if (value) load() }, { immediate: true })
</script>

<style scoped>
.recharge-panel { display: grid; gap: 12px; }
.r-balance { display: flex; align-items: center; justify-content: space-between; padding: 16px 18px; border-radius: 12px; background: linear-gradient(135deg, #254e90, #1d3e73); color: #fff; }
.r-balance-main { display: flex; align-items: baseline; gap: 10px; }
.r-balance-main span { font-size: 12px; opacity: .85; }
.r-balance-main b { font-size: 26px; letter-spacing: .5px; }
.r-balance em { font-style: normal; font-size: 12px; padding: 4px 10px; border-radius: 999px; background: rgba(255, 255, 255, .16); }
.r-title { margin: 6px 0 0; font-size: 14px; font-weight: 600; color: #1f2329; }
.r-plans { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.r-plan { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 12px 8px; border: 1px solid #e5e6eb; border-radius: 10px; background: #fff; cursor: pointer; transition: all .15s; }
.r-plan b { font-size: 18px; color: #1f2329; }
.r-plan span { font-size: 12px; color: #86909c; }
.r-plan.on { border-color: #254e90; background: #eaf1fa; }
.r-plan.on b { color: #254e90; }
.r-custom span { font-size: 12px; color: #86909c; }
.r-custom :deep(.el-input__wrapper) { border-radius: 8px; background: #fff; padding: 1px 11px; }
.r-custom :deep(.el-input__inner) {
  border: 0;
  background: transparent;
  box-shadow: none;
  padding: 0;
  font-size: 13.5px;
}
.r-custom :deep(.el-input__inner:focus) { border: 0; box-shadow: none; }
.r-custom :deep(.el-input__prefix) { color: #86909c; }
.r-convert { margin: 0; font-size: 13px; color: #254e90; }
.r-convert b { font-size: 15px; }
.r-channels { display: flex; gap: 10px; flex-wrap: wrap; }
.r-channel { display: flex; align-items: center; gap: 8px; padding: 10px 16px; border: 1px solid #e5e6eb; border-radius: 10px; background: #fff; cursor: pointer; }
.r-channel span { font-size: 14px; color: #1f2329; }
.r-channel em { font-style: normal; font-size: 12px; color: #86909c; }
.r-channel.on { border-color: #254e90; background: #eaf1fa; }
.r-channel.on em { color: #254e90; }
.r-channel:disabled { opacity: .5; cursor: not-allowed; }
.dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
.dot-wechat { background: #07c160; }
.dot-alipay { background: #1677ff; }
.r-pay { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 16px; border: 1px solid #e5e6eb; border-radius: 12px; background: #fafbfc; }
.r-pay-amount { display: flex; align-items: baseline; gap: 8px; }
.r-pay-amount span { font-size: 13px; color: #4e5969; }
.r-pay-amount b { font-size: 22px; color: #1f2329; }
.r-pay-amount em { font-style: normal; font-size: 12px; color: #254e90; }
.r-tip { margin: 0; font-size: 12px; color: #86909c; line-height: 1.6; }
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
</style>
