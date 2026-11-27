<template>
  <section class="v3-scope" aria-label="资料确认">
    <div class="page">
      <div class="blueprint">
        <header class="blueprint-head">
          <button class="back" type="button" @click="backToSetup">← 返回设定</button>
          <span class="line" aria-hidden="true"></span><button type="button" class="step-btn" :disabled="busy || Boolean(regenerating)" @click="backToSetup">作品设定</button>
          <span class="line" aria-hidden="true"></span><button type="button" class="step-btn active" aria-current="step">资料确认</button>
          <span class="line" aria-hidden="true"></span><button type="button" class="step-btn" :disabled="busy || Boolean(regenerating)" @click="goStudioStep">工作台</button>
          <span class="grow"></span>
          <button class="btn quiet" type="button" :disabled="busy || regenerating || !hasDraft" @click="confirm(false)">跳过查看，直接进入工作台</button>
        </header>

        <div class="page-head">
          <div>
            <div class="eyebrow">AI STORY BLUEPRINT</div>
            <h1>《{{ title }}》的作品资料</h1>
            <p>故事核心、世界规则、人物与物品逐项确认；作品大纲进入工作台后查看。</p>
          </div>
          <button class="btn" type="button" :disabled="busy || regenerating || !hasDraft" @click="confirm(true)">{{ busy ? '正在创建作品…' : '确认资料，进入工作台 →' }}</button>
        </div>

        <p v-if="error" class="note bad" role="alert">{{ error }}</p>

        <section v-if="loading" class="blue-empty-block" role="status">正在读取作品资料…</section>
        <section v-else-if="!hasDraft" class="blue-empty-block">
          <h2>没有可确认的作品资料</h2>
          <button v-if="sessionId" class="btn quiet" type="button" @click="load">重新读取</button>
          <button class="btn" type="button" @click="backToSetup">返回作品设定</button>
        </section>

        <div v-else class="blueprint-grid" :aria-busy="regenerating">
          <article
            class="blue-card wide"
            role="button"
            tabindex="0"
            data-section="storyCore"
            :data-busy="busySection === 'storyCore'"
            @click="openModal('story')"
            @keydown.enter.prevent="openModal('story')"
            @keydown.space.prevent="openModal('story')"
          >
            <button class="regen" type="button" :disabled="busySection !== ''" @click.stop="regenerate('storyCore')">{{ busySection === 'storyCore' ? '正在整理…' : 'AI 重新整理' }}</button>
            <div class="mark" aria-hidden="true">✦</div>
            <h3>故事核心</h3>
            <p>{{ blueprint.storyCore.summary || '故事核心尚未整理，点击卡片让 AI 重新整理。' }}</p>
            <span class="more">查看完整内容 ↗</span>
          </article>

          <article
            class="blue-card"
            role="button"
            tabindex="0"
            data-section="world"
            :data-busy="busySection === 'world'"
            @click="openModal('world')"
            @keydown.enter.prevent="openModal('world')"
            @keydown.space.prevent="openModal('world')"
          >
            <button class="regen" type="button" :disabled="busySection !== ''" @click.stop="regenerate('world')">{{ busySection === 'world' ? '正在整理…' : 'AI 重新整理' }}</button>
            <div class="mark" aria-hidden="true">◌</div>
            <h3>世界与规则</h3>
            <p>{{ worldSummary }}</p>
            <span class="more">查看完整内容 ↗</span>
          </article>

          <article
            class="blue-card half"
            role="button"
            tabindex="0"
            data-section="characters"
            :data-busy="busySection === 'characters'"
            @click="openModal('characters')"
            @keydown.enter.prevent="openModal('characters')"
            @keydown.space.prevent="openModal('characters')"
          >
            <button class="regen" type="button" :disabled="busySection !== ''" @click.stop="regenerate('characters')">{{ busySection === 'characters' ? '正在整理…' : 'AI 重新整理' }}</button>
            <div class="mark" aria-hidden="true">◎</div>
            <h3>主要人物</h3>
            <p>{{ characterSummary }}</p>
            <div v-if="blueprint.characters.length" class="people">
              <figure v-for="character in blueprint.characters.slice(0, 4)" :key="character.key">
                <CharacterAvatar :name="character.name" :color="character.color" :src="character.portraitUrl" />
                <figcaption>{{ character.name }}</figcaption>
              </figure>
            </div>
            <span class="more">{{ blueprint.characters.length }} 位人物 · 查看详情 ↗</span>
          </article>

          <article
            class="blue-card half"
            role="button"
            tabindex="0"
            data-section="items"
            :data-busy="busySection === 'items'"
            @click="openModal('items')"
            @keydown.enter.prevent="openModal('items')"
            @keydown.space.prevent="openModal('items')"
          >
            <button class="regen" type="button" :disabled="busySection !== ''" @click.stop="regenerate('items')">{{ busySection === 'items' ? '正在整理…' : 'AI 重新整理' }}</button>
            <div class="mark" aria-hidden="true">◇</div>
            <h3>关键物品</h3>
            <p>{{ itemSummary }}</p>
            <span class="more">{{ blueprint.items.length }} 件物品 · 查看台账 ↗</span>
          </article>
        </div>

        <div v-if="hasDraft" class="blue-actions">
          <button class="btn quiet" type="button" :disabled="busy || regenerating" @click="regenerateAll">{{ regenerating === 'all' ? '正在重新整理全部资料…' : '重新生成全部资料' }}</button>
          <button class="btn" type="button" :disabled="busy || regenerating || !hasDraft" @click="confirm(true)">{{ busy ? '正在创建作品…' : '确认资料，进入工作台 →' }}</button>
        </div>
      </div>
    </div>

    <BlueprintDetailModal
      v-if="hasDraft"
      v-model="modalOpen"
      :kind="modalKind"
      :blueprint="blueprint"
      :focus-key="modalKey"
      :show-regen="blueprint.status === 'draft'"
      :busy="busySection !== ''"
      @focus="({ kind, key }) => openModal(kind, key)"
      @regenerate="instruction => regenerateModal(instruction)"
    />
  </section>
</template>
<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { usePortal } from '../../../utils/portal.js'
import { quotaTip } from '../../../utils/creator.js'
import { normalizeBlueprint } from '../../../utils/blueprint.js'
import { clearDraft, stashDraft, takeDraft } from '../../../composables/useBlueprint.js'
import BlueprintDetailModal from '../../../components/blueprint/BlueprintDetailModal.vue'
import CharacterAvatar from '../../../components/blueprint/CharacterAvatar.vue'
import '../../../assets/styles/studio.css'

const { api, user, openPanel, handleError } = usePortal()
const router = useRouter()
const route = useRoute()

const sessionId = computed(() => /^\d+$/.test(route.query.sessionId ?? '') ? String(route.query.sessionId) : '')
const loading = ref(false)
const blueprint = ref(null)
const hasDraft = computed(() => Boolean(blueprint.value))
const title = ref('未命名作品')
const error = ref('')
const busy = ref(false)
const regenerating = ref('')
const busySection = ref('')
const modalOpen = ref(false)
const modalKind = ref('story')
const modalKey = ref('')
const createdWorkId = ref(null)
const quota = ref(null)

const worldSummary = computed(() => {
  const world = blueprint.value?.world
  if (!world) return ''
  if (world.setting) return world.setting
  if (world.rules.length) return world.rules.map(rule => `${rule.name}：${rule.detail}`).join('；')
  return '世界与规则尚未整理，点击卡片让 AI 重新整理。'
})
const characterSummary = computed(() => {
  const list = blueprint.value?.characters || []
  if (!list.length) return '还没有整理出人物，可让 AI 重新整理主要人物。'
  return list.slice(0, 3).map(character => `${character.name}：${character.role || '身份待补充'}`).join('；')
})
const itemSummary = computed(() => {
  const list = blueprint.value?.items || []
  if (!list.length) return '还没有整理出关键物品，可让 AI 重新整理。'
  const tracks = list.reduce((total, item) => total + item.track.length, 0)
  return `${list.map(item => item.name).slice(0, 3).join('、')} 已进入创作台账${tracks ? `，共记录 ${tracks} 条追踪轨迹` : ''}，后续章节会持续维护它们的状态。`
})

function backToSetup() {
  // 刷新后内存表单已丢失：sessionStorage 里还能找到同会话且带表单的快照时，不覆盖它。
  const stored = takeDraft()
  const draftSetup = stored?.setup && String(stored.sessionId ?? '') === sessionId.value ? stored.setup : null
  if (!draftSetup) stashDraft({ sessionId: sessionId.value, workId: createdWorkId.value || undefined })
  router.replace({ path: '/works/create/ai', query: sessionId.value ? { sessionId: sessionId.value } : {} })
}

/** 顶部「工作台」步骤：已创建直接进入；有草稿则确认创建；否则回工作台列表。 */
function goStudioStep() {
  if (busy.value || regenerating.value) return
  if (createdWorkId.value) return router.push(`/works/${createdWorkId.value}/studio`)
  if (hasDraft.value) return confirm(true)
  router.push('/works')
}

function openModal(kind, key = '') {
  modalKind.value = kind
  modalKey.value = key
  modalOpen.value = true
}

async function regenerate(section, instruction = '', key = '') {
  if (!hasDraft.value || regenerating.value || busySection.value) return
  if (blueprint.value.status === 'confirmed') { ElMessage.info('资料已确认，请到工作台修改'); return }
  if (quota.value === 0) {
    ElMessage.warning(quotaTip(0))
    openPanel?.('recharge')
    return
  }
  busySection.value = section
  regenerating.value = section === 'all' ? 'all' : 'section'
  error.value = ''
  try {
    const result = await api.value.generateStream('blueprint/regenerate', {
      sessionId: sessionId.value, section, key: key || undefined, instruction: instruction || undefined
    })
    if (!result?.blueprint) throw new Error('整理响应缺少作品资料')
    blueprint.value = normalizeBlueprint(result.blueprint)
    ElMessage.success(instruction ? `AI 已按「${instruction}」重新整理${sectionLabel(section)}` : `AI 已重新整理${sectionLabel(section)}`)
  } catch (failure) {
    ElMessage.warning(failure?.message || '整理失败，请稍后重试')
    if (failure?.status || failure?.code) await handleError(failure)
  } finally {
    busySection.value = ''
    regenerating.value = ''
  }
}

async function regenerateAll() {
  if (!hasDraft.value || regenerating.value || busySection.value) return
  try {
    await ElMessageBox.confirm('将用新生成的资料替换当前全部内容，人物与物品条目会重新整理。是否继续？', '重新生成全部资料', { confirmButtonText: '重新生成', cancelButtonText: '取消', type: 'warning' })
  } catch { return }
  await regenerate('all')
}

function regenerateModal(instruction) {
  return regenerate(modalSection.value, instruction, modalKey.value)
}
const modalSection = computed(() => ({ story: 'storyCore', world: 'world', character: 'characters', characters: 'characters', item: 'items', items: 'items' })[modalKind.value] || 'storyCore')
const sectionLabel = section => ({ storyCore: '故事核心', world: '世界与规则', characters: '主要人物', items: '关键物品', outline: '作品大纲', all: '全部资料', relations: '人物关系' })[section] || '资料'

async function confirm(withShell) {
  if (!hasDraft.value || busy.value) return
  busy.value = true
  error.value = ''
  try {
    const workId = createdWorkId.value || (await api.value.confirmBlueprint(sessionId.value))?.workId
    if (!workId) throw new Error('作品创建失败，响应缺少作品编号')
    createdWorkId.value = workId
    blueprint.value = { ...blueprint.value, status: 'confirmed' }
    if (withShell && !await firstChapterExists(workId)) {
      try {
        await api.value.saveChapter(workId, { chapterNo: 1, chapterTitle: '第 1 章', content: '', summary: '' })
      } catch (failure) {
        if (!await firstChapterExists(workId)) throw failure
      }
    }
    clearDraft()
    ElMessage.success(withShell ? '作品已创建，进入工作台创作第 1 章' : '作品已创建，可在大纲页新建章节')
    await router.replace({
      path: `/works/${workId}/studio`,
      query: withShell ? { view: 'chapter', chapter: '1', tab: 'summary' } : { view: 'outline' }
    })
  } catch (failure) {
    error.value = createdWorkId.value
      ? `作品已创建，第 1 章创建失败。${failure.message || '请重试'}`
      : (failure.message || '创建作品失败，请稍后重试')
    if (failure?.status) await handleError(failure)
  } finally {
    busy.value = false
  }
}

async function firstChapterExists(workId) {
  const detail = await api.value.getWork(workId)
  return detail?.chapters?.some(chapter => Number(chapter.chapterNo) === 1) ?? false
}

async function load() {
  const id = sessionId.value
  blueprint.value = null
  createdWorkId.value = null
  error.value = ''
  loading.value = Boolean(id)
  if (!id) return
  try {
    const result = await api.value.getBlueprint(id)
    if (id !== sessionId.value) return
    if (!result?.blueprint) throw new Error('该会话没有可确认的作品资料')
    title.value = result.title || '未命名作品'
    blueprint.value = normalizeBlueprint({ ...result.blueprint, status: result.status })
    createdWorkId.value = result.workId || null
  } catch (failure) {
    if (id !== sessionId.value) return
    error.value = failure?.message || '读取作品资料失败'
    if (failure?.status || failure?.code) await handleError(failure)
  } finally {
    if (id === sessionId.value) loading.value = false
  }
}

async function loadQuota() {
  if (!api.value?.getAiQuota || !user.value?.userId) return
  try { quota.value = (await api.value.getAiQuota(user.value.userId)).available }
  catch { quota.value = null }
}

onMounted(() => {
  load()
  loadQuota()
  window.addEventListener('recharge-success', loadQuota)
})
watch(sessionId, load)
onBeforeUnmount(() => window.removeEventListener('recharge-success', loadQuota))
</script>
<style scoped>
.blue-empty-block { padding: 48px 24px; text-align: center; border: 1px dashed var(--rule-2); background: #fcfbf8; }
.blue-empty-block h2 { font-size: 20px; margin-bottom: 8px; }
.blue-empty-block p { margin: 0 0 18px; color: var(--ink-3); font-size: 13px; }
</style>
