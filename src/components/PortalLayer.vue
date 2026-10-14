<template>
  <el-dialog v-if="modal" :model-value="modelValue" :title="title" :width="big ? 'min(1040px, 94vw)' : 'min(860px, 92vw)'" class="portal-modal" :class="{ 'portal-modal-big': big }" align-center destroy-on-close :close-on-click-modal="false" :before-close="beforeClose" @update:model-value="$emit('update:modelValue', $event)">
    <slot />
  </el-dialog>
  <el-drawer v-else :model-value="modelValue" :title="title" direction="rtl" :size="size || (wide ? 'min(780px, 96vw)' : 'min(430px, 94vw)')" class="portal-drawer" destroy-on-close :before-close="beforeClose" @update:model-value="$emit('update:modelValue', $event)">
    <slot />
  </el-drawer>
</template>
<script setup>
defineProps({ modelValue: Boolean, title: String, modal: Boolean, big: Boolean, wide: Boolean, size: String, beforeClose: Function })
defineEmits(['update:modelValue'])
</script>
