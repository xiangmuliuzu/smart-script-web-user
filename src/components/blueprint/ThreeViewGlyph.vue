<template>
  <div class="three-view" role="img" :aria-label="ariaLabel">
    <figure v-for="view in views" :key="view.key">
      <img v-if="imageOf(view.key)" :src="imageOf(view.key)" :alt="`${view.caption}图`" />
      <svg v-else viewBox="0 0 120 200" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        <g fill="none" :stroke="color" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
          <template v-if="view.key === 'side'">
            <circle cx="62" cy="30" r="16" />
            <path d="M79 27 L88 33 L79 39" />
            <rect x="50" y="62" width="22" height="62" rx="10" />
            <path d="M56 70 L46 120" />
            <path d="M58 124 L48 188 M66 126 L62 188" />
          </template>
          <template v-else-if="view.key === 'back'">
            <circle cx="60" cy="30" r="16" />
            <path d="M46 24 Q60 10 74 24" />
            <rect x="42" y="62" width="36" height="62" rx="11" />
            <path d="M44 70 L32 120 M76 70 L88 120" />
            <path d="M52 124 L48 188 M68 124 L72 188" />
            <path d="M60 66 L60 120" opacity=".45" />
          </template>
          <template v-else>
            <circle cx="60" cy="30" r="16" />
            <rect x="42" y="62" width="36" height="62" rx="11" />
            <path d="M44 70 L32 120 M76 70 L88 120" />
            <path d="M52 124 L48 188 M68 124 L72 188" />
            <path d="M52 74 L68 74" opacity=".5" />
          </template>
        </g>
      </svg>
      <figcaption>{{ view.caption }}</figcaption>
    </figure>
  </div>
</template>
<script setup>
import { computed } from 'vue'

// 人物三视图线稿：无真实生图时用确定性 SVG 占位，颜色取自人物卡。
const props = defineProps({
  name: { type: String, default: '人物' },
  color: { type: String, default: '#4a6c74' },
  urls: { type: Object, default: () => ({}) }
})
const views = [
  { key: 'front', caption: '正面' },
  { key: 'side', caption: '侧面' },
  { key: 'back', caption: '背面' }
]
const ariaLabel = computed(() => `${props.name || '人物'}三视图`)
function imageOf(key) {
  const value = props.urls?.[key]
  return typeof value === 'string' && value ? value : ''
}
</script>
