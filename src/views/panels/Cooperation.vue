<template>
  <PortalLayer v-model="visible" title="我的合作" wide><div class="drawer-tools"><button class="btn quiet sm" @click="contractsVisible = true">我的合同</button></div><PortalTabs v-model="tab" :items="tabs" drawer label="合作类型" /><div class="panel-content"><LoadState empty empty-text="合作服务暂未开放，可通过「消息 → 与平台沟通」咨询。" /></div><PortalLayer v-model="contractsVisible" title="我的合同" modal><LoadState empty empty-text="合同服务暂未开放，开放后可在这里查看与签署。" /></PortalLayer></PortalLayer>
</template>
<script setup>
import { computed, ref } from 'vue'
import PortalLayer from '../../components/PortalLayer.vue'
import PortalTabs from '../../components/PortalTabs.vue'
import LoadState from '../../components/LoadState.vue'
const props = defineProps({ modelValue: Boolean, initialTab: String })
const emit = defineEmits(['update:modelValue'])
const visible = computed({ get: () => props.modelValue, set: value => emit('update:modelValue', value) })
const tab = ref(props.initialTab || 'inquiry')
const tabs = [{ value: 'inquiry', label: '询盘' }, { value: 'quote', label: '报价' }, { value: 'order', label: '订单' }]
const contractsVisible = ref(false)
</script>
