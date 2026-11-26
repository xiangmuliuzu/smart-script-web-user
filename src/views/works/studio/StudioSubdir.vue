<template>
  <aside class="subdir" aria-label="作品大纲目录">
    <h3>作品大纲</h3>
    <button type="button" class="sub-item" :class="{ active: view === 'outline' }" @click="emit('navigate', 'outline')">
      <b aria-hidden="true">▤</b><span>大纲总览</span>
    </button>
    <div class="sub-group">章节</div>
    <button
      v-for="chapter in chapters"
      :key="chapter.chapterNo"
      type="button"
      class="sub-item"
      :class="{ active: view === 'chapter' && activeChapterNo === chapter.chapterNo }"
      @click="emit('select-chapter', chapter.chapterNo)"
    >
      <b aria-hidden="true">{{ String(chapter.chapterNo).padStart(2, '0') }}</b>
      <span>{{ chapter.chapterTitle || `第 ${chapter.chapterNo} 章` }}</span>
      <span class="ch-status" :aria-label="statusText(chapter)">
        <i v-for="dot in statusOf(chapter)" :key="dot.key" :class="{ on: dot.on }">{{ dot.label }}</i>
      </span>
    </button>
    <div v-if="!chapters.length" class="sub-empty">还没有章节。点「新建章节」，AI 会依据作品资料生成本章概要。</div>
    <div v-if="generating" class="sub-generating" role="status">
      <span class="working"><span class="spinner" aria-hidden="true"></span>正在整理第 {{ generatingNo }} 章…</span>
      <p v-if="generatingPreview">{{ generatingPreview }}</p>
    </div>
    <button type="button" class="sub-new" :disabled="!editable || generating" @click="emit('new-chapter')">{{ generating ? '正在生成…' : '＋ 新建章节' }}</button>
  </aside>
</template>
<script setup>
import { chapterStatusDots } from '../../../utils/blueprint.js'

// 第二栏：大纲总览 + 章节列表（概/文/镜三态灯）+ 新建章节。
const props = defineProps({
  chapters: { type: Array, default: () => [] },
  storyboards: { type: Array, default: () => [] },
  view: { type: String, default: 'outline' },
  activeChapterNo: { type: Number, default: 0 },
  editable: Boolean,
  generating: Boolean,
  generatingNo: { type: Number, default: 0 },
  generatingPreview: { type: String, default: '' }
})
const emit = defineEmits(['navigate', 'select-chapter', 'new-chapter'])

function storyboardOf(chapter) {
  return (props.storyboards || []).find(board =>
    (chapter?.chapterId && Number(board.chapterId) === Number(chapter.chapterId))
    || (Number(board.chapterNo) === Number(chapter?.chapterNo))
    || (board.chapterTitle && board.chapterTitle === chapter?.chapterTitle)
  ) || null
}
const statusOf = chapter => chapterStatusDots(chapter, storyboardOf(chapter))
const statusText = chapter => statusOf(chapter).map(dot => `${dot.label}${dot.on ? '有' : '无'}`).join(' ')
</script>
