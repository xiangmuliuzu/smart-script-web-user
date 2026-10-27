<template>
  <div class="withdraw-panel">
    <LoadState :pending="overviewPending && !overview" :error="overviewError" :retry="loadOverview" />
    <div v-if="overview && !overviewError" class="stats finance-stats" role="group" aria-label="提现余额">
      <div class="stat" style="cursor:default"><span class="k">可提现余额</span><span class="n money">{{ yuanText(overview.availableAmount) }}</span></div>
      <div class="stat" style="cursor:default"><span class="k">已提现</span><span class="n">{{ yuanText(overview.withdrawnAmount) }}</span></div>
    </div>

    <div class="sub-head"><h3>提现申请</h3></div>
    <form class="apply-form" @submit.prevent="submit">
      <label class="field">提现方式
        <select v-model="withdrawType" :disabled="submitting">
          <option v-for="item in WITHDRAW_TYPES" :key="item.value" :value="item.value">{{ item.label }}</option>
        </select>
      </label>
      <div class="bind-row">
        <p class="bind-text">{{ bindText }}</p>
        <button class="btn quiet sm" type="button" :disabled="submitting" @click="bindVisible = true">{{ currentBind ? '更换' : '去绑定' }}</button>
      </div>
      <p class="cost">当前为演示绑定，不会调用真实支付渠道。账户信息仅保存在本机。</p>
      <label class="field">提现金额（元）
        <input v-model.trim="amount" inputmode="decimal" maxlength="12" :disabled="submitting" placeholder="请输入大于 0 的金额" />
      </label>
      <p v-if="formError" class="note bad" role="alert">{{ formError }}</p>
      <button class="btn sm" :disabled="submitting">{{ submitting ? '提交中…' : '申请提现' }}</button>
    </form>

    <div class="sub-head sub"><h3>提现记录</h3><span class="count">{{ total }} 条</span></div>
    <div class="toolbar">
      <select v-model="statusFilter" class="toolbar-control" :disabled="listPending" @change="reloadList">
        <option value="">全部状态</option>
        <option v-for="(label, key) in WITHDRAW_STATUS" :key="key" :value="key">{{ label }}</option>
      </select>
      <button class="btn quiet sm toolbar-btn" type="button" :disabled="listPending" @click="loadList">刷新</button>
    </div>
    <LoadState :pending="listPending" :error="listError" :retry="loadList" :empty="!listPending && !listError && !list.length" empty-text="暂无提现记录" />
    <div v-if="!listPending && !listError && list.length" class="tbl">
      <table>
        <thead>
          <tr>
            <th>申请单号</th>
            <th style="width:90px">方式</th>
            <th style="width:110px" class="num">金额</th>
            <th style="width:90px">状态</th>
            <th>时间 / 说明</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in list" :key="item.withdrawId">
            <td class="num">{{ item.withdrawNo || '—' }}</td>
            <td>{{ withdrawTypeLabel(item.withdrawType) }}</td>
            <td class="num">{{ fenText(item.amount) }}</td>
            <td><span class="status-tag" :class="'tone-' + withdrawStatusTone(item.status)">{{ withdrawStatusLabel(item.status) }}</span></td>
            <td>
              <span class="num">{{ dateText(item.createdAt) }}</span>
              <p v-if="item.status === 'rejected' && item.reviewOpinion" class="cost reject-tip">{{ item.reviewOpinion }}</p>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-if="!listPending && !listError && total > pageSize" class="pager">
      <button class="btn quiet sm" type="button" :disabled="pageNum <= 1 || listPending" @click="prevPage">上一页</button>
      <span class="pager-info">第 {{ pageNum }} 页</span>
      <button class="btn quiet sm" type="button" :disabled="pageNum * pageSize >= total || listPending" @click="nextPage">下一页</button>
    </div>

    <PortalLayer v-model="bindVisible" :title="'绑定' + withdrawTypeLabel(withdrawType)" modal>
      <form class="apply-form" @submit.prevent="saveBind">
        <p class="cost">演示绑定流程，不会调用真实支付渠道。</p>
        <label class="field">姓名 / 账户名<input v-model.trim="bindForm.accountName" maxlength="100" required /></label>
        <label class="field">{{ withdrawType === 'bank' ? '银行卡号' : '账号 / 手机号' }}<input v-model.trim="bindForm.accountNo" maxlength="100" required /></label>
        <label v-if="withdrawType === 'bank'" class="field">开户行<input v-model.trim="bindForm.bankName" maxlength="100" required /></label>
        <button class="btn sm">保存绑定</button>
      </form>
    </PortalLayer>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import PortalLayer from '../../../components/PortalLayer.vue'
import LoadState from '../../../components/LoadState.vue'
import { usePortal } from '../../../utils/portal.js'
import { dateText } from '../../../utils/creator.js'
import {
  WITHDRAW_STATUS,
  WITHDRAW_TYPES,
  fenText,
  maskAccount,
  withdrawStatusLabel,
  withdrawStatusTone,
  withdrawTypeLabel,
  yuanText
} from '../../../utils/finance.js'

const BINDS_KEY = 'income_withdraw_fake_binds'
const { api, handleError } = usePortal()
const pageSize = 20
const overview = ref(null)
const overviewPending = ref(false)
const overviewError = ref('')
const list = ref([])
const total = ref(0)
const pageNum = ref(1)
const listPending = ref(false)
const listError = ref('')
const statusFilter = ref('')
const withdrawType = ref('alipay')
const amount = ref('')
const submitting = ref(false)
const formError = ref('')
const bindVisible = ref(false)
const binds = ref({})
const bindForm = reactive({ accountName: '', accountNo: '', bankName: '' })

const currentBind = computed(() => binds.value[withdrawType.value] || null)
const bindText = computed(() => {
  const bind = currentBind.value
  const label = withdrawTypeLabel(withdrawType.value)
  if (!bind) return label + '未绑定'
  return `${label}已绑定 · ${bind.accountName} ${maskAccount(bind.accountNo)}`
})

function loadBinds() {
  try {
    const raw = localStorage.getItem(BINDS_KEY)
    binds.value = raw ? JSON.parse(raw) : {}
  } catch {
    binds.value = {}
  }
}

function persistBinds() {
  localStorage.setItem(BINDS_KEY, JSON.stringify(binds.value))
}

watch(withdrawType, () => {
  const bind = currentBind.value
  bindForm.accountName = bind?.accountName || ''
  bindForm.accountNo = bind?.accountNo || ''
  bindForm.bankName = bind?.bankName || ''
})

watch(bindVisible, open => {
  if (!open) return
  const bind = currentBind.value
  bindForm.accountName = bind?.accountName || ''
  bindForm.accountNo = bind?.accountNo || ''
  bindForm.bankName = bind?.bankName || ''
})

function saveBind() {
  const next = {
    accountName: bindForm.accountName,
    accountNo: bindForm.accountNo,
    bankName: withdrawType.value === 'bank' ? bindForm.bankName : undefined
  }
  binds.value = { ...binds.value, [withdrawType.value]: next }
  persistBinds()
  bindVisible.value = false
  ElMessage.success('已保存绑定（仅本机）')
}

async function loadOverview() {
  overviewPending.value = true
  overviewError.value = ''
  try {
    overview.value = await api.value.getIncomeOverview() || {}
  } catch (failure) {
    overview.value = null
    overviewError.value = failure.message
    await handleError(failure)
  } finally {
    overviewPending.value = false
  }
}

async function loadList() {
  listPending.value = true
  listError.value = ''
  try {
    const result = await api.value.listWithdraws({
      status: statusFilter.value || undefined,
      pageNum: pageNum.value,
      pageSize
    })
    list.value = Array.isArray(result) ? result : (result?.list || result?.rows || [])
    total.value = Number(result?.total ?? list.value.length) || 0
  } catch (failure) {
    list.value = []
    total.value = 0
    listError.value = failure.message
    await handleError(failure)
  } finally {
    listPending.value = false
  }
}

function reloadList() {
  pageNum.value = 1
  return loadList()
}

function prevPage() {
  if (pageNum.value <= 1) return
  pageNum.value -= 1
  loadList()
}

function nextPage() {
  if (pageNum.value * pageSize >= total.value) return
  pageNum.value += 1
  loadList()
}

async function submit() {
  formError.value = ''
  const bind = currentBind.value
  if (!bind) {
    formError.value = '请先绑定' + withdrawTypeLabel(withdrawType.value) + '账户'
    return
  }
  const value = Number(amount.value)
  if (!Number.isFinite(value) || value <= 0) {
    formError.value = '请输入有效提现金额'
    return
  }
  if (!/^\d+(\.\d{1,2})?$/.test(amount.value)) {
    formError.value = '提现金额最多两位小数'
    return
  }
  submitting.value = true
  try {
    await api.value.applyWithdraw({
      amount: value,
      withdrawType: withdrawType.value,
      accountName: bind.accountName,
      accountNo: bind.accountNo,
      bankName: withdrawType.value === 'bank' ? bind.bankName : undefined,
      clientToken: `wd_${Date.now()}_${value.toFixed(2)}`.slice(0, 64)
    })
    ElMessage.success('提现申请已提交')
    amount.value = ''
    await Promise.all([loadOverview(), reloadList()])
  } catch (failure) {
    formError.value = failure.message
    await handleError(failure)
  } finally {
    submitting.value = false
  }
}

onMounted(async () => {
  loadBinds()
  await loadOverview()
  await loadList()
})
</script>

<style scoped>
.finance-stats { margin: 4px 0 18px }
.withdraw-panel .sub-head {
  display: flex; align-items: center; gap: 10px;
  padding-bottom: 8px; margin-bottom: 12px; border-bottom: 1px solid var(--rule, #eee);
}
.withdraw-panel .sub-head h3 { margin: 0; flex: 1; font-size: 15px }
.withdraw-panel .sub-head.sub { margin-top: 22px }
.withdraw-panel .count { color: var(--ink-3, #999); font-size: 12.5px }
.apply-form { display: grid; gap: 14px; max-width: 480px }
.bind-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 12px; background: var(--paper, #fafafa); border: 1px solid var(--rule, #eee); border-radius: 8px }
.bind-text { margin: 0; font-size: 13px; color: var(--ink-2, #666) }
.withdraw-panel .cost { margin: 0; color: var(--ink-3, #999); font-size: 12px }
.withdraw-panel .toolbar { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 14px }
.withdraw-panel .toolbar-control {
  box-sizing: border-box; height: 32px; margin: 0; padding: 0 10px;
  font: inherit; font-size: 13px; line-height: 30px;
  color: var(--ink, #333); background: var(--paper-2, #fff);
  border: 1px solid var(--rule-2, #d9d9d9); border-radius: var(--radius, 4px);
}
.withdraw-panel select.toolbar-control { width: 128px; appearance: auto }
.withdraw-panel .toolbar-btn { box-sizing: border-box; height: 32px; padding: 0 12px !important; display: inline-flex; align-items: center }
.withdraw-panel .tbl table { width: 100%; border-collapse: collapse }
.withdraw-panel .tbl th, .withdraw-panel .tbl td { padding: 12px 10px; border-bottom: 1px solid var(--rule, #eee); text-align: left; vertical-align: top }
.withdraw-panel .tbl th { font-size: 12px; color: var(--ink-3, #999); font-weight: 500 }
.withdraw-panel .tbl .num { font-variant-numeric: tabular-nums; color: var(--ink-2, #666); font-size: 13px }
.reject-tip { margin: 4px 0 0; color: #f56c6c }
.status-tag { display: inline-block; padding: 1px 8px; border-radius: 10px; font-size: 12px; font-weight: 500 }
.tone-wait { background: #fdf6ec; color: #e6a23c }
.tone-ok { background: #f0f9eb; color: #67c23a }
.tone-bad { background: #fef0f0; color: #f56c6c }
.tone-off { background: #f4f4f5; color: #909399 }
.pager { display: flex; align-items: center; justify-content: flex-end; gap: 10px; margin-top: 14px }
.pager-info { font-size: 12.5px; color: var(--ink-3, #999) }
</style>
