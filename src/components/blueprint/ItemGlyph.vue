<template>
  <svg viewBox="0 0 160 110" preserveAspectRatio="xMidYMid meet" role="img" :aria-label="label">
    <g v-if="kind === 'tape'">
      <rect x="16" y="20" width="128" height="72" rx="7" fill="#FBF9F4" stroke="#1B1A18" stroke-width="2" />
      <rect x="28" y="30" width="104" height="38" rx="3" fill="none" stroke="#4A6C74" stroke-width="1.3" />
      <circle cx="58" cy="49" r="11" fill="none" stroke="#2C4A52" stroke-width="1.5" />
      <circle cx="102" cy="49" r="11" fill="none" stroke="#2C4A52" stroke-width="1.5" />
      <circle cx="58" cy="49" r="3.4" fill="#2C4A52" /><circle cx="102" cy="49" r="3.4" fill="#2C4A52" />
      <path d="M58 38v4M58 56v4M47 49h4M65 49h4M102 38v4M102 56v4M91 49h4M109 49h4" stroke="#2C4A52" stroke-width="1.1" />
      <rect x="56" y="72" width="48" height="10" rx="2" fill="none" stroke="#DCD8CE" stroke-width="1.2" />
      <circle cx="24" cy="84" r="1.8" fill="#4A6C74" /><circle cx="136" cy="84" r="1.8" fill="#4A6C74" />
    </g>
    <g v-else-if="kind === 'radio'">
      <path d="M112 24 L142 8" stroke="#1B1A18" stroke-width="1.8" stroke-linecap="round" />
      <rect x="22" y="24" width="116" height="62" rx="6" fill="#FBF9F4" stroke="#1B1A18" stroke-width="2" />
      <rect x="30" y="32" width="52" height="46" rx="3" fill="none" stroke="#DCD8CE" stroke-width="1.2" />
      <path d="M36 42h40M36 50h40M36 58h40M36 66h40" stroke="#DCD8CE" stroke-width="1" />
      <rect x="90" y="34" width="40" height="16" rx="2" fill="none" stroke="#4A6C74" stroke-width="1.3" />
      <path d="M98 34v4M108 34v4M118 34v4" stroke="#4A6C74" stroke-width="1" />
      <circle cx="100" cy="66" r="8" fill="none" stroke="#1B1A18" stroke-width="1.6" />
      <path d="M100 66 L100 60" stroke="#2C4A52" stroke-width="1.6" stroke-linecap="round" />
      <circle cx="122" cy="66" r="4.5" fill="none" stroke="#1B1A18" stroke-width="1.4" />
      <path d="M30 86h8M122 86h8" stroke="#1B1A18" stroke-width="1.8" stroke-linecap="round" />
    </g>
    <g v-else-if="kind === 'key'">
      <circle cx="38" cy="38" r="15" fill="none" stroke="#1B1A18" stroke-width="2.2" />
      <circle cx="38" cy="38" r="6" fill="none" stroke="#4A6C74" stroke-width="1.4" />
      <path d="M50 50 L120 92" stroke="#1B1A18" stroke-width="2.4" stroke-linecap="round" />
      <path d="M104 82 L112 74 M114 88 L122 80" stroke="#1B1A18" stroke-width="2.2" stroke-linecap="round" />
      <path d="M62 58 L70 52" stroke="#2C4A52" stroke-width="1.4" stroke-linecap="round" />
    </g>
    <g v-else-if="kind === 'mask'">
      <path d="M44 24 Q80 10 116 24 Q124 70 80 96 Q36 70 44 24 Z" fill="#FBF9F4" stroke="#1B1A18" stroke-width="2" />
      <path d="M56 42 Q68 36 78 44" fill="none" stroke="#2C4A52" stroke-width="2.2" stroke-linecap="round" />
      <path d="M104 42 Q92 36 82 44" fill="none" stroke="#2C4A52" stroke-width="2.2" stroke-linecap="round" />
      <path d="M64 72 Q80 82 96 72" fill="none" stroke="#4A6C74" stroke-width="1.8" stroke-linecap="round" />
      <path d="M80 26 Q80 52 80 62" fill="none" stroke="#DCD8CE" stroke-width="1.4" />
    </g>
    <g v-else-if="kind === 'note'">
      <path d="M48 22 H100 L112 34 V94 a4 4 0 0 1-4 4 H48 a4 4 0 0 1-4-4 V26 a4 4 0 0 1 4-4 Z" fill="#FBF9F4" stroke="#C9C4B8" stroke-width="1.5" />
      <path d="M100 22 V34 H112" fill="none" stroke="#C9C4B8" stroke-width="1.5" />
      <path d="M56 46h44M56 56h44M56 66h34" stroke="#C9C4B8" stroke-width="1.2" />
      <path d="M56 80 q6 -6 12 0 t12 0 t12 0" fill="none" stroke="#2C4A52" stroke-width="1.6" stroke-linecap="round" />
      <rect x="64" y="14" width="20" height="7" rx="2" fill="#E4ECEC" stroke="#4A6C74" stroke-width="1" />
    </g>
    <g v-else>
      <rect x="28" y="26" width="104" height="60" rx="4" fill="#FBF9F4" stroke="#C9C4B8" stroke-width="1.6" />
      <path d="M40 42h80M40 54h80M40 66h54" stroke="#DCD8CE" stroke-width="1.2" />
      <circle cx="118" cy="76" r="12" fill="none" stroke="#4A6C74" stroke-width="1.5" />
      <path d="M112 76h12M118 70v12" stroke="#4A6C74" stroke-width="1.3" />
    </g>
  </svg>
</template>
<script setup>
import { computed } from 'vue'

// 关键物品意图：按 icon 映射线稿；未知类型给通用方框，不引入图片依赖。
const props = defineProps({
  icon: { type: String, default: 'generic' },
  name: { type: String, default: '物品' }
})
const KINDS = new Set(['tape', 'radio', 'key', 'mask', 'note'])
const kind = computed(() => KINDS.has(props.icon) ? props.icon : 'generic')
const label = computed(() => `${props.name || '物品'}示意图`)
</script>
