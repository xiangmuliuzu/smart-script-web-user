<template>
  <div class="relation-wrap">
    <div v-if="nodes.length" class="relation-board" :style="{ minHeight: boardHeight + 'px' }">
      <svg viewBox="0 0 1000 420" preserveAspectRatio="none" aria-hidden="true">
        <line
          v-for="edge in drawableEdges"
          :key="edge.id"
          :x1="edge.from.x * 10"
          :y1="edge.from.y * 4.2"
          :x2="edge.to.x * 10"
          :y2="edge.to.y * 4.2"
          :stroke="edge.color"
          stroke-width="2"
          :stroke-dasharray="edge.dash ? '6 6' : undefined"
        />
      </svg>
      <div
        v-for="edge in drawableEdges"
        :key="'label-' + edge.id"
        class="edge-label"
        :style="{ left: edge.labelX + '%', top: edge.labelY + '%' }"
      >{{ edge.label }}</div>
      <button
        v-for="node in nodes"
        :key="node.key"
        type="button"
        class="node"
        :style="{ left: node.x + '%', top: node.y + '%' }"
        :aria-label="`查看${node.name}的人物档案`"
        @click="emit('select', node.key)"
      >
        <CharacterAvatar :name="node.name" :color="node.color" :src="node.portraitUrl" />
        <span>{{ node.name }} · {{ node.role || '身份待补充' }}</span>
      </button>
    </div>
    <div v-else class="relation-empty">
      <p>{{ emptyText }}</p>
    </div>
    <div class="rel-legend">
      <span><i></i>合作 / 信任</span>
      <span><i class="dash"></i>质疑 / 隐瞒</span>
      <span>虚线为未公开或推断的关系；点击人物查看三视图档案</span>
    </div>
  </div>
</template>
<script setup>
import { computed } from 'vue'
import CharacterAvatar from './CharacterAvatar.vue'

// 人物关系图：确定性布局（主角色居中，其余均分圆环），不引入图形库。
const props = defineProps({
  characters: { type: Array, default: () => [] },
  edges: { type: Array, default: () => [] },
  maxNodes: { type: Number, default: 8 },
  emptyText: { type: String, default: '暂无人物关系，可让 AI 重新整理作品资料后再查看。' }
})
const emit = defineEmits(['select'])

const nodes = computed(() => {
  const list = (props.characters || []).slice(0, Math.max(2, props.maxNodes))
  if (!list.length) return []
  const positions = layout(list.length)
  return list.map((character, index) => ({
    key: character.key,
    name: character.name || `人物${index + 1}`,
    role: character.role || '',
    color: character.color || '#4a7c75',
    portraitUrl: character.portraitUrl || '',
    x: positions[index].x,
    y: positions[index].y
  }))
})

const drawableEdges = computed(() => {
  const byKey = new Map(nodes.value.map(node => [node.key, node]))
  return (props.edges || []).map((edge, index) => {
    const from = byKey.get(edge.a)
    const to = byKey.get(edge.b)
    if (!from || !to) return null
    return {
      id: `${edge.a}-${edge.b}-${index}`,
      from,
      to,
      label: edge.label || '关系',
      dash: edge.dash === true,
      color: edge.color || '#4a6c74',
      labelX: (from.x + to.x) / 2,
      labelY: (from.y + to.y) / 2
    }
  }).filter(Boolean)
})

const boardHeight = computed(() => nodes.value.length ? 400 : 0)

// 3 人沿用原型三角；2 人对置；4 人以上为「圆心 + 均分圆环」。
function layout(count) {
  if (count === 2) return [{ x: 30, y: 50 }, { x: 70, y: 50 }]
  if (count === 3) return [{ x: 50, y: 26 }, { x: 26, y: 74 }, { x: 74, y: 74 }]
  const positions = [{ x: 50, y: 50 }]
  const radius = 36
  for (let index = 1; index < count; index += 1) {
    const angle = (Math.PI * 2 * (index - 1)) / (count - 1) - Math.PI / 2
    positions.push({ x: 50 + Math.cos(angle) * radius, y: 50 + Math.sin(angle) * radius * 0.86 })
  }
  return positions
}
</script>
