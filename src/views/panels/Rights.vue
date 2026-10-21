<template>
  <PortalLayer v-model="visible" title="版权与收益" wide>
    <PortalTabs v-model="tab" :items="tabs" drawer label="版权与收益分类" />
    <div class="panel-content">
      <div class="note info">{{ notes[tab] }}</div>
      <ApplyPanel v-if="tab === 'apply'" @open-cert="openCert" />
      <CertPanel v-else-if="tab === 'certs'" ref="certPanelRef" />
      <SealPanel v-else-if="tab === 'seal'" />
      <LoadState v-else empty empty-text="版权与收益服务暂未开放，可通过「消息 → 与平台沟通」咨询。" />
    </div>
  </PortalLayer>
</template>
<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import PortalLayer from '../../components/PortalLayer.vue'
import PortalTabs from '../../components/PortalTabs.vue'
import LoadState from '../../components/LoadState.vue'
import SealPanel from './seal/SealPanel.vue'
import ApplyPanel from './copyright/ApplyPanel.vue'
import CertPanel from './copyright/CertPanel.vue'

const props = defineProps({ modelValue: Boolean, initialTab: String })
const emit = defineEmits(['update:modelValue'])
const visible = computed({ get: () => props.modelValue, set: value => emit('update:modelValue', value) })
const tab = ref(props.initialTab || 'apply')
const certPanelRef = ref(null)
const tabs = [
  { value: 'apply', label: '版权申请' },
  { value: 'assets', label: '版权资产' },
  { value: 'certs', label: '电子证书' },
  { value: 'seal', label: '印章' },
  { value: 'settle', label: '结算' },
  { value: 'withdraw', label: '提现' }
]
const notes = {
  apply: '版权登记由平台统一向省版权中心提交，你只需提交申请与材料，进度会同步到这里。登记完成后作品会出现在「版权资产」与「电子证书」。',
  assets: '已登记的作品与授权历史，在这里统一管理。',
  certs: '作品登记完成后可查看电子证书。',
  seal: '印章用于版权材料与授权合同的签署。提交后由平台审核，通过后可用于后续合同流程。',
  settle: '作品成交后由平台结算。创作者所得为订单金额扣除平台服务费后的部分。',
  withdraw: '提现申请由平台审核，审核通过后 1–3 个工作日到账。'
}
watch(() => props.initialTab, value => { if (value) tab.value = value })

async function openCert(certId) {
  if (!certId) return
  tab.value = 'certs'
  await nextTick()
  certPanelRef.value?.openById?.(certId)
}
</script>
