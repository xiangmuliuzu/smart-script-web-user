<template>
  <PublicSquare v-if="!getToken()" />
  <RouterView v-else />
</template>
<script setup>
import { RouterView } from 'vue-router'
import { getToken } from '../../auth.js'
import PublicSquare from './PublicSquare.vue'
</script>
