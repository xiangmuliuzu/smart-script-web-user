<template>
  <section v-if="tab === 'summary'" class="paper fill" aria-label="本章内容概要">
    <h2>第 {{ chapter.chapterNo }} 章 · 内容概要</h2>
    <p class="muted">本章概要独立保存，生成正文与分镜时都会参考。</p>
    <div v-if="meta.aiSummary" class="summary-box"><b>AI 已生成本章起稿概要</b><br />{{ meta.aiSummary }}</div>
    <label class="field-label" for="studio-summary">章节概要</label>
    <textarea
      id="studio-summary"
      class="manuscript"
      style="min-height: 180px; font-size: 15px"
      :value="chapter.summary"
      :readonly="!canEdit"
      maxlength="500"
      placeholder="写清本章从哪个动作接起、发生了什么、结尾留什么钩子；不超过 500 字。"
      @input="emit('update:summary', $event.target.value)"
    />
    <div class="row-actions">
      <button class="btn light" type="button" :disabled="!canEdit || saving" @click="emit('save', 'summary')">{{ saving ? '保存中…' : '保存概要' }}</button>
      <button class="btn ghost" type="button" @click="emit('goto', 'text')">去写章节文本 →</button>
      <span class="cost">{{ summaryWords }} / 500 字</span>
    </div>
  </section>

  <section v-else-if="tab === 'text'" class="paper fill" aria-label="本章章节文本">
    <h2>章节文本</h2>
    <p class="muted">稿纸式编辑区，本章文本独立保存；可用右侧 AI 创作生成或改写。</p>
    <div class="editor-wrap">
      <ScriptEditor
        :model-value="chapter.content"
        :read-only="!canEdit"
        hide-title
        label="本章正文"
        @update:model-value="value => emit('update:text', value)"
      />
    </div>
    <div class="row-actions">
      <button class="btn light" type="button" :disabled="!canEdit || saving" @click="emit('save', 'text')">{{ saving ? '保存中…' : '保存章节文本' }}</button>
      <span class="cost">正文约 {{ textWords }} 字</span>
    </div>
  </section>

  <section v-else-if="tab === 'storyboard'" class="paper fill" aria-label="本章分镜">
    <h2>章节分镜</h2>
    <p class="muted">稿纸式分镜区，逐镜换行书写，本章分镜独立保存；可用右侧 AI 创作生成分镜。</p>
    <div class="toolbar" role="toolbar" aria-label="分镜工具">
      <button type="button" :disabled="!canEdit" @click="insertShot('特写')">特写</button>
      <button type="button" :disabled="!canEdit" @click="insertShot('中景')">中景</button>
      <button type="button" :disabled="!canEdit" @click="insertShot('全景')">全景</button>
      <span class="sep" aria-hidden="true"></span>
      <button type="button" :disabled="!canEdit" @click="insertShot('缓慢推近')">缓慢推近</button>
      <button type="button" :disabled="!canEdit" @click="insertShot('固定机位')">固定机位</button>
      <button type="button" :disabled="!canEdit" @click="insertShot('跟拍')">跟拍</button>
      <span class="count">{{ shotLines }} 行</span>
    </div>
    <textarea
      ref="shotArea"
      class="manuscript"
      :value="chapter.storyboardContent"
      :readonly="!canEdit"
      placeholder="按镜头逐行写，例如：&#10;01 特写｜黑暗中，红色指示灯亮起。｜缓慢推近&#10;02 中景｜沈岚戴着耳机抬头看钟。｜固定机位"
      @input="emit('update:storyboard', $event.target.value)"
    />
    <div class="row-actions">
      <button class="btn light" type="button" :disabled="!canEdit || saving" @click="emit('save', 'storyboard')">{{ saving ? '保存中…' : '保存分镜' }}</button>
      <span class="cost">保存后按章节标题同步到分镜目录，等待平台审核。</span>
    </div>
  </section>

  <section v-else-if="tab === 'cast'" class="paper" aria-label="本章人物信息">
    <h2>人物信息</h2>
    <p class="muted">本章出场人物、在章内的身份与本章变化；点击可查看完整人物档案。</p>
    <div v-if="castRows.length" class="card-grid">
      <div v-for="row in castRows" :key="row.key" class="info-card">
        <CharacterAvatar class="thumb" :name="row.character.name" :color="row.character.color" :src="row.character.portraitUrl" />
        <div class="grow">
          <h3>{{ row.character.name }}</h3>
          <div class="role">{{ row.entry.role || row.character.role || '本章出场' }}</div>
          <div class="mini">本章变化：{{ row.entry.change || '本章暂未记录变化。' }}</div>
          <div class="card-foot"><button class="btn sm ghost" type="button" @click="emit('open-modal', { kind: 'character', key: row.key })">查看完整档案</button></div>
        </div>
      </div>
    </div>
    <div v-else class="empty">
      <div>
        <h3>本章还没有人物信息</h3>
        <p>可由 AI 依据本章概要与作品人物整理本章出场人物；也可以直接查看作品级人物资料。</p>
        <button class="btn light" type="button" @click="emit('view-work', 'characters')">查看作品人物信息</button>
      </div>
    </div>
  </section>

  <section v-else-if="tab === 'items'" class="paper" aria-label="本章物品信息">
    <h2>物品信息</h2>
    <p class="muted">本章出现的物品、在章内的作用与本章变化。</p>
    <div v-if="itemRows.length" class="card-grid">
      <div v-for="row in itemRows" :key="row.key" class="info-card">
        <div class="thumb item-ico"><ItemGlyph :icon="row.item.icon" :name="row.item.name" /></div>
        <div class="grow">
          <h3>{{ row.item.name }}</h3>
          <div class="role">{{ row.entry.role || row.item.state || '本章出场' }}</div>
          <div class="mini">本章变化：{{ row.entry.change || '本章暂未记录变化。' }}</div>
        </div>
      </div>
    </div>
    <div v-else class="empty">
      <div>
        <h3>本章还没有物品信息</h3>
        <p>可由 AI 依据本章概要与作品物品整理本章出场物品。</p>
        <button class="btn light" type="button" @click="emit('view-work', 'objects')">查看作品物品信息</button>
      </div>
    </div>
    <div v-if="itemRows.length" class="row-actions">
      <button class="btn sm ghost" type="button" @click="emit('view-work', 'objects')">查看作品物品信息</button>
    </div>
  </section>

  <section v-else class="paper" aria-label="本章人物关系">
    <h2>人物关系</h2>
    <p class="muted">人物以头像节点展示，连线表示本章关系；点击人物可查看档案。</p>
    <RelationBoard
      :characters="relationCharacters"
      :edges="meta.edges"
      empty-text="暂无本章关系，可在 AI 抽屉生成，或回到资料确认页重新整理作品级人物关系。"
      @select="key => emit('open-modal', { kind: 'character', key })"
    />
  </section>
</template>
<script setup>
import { computed, ref } from 'vue'
import ScriptEditor from '../../../components/ScriptEditor.vue'
import CharacterAvatar from '../../../components/blueprint/CharacterAvatar.vue'
import ItemGlyph from '../../../components/blueprint/ItemGlyph.vue'
import RelationBoard from '../../../components/blueprint/RelationBoard.vue'

// 章节级 6 个 Tab：概要 / 文本 / 分镜可编辑；人物 / 物品 / 关系只读引用 ChapterMeta。
const props = defineProps({
  tab: { type: String, default: 'summary' },
  chapter: { type: Object, required: true },
  meta: { type: Object, default: () => ({ cast: [], items: [], edges: [], aiSummary: '' }) },
  blueprint: { type: Object, required: true },
  canEdit: Boolean,
  saving: Boolean
})
const emit = defineEmits(['update:summary', 'update:text', 'update:storyboard', 'save', 'goto', 'open-modal', 'view-work'])
const shotArea = ref(null)

const characterMap = computed(() => new Map(props.blueprint.characters.map(character => [character.key, character])))
const itemMap = computed(() => new Map(props.blueprint.items.map(item => [item.key, item])))
const castRows = computed(() => (props.meta.cast || []).map(entry => ({ ...entry, character: characterMap.value.get(entry.key) })).filter(row => row.character))
const itemRows = computed(() => (props.meta.items || []).map(entry => ({ ...entry, item: itemMap.value.get(entry.key) })).filter(row => row.item))
const relationCharacters = computed(() => {
  const keys = new Set((props.meta.edges || []).flatMap(edge => [edge.a, edge.b]))
  const list = props.blueprint.characters.filter(character => keys.has(character.key))
  return list.length ? list : (props.meta.cast || []).map(entry => characterMap.value.get(entry.key)).filter(Boolean)
})
const summaryWords = computed(() => String(props.chapter.summary || '').replace(/\s/g, '').length)
const textWords = computed(() => String(props.chapter.plainText || '').replace(/\s/g, '').length)
const shotLines = computed(() => String(props.chapter.storyboardContent || '').split('\n').filter(line => line.trim()).length)

// 分镜工具栏：在光标处补一个镜头骨架，保持纯文本编辑。
function insertShot(token) {
  if (!props.canEdit) return
  const area = shotArea.value
  const current = props.chapter.storyboardContent || ''
  const line = /^\d/.test(token) ? token : `${token}｜画面｜运镜`
  const nextNo = String(current.split('\n').filter(line => line.trim()).length + 1).padStart(2, '0')
  const text = `${current}${current && !current.endsWith('\n') ? '\n' : ''}${nextNo} ${line}`
  emit('update:storyboard', text)
  requestAnimationFrame(() => { if (area) { area.focus(); area.selectionStart = area.selectionEnd = area.value.length } })
}
</script>
