<template>
  <div :class="drawer ? 'dtabs' : 'tabs'" role="tablist" :aria-label="label">
    <button v-for="(item, index) in items" :key="item.value" role="tab" type="button" :aria-selected="modelValue === item.value" :tabindex="modelValue === item.value ? 0 : -1" @click="$emit('update:modelValue', item.value)" @keydown="move($event, index)">{{ item.label }}<span v-if="item.count" class="tab-count">{{ item.count }}</span></button>
  </div>
</template>
<script setup>
const props = defineProps({ modelValue: String, items: Array, drawer: Boolean, label: { type: String, default: '内容分类' } })
const emit = defineEmits(['update:modelValue'])
function move(event, index) {
  const offset = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
  if (!offset && !['Home', 'End'].includes(event.key)) return
  event.preventDefault()
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? props.items.length - 1 : (index + offset + props.items.length) % props.items.length
  emit('update:modelValue', props.items[next].value)
  event.currentTarget.parentElement.children[next].focus()
}
</script>
