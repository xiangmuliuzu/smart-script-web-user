<template>
  <img v-if="src" class="character-avatar" :src="src" :alt="`${name}的头像`" />
  <span v-else class="character-avatar character-avatar-glyph" :style="glyphStyle" :aria-label="`${name}的首字头像`">{{ initial }}</span>
</template>
<script setup>
import { computed } from 'vue'

// 人物头像：有 portraitUrl 用图，没有就用首字 + 底色（与原型 avatar() 等价的占位）。
const props = defineProps({
  name: { type: String, default: '人物' },
  color: { type: String, default: '#4a7c75' },
  src: { type: String, default: '' }
})
const initial = computed(() => String(props.name || '人').trim().slice(0, 1))
const glyphStyle = computed(() => ({ background: props.color || '#4a7c75' }))
</script>
