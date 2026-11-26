<template>
  <Teleport to="body">
    <div v-if="modelValue" class="modal-mask show" @click.self="close">
      <div class="modal blueprint-modal" role="dialog" aria-modal="true" :aria-label="heading.title">
        <header class="modal-head">
          <div>
            <h2>{{ heading.title }}</h2>
            <p>{{ heading.sub }}</p>
          </div>
          <button class="close" type="button" aria-label="关闭" @click="close">×</button>
        </header>
        <div class="modal-body">
          <template v-if="kind === 'characters' || kind === 'character'">
            <article v-for="character in shownCharacters" :key="character.key" class="char-detail">
              <div class="char-media">
                <ThreeViewGlyph :name="character.name" :color="character.color" :urls="character.threeViewUrls" />
                <div class="tv-cap">人物三视图</div>
              </div>
              <div class="char-body">
                <h4>{{ character.name }}</h4>
                <div class="ctag">{{ character.role || '身份待补充' }}</div>
                <dl class="dl">
                  <dt>年龄 / 性别</dt><dd>{{ [character.age, character.gender].filter(Boolean).join(' / ') || '待补充' }}</dd>
                  <dt>外貌与气质</dt><dd>{{ character.appearance || '待补充' }}</dd>
                  <dt>人物目标</dt><dd>{{ character.goal || '待补充' }}</dd>
                  <dt>性格特点</dt><dd>{{ character.trait || '待补充' }}</dd>
                  <dt>人物秘密</dt><dd>{{ character.secret || '待补充' }}</dd>
                  <dt>成长线</dt><dd>{{ character.growth || '待补充' }}</dd>
                </dl>
              </div>
            </article>
            <p v-if="!shownCharacters.length" class="blue-empty">作品资料里还没有人物，可让 AI 重新整理主要人物。</p>
          </template>

          <template v-else-if="kind === 'items' || kind === 'item'">
            <article v-for="item in shownItems" :key="item.key" class="char-detail item-detail">
              <div class="item-art">
                <ItemGlyph :icon="item.icon" :name="item.name" />
              </div>
              <div>
                <h4>{{ item.name }}</h4>
                <div class="ctag">关键物品 · {{ item.state || '状态待补充' }}</div>
                <p class="item-desc">{{ item.desc || '暂无物品描述。' }}</p>
                <dl class="dl compact">
                  <dt>件数</dt><dd>{{ item.count || '待定' }}</dd>
                  <dt>持有人</dt><dd>{{ item.owner || '待定' }}</dd>
                </dl>
                <div class="track">
                  <span v-for="(point, index) in item.track" :key="index">第 {{ point.chapterNo || '?' }} 章 {{ point.event }}</span>
                  <span v-if="!item.track.length" class="track-empty">尚未记录追踪轨迹</span>
                </div>
              </div>
            </article>
            <p v-if="!shownItems.length" class="blue-empty">作品资料里还没有物品，可让 AI 重新整理关键物品。</p>
          </template>

          <template v-else-if="kind === 'world'">
            <div class="prose">
              <h4>世界观</h4>
              <p>{{ blueprint.world.setting || '暂无世界观设定。' }}</p>
              <h4>规则</h4>
              <dl v-if="blueprint.world.rules.length" class="dl">
                <template v-for="rule in blueprint.world.rules" :key="rule.name">
                  <dt>{{ rule.name || '规则' }}</dt><dd>{{ rule.detail }}</dd>
                </template>
              </dl>
              <p v-else class="blue-empty">暂无规则条目。</p>
              <template v-if="blueprint.world.constraints.length">
                <h4>创作限制</h4>
                <ul class="bullet-list"><li v-for="(rule, index) in blueprint.world.constraints" :key="index">{{ rule }}</li></ul>
              </template>
            </div>
          </template>

          <template v-else-if="kind === 'outline'">
            <div class="prose">
              <h4>故事主线</h4>
              <p>{{ blueprint.outline.mainline || '暂无故事主线。' }}</p>
              <h4>三幕结构</h4>
              <dl v-if="blueprint.outline.acts.length" class="dl">
                <template v-for="act in blueprint.outline.acts" :key="act.name">
                  <dt>{{ act.name }}{{ act.range ? ' · ' + act.range : '' }}</dt><dd>{{ act.summary }}</dd>
                </template>
              </dl>
              <p v-else class="blue-empty">三幕结构尚未整理，可让 AI 重新整理作品大纲。</p>
              <h4>结尾悬念</h4>
              <p>{{ blueprint.outline.endingHanger || '暂无结尾悬念。' }}</p>
            </div>
          </template>

          <template v-else>
            <div class="prose">
              <h4>一句话梗概</h4>
              <p>{{ blueprint.storyCore.logline || '暂无一句话梗概。' }}</p>
              <h4>故事简介</h4>
              <p>{{ blueprint.storyCore.summary || '暂无故事简介。' }}</p>
              <dl class="dl">
                <dt>核心冲突</dt><dd>{{ blueprint.storyCore.coreConflict || '待补充' }}</dd>
                <dt>叙事风格</dt><dd>{{ blueprint.storyCore.narrativeStyle || '待补充' }}</dd>
                <dt>内容边界</dt><dd>{{ blueprint.storyCore.contentBoundary || '待补充' }}</dd>
                <dt>结局基调</dt><dd>{{ blueprint.storyCore.endingTone || '待补充' }}</dd>
              </dl>
            </div>
          </template>
        </div>
        <footer class="modal-foot">
          <template v-if="showRegen">
            <input
              v-model="instruction"
              class="regen-input"
              type="text"
              maxlength="200"
              placeholder="告诉 AI 需要怎么调整，例如：冲突再提前一点…"
              :disabled="busy"
              @keyup.enter="regenerate"
            />
            <button class="btn light" type="button" :disabled="busy" @click="regenerate">{{ busy ? '正在重新整理…' : '让 AI 重新整理' }}</button>
          </template>
          <button v-else class="btn quiet" type="button" @click="close">关闭</button>
          <button class="btn" type="button" @click="close">完成</button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import ThreeViewGlyph from './ThreeViewGlyph.vue'
import ItemGlyph from './ItemGlyph.vue'

// 资料详情弹窗：Blueprint 四张卡与工作台「查看完整资料」共用同一套版式。
const props = defineProps({
  modelValue: Boolean,
  kind: { type: String, default: 'story' },
  blueprint: { type: Object, required: true },
  focusKey: { type: String, default: '' },
  showRegen: { type: Boolean, default: true },
  busy: { type: Boolean, default: false }
})
const emit = defineEmits(['update:modelValue', 'regenerate'])
const instruction = ref('')

const KIND_LABELS = {
  story: { title: '故事核心', sub: '作品资料 · 故事核心', section: 'storyCore' },
  world: { title: '世界与规则', sub: '作品资料 · 世界与规则', section: 'world' },
  characters: { title: '主要人物', sub: '', section: 'characters' },
  character: { title: '人物档案', sub: '', section: 'characters' },
  items: { title: '关键物品', sub: '作品资料 · 创作台账', section: 'items' },
  item: { title: '物品详情', sub: '作品资料 · 关键物品', section: 'items' },
  outline: { title: '作品大纲', sub: '作品资料 · 故事结构与悬念', section: 'outline' }
}
const focusedCharacter = computed(() => props.blueprint.characters.find(character => character.key === props.focusKey) || null)
const focusedItem = computed(() => props.blueprint.items.find(item => item.key === props.focusKey) || null)
const heading = computed(() => {
  const base = KIND_LABELS[props.kind] || KIND_LABELS.story
  if (props.kind === 'characters') return { title: base.title, sub: `作品资料 · ${props.blueprint.characters.length} 位主要人物` }
  if (props.kind === 'character') return { title: base.title, sub: `人物档案 · ${focusedCharacter.value?.role || '身份待补充'}` }
  if (props.kind === 'items') return { title: base.title, sub: `作品资料 · ${props.blueprint.items.length} 件关键物品` }
  if (props.kind === 'item') return { title: focusedItem.value?.name || base.title, sub: '作品资料 · 关键物品' }
  return base
})
const shownCharacters = computed(() => props.kind === 'character' ? (focusedCharacter.value ? [focusedCharacter.value] : []) : props.blueprint.characters)
const shownItems = computed(() => props.kind === 'item' ? (focusedItem.value ? [focusedItem.value] : []) : props.blueprint.items)

// 弹窗换目标时清空上一次的调整意见，避免串到另一项。
watch(() => [props.kind, props.focusKey, props.modelValue], () => { if (props.modelValue) instruction.value = '' })

function close() { emit('update:modelValue', false) }
function regenerate() { emit('regenerate', instruction.value.trim()) }
</script>
