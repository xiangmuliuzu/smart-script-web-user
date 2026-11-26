<template>
  <section v-if="view === 'intro'" class="paper" aria-label="作品简介">
    <h2>作品简介
      <button class="btn quiet sm head-action" type="button" :disabled="regenerating" @click="emit('regenerate', 'storyCore')">{{ regenerating ? '正在整理…' : '让 AI 重新整理' }}</button>
    </h2>
    <p class="muted">作品级资料，进入工作台后作为所有章节的共同上下文。</p>
    <div class="prose">
      <h4>一句话梗概</h4>
      <p>{{ introLogline }}</p>
    </div>
    <div class="summary-box"><b>核心冲突</b><br />{{ blueprint.storyCore.coreConflict || '核心冲突尚未整理，可让 AI 重新整理故事核心。' }}</div>
    <div class="prose">
      <h4>创作约束</h4>
      <dl class="dl">
        <dt>叙事风格</dt><dd>{{ blueprint.storyCore.narrativeStyle || '待补充' }}</dd>
        <dt>内容边界</dt><dd>{{ blueprint.storyCore.contentBoundary || '待补充' }}</dd>
        <dt>节奏</dt><dd>共 {{ planEpisodes }} 集，单集 {{ minutesText(minutes) }}，每集结尾留一个钩子。</dd>
      </dl>
    </div>
    <div class="row-actions">
      <button class="btn light" type="button" @click="emit('open-modal', { kind: 'story' })">查看完整故事核心</button>
    </div>
  </section>

  <template v-else-if="view === 'characters'">
    <div class="card-grid">
      <div v-for="character in blueprint.characters" :key="character.key" class="info-card">
        <CharacterAvatar class="thumb" :name="character.name" :color="character.color" :src="character.portraitUrl" />
        <div class="grow">
          <h3>{{ character.name }}</h3>
          <div class="role">{{ character.role || '身份待补充' }}</div>
          <div class="mini">目标：{{ character.goal || '待补充' }}　性格：{{ character.trait || '待补充' }}</div>
          <div class="card-foot"><button class="btn sm ghost" type="button" @click="emit('open-modal', { kind: 'character', key: character.key })">查看详细档案</button></div>
        </div>
      </div>
    </div>
    <div v-if="!blueprint.characters.length" class="empty">
      <div>
        <h3>作品还没有人物资料</h3>
        <p>可让 AI 重新整理主要人物，生成后会自动整理人物关系图。</p>
        <button class="btn light" type="button" :disabled="regenerating" @click="emit('regenerate', 'characters')">{{ regenerating ? '正在整理…' : '让 AI 重新整理' }}</button>
      </div>
    </div>
    <div class="rel-block">
      <div class="rel-head">
        <h3>人物关系</h3>
        <span>实线合作、虚线隐瞒 / 质疑；点击人物查看档案</span>
        <button class="btn quiet sm head-action" type="button" :disabled="regenerating" @click="emit('regenerate', 'relations')">{{ regenerating ? '正在整理…' : '让 AI 重新整理' }}</button>
      </div>
      <RelationBoard
        :characters="blueprint.characters"
        :edges="blueprint.relations"
        empty-text="暂无人物关系。资料确认页整理人物关系后，这里会显示作品级关系图。"
        @select="key => emit('open-modal', { kind: 'character', key })"
      />
    </div>
  </template>

  <div v-else-if="view === 'objects'" class="card-grid" aria-label="物品信息">
    <div v-for="item in blueprint.items" :key="item.key" class="item-card">
      <div class="item-art"><ItemGlyph :icon="item.icon" :name="item.name" /></div>
      <div class="item-body">
        <div class="top"><span class="mark" aria-hidden="true">{{ itemIconText(item.icon) }}</span><h3>{{ item.name }}</h3></div>
        <p>{{ item.desc || '暂无物品描述。' }}</p>
        <div class="track">
          <span v-for="(point, index) in item.track" :key="index">第 {{ point.chapterNo || '?' }} 章 {{ point.event }}</span>
          <span v-if="!item.track.length" class="track-empty">{{ item.state || '尚未记录追踪轨迹' }}</span>
        </div>
      </div>
    </div>
    <div v-if="!blueprint.items.length" class="empty" style="grid-column: 1 / -1">
      <div>
        <h3>作品还没有物品资料</h3>
        <p>可让 AI 重新整理关键物品，生成后会进入创作台账，后续章节持续维护它们的状态。</p>
        <button class="btn light" type="button" :disabled="regenerating" @click="emit('regenerate', 'items')">{{ regenerating ? '正在整理…' : '让 AI 重新整理' }}</button>
      </div>
    </div>
  </div>

  <section v-else class="paper" aria-label="作品大纲">
    <h2>作品大纲
      <button class="btn quiet sm head-action" type="button" :disabled="regenerating" @click="emit('regenerate', 'outline')">{{ regenerating ? '正在整理…' : '让 AI 重新整理' }}</button>
    </h2>
    <p class="muted">整体结构、悬念与关键物品；不含章节级大纲，章节内容在右侧目录逐章生成。</p>
    <div class="prose">
      <h4>故事主线</h4>
      <p>{{ blueprint.outline.mainline || blueprint.storyCore.logline || '故事主线尚未整理。' }}</p>
      <h4>三幕结构</h4>
      <dl v-if="blueprint.outline.acts.length" class="dl">
        <template v-for="act in blueprint.outline.acts" :key="act.name">
          <dt>{{ act.name }}{{ act.range ? ' · ' + act.range : '' }}</dt>
          <dd>{{ act.summary }}</dd>
        </template>
      </dl>
      <p v-else>三幕结构尚未整理，可让 AI 重新整理作品大纲。</p>
      <h4>结尾悬念</h4>
      <p>{{ blueprint.outline.endingHanger || '暂无结尾悬念。' }}</p>
      <template v-if="blueprint.items.length">
        <h4>关键物品</h4>
        <div class="item-list">
          <div v-for="item in blueprint.items" :key="item.key" class="item-row">
            <div class="item-thumb"><ItemGlyph :icon="item.icon" :name="item.name" /></div>
            <div>
              <span class="ir-name">{{ item.name }}</span>
              <p>{{ item.desc || item.state || '暂无描述' }}</p>
              <div class="track">
                <span v-for="(point, index) in item.track" :key="index">第 {{ point.chapterNo || '?' }} 章 {{ point.event }}</span>
                <span v-if="!item.track.length" class="track-empty">{{ item.owner || '持有人待定' }}</span>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>
    <div class="summary-box">章节级概要不再在大纲阶段生成。点「新建章节」由 AI 依据作品资料生成下一章概要；点左侧章节打开创作页。</div>
    <div class="row-actions"><button class="btn light" type="button" :disabled="!canEdit" @click="emit('new-chapter')">＋ 新建章节</button></div>
  </section>
</template>
<script setup>
import { computed } from 'vue'
import CharacterAvatar from '../../../components/blueprint/CharacterAvatar.vue'
import ItemGlyph from '../../../components/blueprint/ItemGlyph.vue'
import RelationBoard from '../../../components/blueprint/RelationBoard.vue'
import { minutesText } from '../../../utils/blueprint.js'

// 作品级四个只读视图（简介 / 人物 / 物品 / 大纲），工作台第三栏复用。
const props = defineProps({
  view: { type: String, default: 'intro' },
  blueprint: { type: Object, required: true },
  planEpisodes: { type: Number, default: 12 },
  minutes: { type: Number, default: 2 },
  regenerating: Boolean,
  canEdit: Boolean
})
const emit = defineEmits(['open-modal', 'regenerate', 'new-chapter'])
const introLogline = computed(() => props.blueprint.storyCore.logline || props.blueprint.storyCore.summary || '暂无一句话梗概。')
const itemIconText = icon => ({ tape: '▤', radio: '◇', note: '▧', key: '⚿', mask: '◈' })[icon] || '◇'
</script>
