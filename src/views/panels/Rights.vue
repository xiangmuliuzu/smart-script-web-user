<template>
  <component :is="embedded ? 'div' : PortalLayer" v-model="visible" title="版权与收益" :wide="!embedded">
    <PortalTabs v-model="tab" :items="tabs" :drawer="!embedded" label="版权与收益分类" />
    <div class="panel-content">
      <ApplyPanel v-if="tab === 'apply'" ref="applyPanelRef" :works-for-covers="works" @open-cert="openCert" />
      <AssetsPanel v-else-if="tab === 'assets'" :works-for-covers="works" />
      <CertPanel v-else-if="tab === 'certs'" ref="certPanelRef" :works-for-covers="works" />
      <DeliveryPanel v-else-if="tab === 'delivery'" ref="deliveryPanelRef" :works-for-covers="works" />
      <SettlePanel v-else-if="tab === 'settle'" />
      <WithdrawPanel v-else-if="tab === 'withdraw'" />
    </div>
  </component>
</template>
<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import PortalLayer from '../../components/PortalLayer.vue'
import PortalTabs from '../../components/PortalTabs.vue'
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
const applyPanelRef = ref(null)
const certPanelRef = ref(null)
const deliveryPanelRef = ref(null)
const tabs = [
  { value: 'apply', label: '版权申请' },
  { value: 'assets', label: '版权资产' },
  { value: 'certs', label: '电子证书' },
  { value: 'delivery', label: '版权交割' },
  { value: 'settle', label: '结算' },
  { value: 'withdraw', label: '提现' }
]
watch(() => props.initialTab, value => { if (value) tab.value = value })

// 子面板 v-if 切换后可能尚未挂载：先记 pending，ref 就绪再消费。
const pendingApplyId = ref(null)
const pendingCertId = ref(null)
const pendingDeliveryOrderId = ref(null)

async function openCert(certId) {
  if (!certId) return
  pendingCertId.value = certId
  tab.value = 'certs'
  await nextTick()
  if (certPanelRef.value?.openById) {
    const id = pendingCertId.value
    pendingCertId.value = null
    await certPanelRef.value.openById(id)
  }
}

async function openApplyById(applyId) {
  if (!applyId) return
  pendingApplyId.value = applyId
  tab.value = 'apply'
  await nextTick()
  if (applyPanelRef.value?.openById) {
    const id = pendingApplyId.value
    pendingApplyId.value = null
    await applyPanelRef.value.openById(id)
  }
}

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

watch(applyPanelRef, async panel => {
  if (!panel?.openById || !pendingApplyId.value) return
  const id = pendingApplyId.value
  pendingApplyId.value = null
  await panel.openById(id)
})
watch(certPanelRef, async panel => {
  if (!panel?.openById || !pendingCertId.value) return
  const id = pendingCertId.value
  pendingCertId.value = null
  await panel.openById(id)
})
watch(deliveryPanelRef, async panel => {
  if (!panel?.openByOrder || !pendingDeliveryOrderId.value) return
  const id = pendingDeliveryOrderId.value
  pendingDeliveryOrderId.value = null
  await panel.openByOrder(id)
})

defineExpose({ openDeliveryByOrder, openApplyById, openCert })
</script>
