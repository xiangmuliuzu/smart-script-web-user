<template>
  <component :is="embedded ? 'div' : PortalLayer" v-model="visible" title="版权与收益" :wide="!embedded">
    <PortalTabs v-model="tab" :items="tabs" :drawer="!embedded" label="版权与收益分类" />
    <div class="panel-content">
      <ApplyPanel v-if="tab === 'apply'" :works-for-covers="works" @open-cert="openCert" />
      <AssetsPanel v-else-if="tab === 'assets'" :works-for-covers="works" />
      <CertPanel v-else-if="tab === 'certs'" ref="certPanelRef" :works-for-covers="works" />
      <DeliveryPanel v-else-if="tab === 'delivery'" ref="deliveryPanelRef" :works-for-covers="works" />
      <SealPanel v-else-if="tab === 'seal'" />
      <SettlePanel v-else-if="tab === 'settle'" />
      <WithdrawPanel v-else-if="tab === 'withdraw'" />
    </div>
  </component>
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

const props = defineProps({ modelValue: Boolean, initialTab: String, embedded: Boolean, works: { type: Array, default: () => [] } })
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
