<template>
  <PortalLayer v-model="visible" title="我的印章" wide>
    <div class="panel-content">
      <SealPanel ref="panelRef" />
    </div>
  </PortalLayer>
</template>
<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import PortalLayer from '../../components/PortalLayer.vue'
import SealPanel from './seal/SealPanel.vue'

const props = defineProps({ modelValue: Boolean })
const emit = defineEmits(['update:modelValue'])
const visible = computed({ get: () => props.modelValue, set: value => emit('update:modelValue', value) })
const panelRef = ref(null)
const pendingSealId = ref(null)

async function openById(sealId) {
  if (!sealId) return
  pendingSealId.value = sealId
  await nextTick()
  if (panelRef.value?.openById) {
    const id = pendingSealId.value
    pendingSealId.value = null
    await panelRef.value.openById(id)
  }
}

watch(panelRef, async panel => {
  if (!panel?.openById || !pendingSealId.value) return
  const id = pendingSealId.value
  pendingSealId.value = null
  await panel.openById(id)
})

defineExpose({ openById })
</script>
