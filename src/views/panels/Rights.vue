<template>
  <PortalLayer v-model="visible" title="版权与收益" wide>
    <PortalTabs v-model="tab" :items="tabs" drawer label="版权与收益分类" />
    <div class="panel-content">
      <div class="note info">{{ notes[tab] }}</div>
      <ApplyPanel v-if="tab === 'apply'" @open-cert="openCert" />
      <AssetsPanel v-else-if="tab === 'assets'" />
      <CertPanel v-else-if="tab === 'certs'" ref="certPanelRef" />
      <DeliveryPanel v-else-if="tab === 'delivery'" ref="deliveryPanelRef" />
      <SealPanel v-else-if="tab === 'seal'" />
      <SettlePanel v-else-if="tab === 'settle'" />
      <WithdrawPanel v-else-if="tab === 'withdraw'" />
    </div>
  </PortalLayer>
</template>
<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import PortalLayer from '../../components/PortalLayer.vue'
import PortalTabs from '../../components/PortalTabs.vue'
import SealPanel from './seal/SealPanel.vue'
import ApplyPanel from './copyright/ApplyPanel.vue'
import AssetsPanel from './copyright/AssetsPanel.vue'
import CertPanel from './copyright/CertPanel.vue'
import DeliveryPanel from './copyright/DeliveryPanel.vue'
import SettlePanel from './finance/SettlePanel.vue'
import WithdrawPanel from './finance/WithdrawPanel.vue'

const props = defineProps({ modelValue: Boolean, initialTab: String })
const emit = defineEmits(['update:modelValue'])
const visible = computed({ get: () => props.modelValue, set: value => emit('update:modelValue', value) })
const tab = ref(props.initialTab || 'apply')
const certPanelRef = ref(null)
const deliveryPanelRef = ref(null)
const tabs = [
  { value: 'apply', label: '版权申请' },
  { value: 'assets', label: '版权资产' },
  { value: 'certs', label: '电子证书' },
  { value: 'delivery', label: '版权交割' },
  { value: 'seal', label: '印章' },
  { value: 'settle', label: '结算' },
  { value: 'withdraw', label: '提现' }
]
const notes = {
  apply: '版权登记由平台统一向省版权中心提交，你只需提交申请与材料，进度会同步到这里。登记完成后作品会出现在「版权资产」与「电子证书」。',
  assets: '已发布作品的上架状态与授权历史，在这里统一管理（仅本人作品）。',
  certs: '作品登记完成后可查看电子证书。',
  delivery: '按现行交易流程：合同签署 → 买方付款后才会生成交割单。卖方上传版权证书等材料，买方确认收货后订单完成；未付款不会出现在此列表。记录与 App 同步。',
  seal: '印章用于版权材料与授权合同的签署。提交后由平台审核，通过后可用于后续合同流程。',
  settle: '作品成交后由平台结算。创作者所得为订单金额扣除平台服务费后的部分。',
  withdraw: '1 万元及以下申请后自动通过；超过 1 万元需平台人工审核，通过后 1–3 个工作日到账。'
}
watch(() => props.initialTab, value => { if (value) tab.value = value })

async function openCert(certId) {
  if (!certId) return
  tab.value = 'certs'
  await nextTick()
  certPanelRef.value?.openById?.(certId)
}

const pendingDeliveryOrderId = ref(null)

async function openDeliveryByOrder(orderId) {
  if (!orderId) return
  pendingDeliveryOrderId.value = orderId
  tab.value = 'delivery'
  await nextTick()
  if (deliveryPanelRef.value?.openByOrder) {
    const id = pendingDeliveryOrderId.value
    pendingDeliveryOrderId.value = null
    await deliveryPanelRef.value.openByOrder(id)
  }
}

watch(deliveryPanelRef, async panel => {
  if (!panel?.openByOrder || !pendingDeliveryOrderId.value) return
  const id = pendingDeliveryOrderId.value
  pendingDeliveryOrderId.value = null
  await panel.openByOrder(id)
})

defineExpose({ openDeliveryByOrder })
</script>
