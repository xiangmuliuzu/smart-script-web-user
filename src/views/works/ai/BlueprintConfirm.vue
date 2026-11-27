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
          <button class="btn" type="button" :disabled="busy || regenerating || !hasDraft" @click="confirm(true)">{{ busy ? busyStep : '确认资料，进入工作台 →' }}</button>
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
              <figure v-for="character in blueprint.characters.slice(0, 4)" :key="character.key" class="person" tabindex="0" :aria-label="`${character.name}的人物资料`">
                <CharacterAvatar :name="character.name" :color="character.color" :src="character.portraitUrl" />
                <figcaption>{{ character.name }}</figcaption>
                <div class="person-pop" role="tooltip">
                  <div class="pp-head">
                    <b>{{ character.name }}</b>
                    <span>{{ character.role || '身份待补充' }}</span>
                  </div>
                  <dl v-if="personRows(character).length">
                    <template v-for="row in personRows(character)" :key="row.label">
                      <dt>{{ row.label }}</dt><dd>{{ row.value }}</dd>
                    </template>
                  </dl>
                  <p v-else class="pp-empty">人物资料待补充，可让 AI 重新整理主要人物。</p>
                </div>
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
          <button class="btn" type="button" :disabled="busy || regenerating || !hasDraft" @click="confirm(true)">{{ busy ? busyStep : '确认资料，进入工作台 →' }}</button>
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
import { clearDraft, readBlueprint, stashDraft, takeDraft } from '../../../composables/useBlueprint.js'
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
const busyStep = ref('')
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

/** 头像悬浮卡：只列出有内容的人物字段，避免整片「待补充」占位。 */
function personRows(character) {
  const rows = [
    { label: '年龄 / 性别', value: [character.age, character.gender].filter(Boolean).join(' / ') },
    { label: '外貌与气质', value: character.appearance },
    { label: '性格特点', value: character.trait },
    { label: '人物目标', value: character.goal },
    { label: '人物秘密', value: character.secret },
    { label: '成长线', value: character.growth }
  ]
  return rows.filter(row => row.value)
}

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
  busyStep.value = '正在创建作品…'
  error.value = ''
  try {
    const confirmed = createdWorkId.value ? null : await api.value.confirmBlueprint(sessionId.value)
    const workId = createdWorkId.value || confirmed?.workId
    if (!workId) throw new Error('作品创建失败，响应缺少作品编号')
    createdWorkId.value = workId
    blueprint.value = { ...blueprint.value, status: 'confirmed' }
    // 已在建壳失败后重试时，createdWorkId 会复用：跳过重复创建，只补第 1 章。
    if (withShell) await ensureFirstChapter(workId)
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
    busyStep.value = ''
    busy.value = false
  }
}

/**
 * 确认资料后保证第 1 章有可用的标题与概要：
 * 1. 第 1 章已有非空 summary → 直接复用，不再调用 AI（避免重复扣费）；
 * 2. 否则让 AI 依据作品资料生成章节草稿，写入概要并落本章人物/物品/关系；
 * 3. AI 失败不阻断进入工作台：提示后兜底建一个空壳第 1 章。
 */
async function ensureFirstChapter(workId) {
  const existing = await firstChapter(workId)
  if (existing?.summary?.trim()) return existing
  busyStep.value = '正在生成第 1 章概要…'
  let draft = null
  try {
    const result = await api.value.generateStream('chapter-draft', { workId, chapterNo: 1 })
    if (!result?.draft) throw new Error('生成响应缺少章节草稿')
    draft = result.draft
  } catch (failure) {
    if (failure?.status || failure?.code) await handleError(failure)
    ElMessage.warning(`第 1 章概要生成失败，已先建好空白章节。${failure?.message || '可在工作台重新整理'}`)
  }
  busyStep.value = draft ? '正在保存第 1 章概要…' : '正在创建第 1 章…'
  const title = String(draft?.title || '').trim().slice(0, 100) || existing?.chapterTitle || '第 1 章'
  const summary = String(draft?.summary || '').slice(0, 500)
  try {
    const saved = await api.value.saveChapter(workId, {
      chapterId: existing?.chapterId || undefined,
      chapterNo: existing?.chapterId ? undefined : 1,
      chapterTitle: title,
      // 已存在空章走更新分支：带上原正文，避免把已有内容清空。
      content: existing?.content || '',
      summary
    })
    // 后端更新章节返回 AppApiResponse<Void>（data 为 null），只有新建才一定有 chapterId。
    const chapterId = existing?.chapterId || saved?.chapterId
    if (!chapterId) throw new Error('章节保存响应缺少编号')
    if (draft) {
      try {
        await api.value.saveChapterMeta(workId, 1, { cast: draft.cast, items: draft.items, edges: draft.edges, aiSummary: summary, source: 'ai' })
      } catch (failure) {
        ElMessage.warning(`第 1 章已创建，本章资料保存失败，可在工作台重新整理。${failure?.message || ''}`)
      }
    }
    return { chapterId }
  } catch (failure) {
    // 并发或重试场景下第 1 章可能已被别处建好，别让用户卡在资料确认页。
    const current = await firstChapter(workId)
    if (current) return current
    throw failure
  }
}

async function firstChapter(workId) {
  const detail = await api.value.getWork(workId)
  return detail?.chapters?.find(chapter => Number(chapter.chapterNo) === 1) || null
}

async function load() {
  const id = sessionId.value
  blueprint.value = null
  createdWorkId.value = null
  error.value = ''
  loading.value = Boolean(id)
  if (!id) return
  const stored = takeDraft()
  const storedSetup = stored?.setup && String(stored.sessionId ?? '') === id ? stored.setup : null
  const fallbackTitle = storedSetup?.title || '未命名作品'
  try {
    const result = await api.value.getBlueprint(id)
    if (id !== sessionId.value) return
    if (!result?.blueprint) throw new Error('该会话没有可确认的作品资料')
    title.value = result.title || fallbackTitle
    blueprint.value = normalizeBlueprint({ ...result.blueprint, status: result.status })
    createdWorkId.value = result.workId || null
  } catch (failure) {
    if (id !== sessionId.value) return
    // 读取接口暂不可用（样例环境/网络抖动）时，用起稿页交接过来的本机快照兜底，保证确认按钮可用。
    const local = readBlueprint(id)
    if (local) {
      title.value = fallbackTitle
      blueprint.value = local
      error.value = `读取作品资料失败，已先显示本机保存的资料，进入工作台时会重新校验。${failure?.message || ''}`
      return
    }
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
