<template>
  <div v-if="pending" class="load-state" role="status"><span class="loading-mark"></span>{{ loadingText }}</div>
  <div v-else-if="error" class="load-state" role="alert"><p>{{ error }}</p><button v-if="retry" class="btn ghost sm" @click="retry">重新加载</button></div>
  <div v-else-if="empty" class="load-state"><p>{{ emptyText }}</p><slot /></div>
</template>
<script setup>
defineProps({ pending: Boolean, error: String, empty: Boolean, retry: Function, loadingText: { type: String, default: '正在加载…' }, emptyText: { type: String, default: '暂无记录' } })
</script>
