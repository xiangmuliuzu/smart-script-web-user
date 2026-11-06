<template>
  <div class="tabs demand-tabs" role="tablist" aria-label="任务广场分区">
    <button v-for="item in items" :key="item.path" type="button" role="tab" :aria-selected="item.path === activePath" :tabindex="item.path === activePath ? 0 : -1" @click="go(item.path)">{{ item.label }}</button>
  </div>
</template>
<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
const route = useRoute()
const router = useRouter()
// 任务广场是顶级页签，分区之间用路由切换，保证详情页返回与消息通知都能落到具体分区。
const items = [
  { path: '/demand', label: '任务广场' },
  { path: '/demand/mine', label: '我的任务' },
]
// 任务详情页（/demand/:id）不高亮任何分区，避免误以为仍在广场列表。
const activePath = computed(() => items.find(item => item.path === route.path)?.path || '')
function go(path) { if (route.path !== path) router.push(path) }
</script>
<style scoped>
.demand-tabs { margin-bottom: 14px }
</style>
