<template>
  <section class="v3-scope" aria-label="资料确认">
    <div class="page">
      <div class="blueprint">
        <header class="blueprint-head">
          <button class="back" type="button" @click="backToSetup">← 返回设定</button>
          <span class="line" aria-hidden="true"></span><span>作品设定</span>
          <span class="line" aria-hidden="true"></span><b>资料确认</b>
          <span class="line" aria-hidden="true"></span><span>工作台</span>
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

        <p v-if="offlineReason" class="note warn" role="status">AI 服务本次未返回完整资料（{{ offlineReason }}），已按你的设定生成可编辑底。可逐项让 AI 重新整理，或直接进入工作台。</p>
        <p v-if="error" class="note bad" role="alert">{{ error }}</p>

        <section v-if="!hasDraft" class="blue-empty-block">
          <h2>没有可确认的作品资料</h2>
          <p>起稿资料已失效（可能是刷新后会话被清理）。请回到设定页重新生成。</p>
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
      v-model="modalOpen"
      :kind="modalKind"
      :blueprint="blueprint"
      :busy="busySection !== ''"
      @regenerate="instruction => regenerateModal(instruction)"
    />
  </section>
</template>
<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { usePortal } from '../../../utils/portal.js'
import { quotaTip } from '../../../utils/creator.js'
import {
  blueprintToLedger,
  localReorganize,
  mergeBlueprintSection,
  regeneratePrompt,
  minutesText
} from '../../../utils/blueprint.js'
import { stashDraft, takeDraft, writeBlueprint, writeChapterMeta } from '../../../composables/useBlueprint.js'
import BlueprintDetailModal from '../../../components/blueprint/BlueprintDetailModal.vue'
import CharacterAvatar from '../../../components/blueprint/CharacterAvatar.vue'
import '../../../assets/styles/studio.css'

const { api, user, openPanel, handleError } = usePortal()
const router = useRouter()

const draft = ref(null)
const blueprint = ref(null)
const hasDraft = computed(() => Boolean(blueprint.value))
const setup = computed(() => draft.value?.setup || {})
const title = computed(() => setup.value.title?.trim() || '未命名作品')
const offlineReason = computed(() => draft.value?.offline ? (draft.value.reason || '暂不可用') : '')
const error = ref('')
const busy = ref(false)
const regenerating = ref('')
const busySection = ref('')
const modalOpen = ref(false)
const modalKind = ref('story')
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

function persistDraft(next) {
  blueprint.value = next
  draft.value = { ...draft.value, blueprint: next }
  stashDraft(draft.value)
}

function backToSetup() {
  // 返回设定时保留已填写内容，避免重新输入。
  if (draft.value) stashDraft(draft.value)
  router.replace('/works/create/ai')
}

function openModal(kind) {
  modalKind.value = kind
  modalOpen.value = true
}

/** 重新整理：优先真实 AI；失败或无内容时用确定性本地整理兜底，按钮一定给结果。 */
async function regenerate(section, instruction = '') {
  if (!hasDraft.value || regenerating.value || busySection.value) return
  if (blueprint.value.status === 'confirmed') { ElMessage.info('资料已确认，请到工作台修改'); return }
  if (!api.value?.generateStream) { localFallback(section); return }
  if (quota.value === 0) {
    ElMessage.warning(quotaTip(0))
    openPanel?.('recharge')
    return
  }
  busySection.value = section
  regenerating.value = section === 'all' ? 'all' : 'section'
  error.value = ''
  try {
    const prompt = regeneratePrompt(blueprint.value, section, instruction)
    const result = await api.value.generateStream('write', {
      prompt,
      type: 'blueprint',
      skillId: setup.value.skillId || undefined,
      model: setup.value.model || undefined
    }, () => {})
    const content = result?.content || ''
    const next = mergeBlueprintSection(blueprint.value, section, content)
    persistDraft(next)
    ElMessage.success(instruction ? `AI 已按「${instruction}」重新整理${sectionLabel(section)}` : `AI 已重新整理${sectionLabel(section)}`)
  } catch (failure) {
    // 网络/模型不可用：不清空原资料，改用本地确定性整理并说明原因。
    localFallback(section, failure?.message)
  } finally {
    busySection.value = ''
    regenerating.value = ''
  }
}

function localFallback(section, reason = '') {
  const { blueprint: next, changed } = localReorganize(blueprint.value, section)
  persistDraft(next)
  if (changed) ElMessage.success(`AI 暂不可用，已按现有资料重新整理${sectionLabel(section)}${reason ? '（' + reason + '）' : ''}`)
  else ElMessage.info(`资料已经是整理状态${reason ? '（AI 暂不可用：' + reason + '）' : ''}`)
}

async function regenerateAll() {
  if (!hasDraft.value || regenerating.value || busySection.value) return
  try {
    await ElMessageBox.confirm('将用新生成的资料替换当前全部内容，人物与物品条目会重新整理。是否继续？', '重新生成全部资料', { confirmButtonText: '重新生成', cancelButtonText: '取消', type: 'warning' })
  } catch { return }
  await regenerate('all')
}

function regenerateModal(instruction) {
  const section = modalSection.value
  return regenerate(section, instruction)
}
const modalSection = computed(() => ({ story: 'storyCore', world: 'world', characters: 'characters', items: 'items' })[modalKind.value] || 'storyCore')
const sectionLabel = section => ({ storyCore: '故事核心', world: '世界与规则', characters: '主要人物', items: '关键物品', outline: '作品大纲', all: '全部资料', relations: '人物关系' })[section] || '资料'

/**
 * 落库动作：
 * - 确认：createWork → PUT ledger → 持久化 Blueprint → 建第 1 章空壳 → 工作台章节视图；
 * - 跳过：同上但不建空壳章 → 工作台大纲视图。
 * createWork 成功而后续失败时保留 workId，重试不会重复建作品。
 */
async function confirm(withShell) {
  if (!hasDraft.value || busy.value) return
  busy.value = true
  error.value = ''
  const next = { ...blueprint.value, status: 'confirmed' }
  try {
    let workId = createdWorkId.value
    if (!workId) {
      const meta = setup.value
      const summary = next.storyCore.logline || next.storyCore.summary || meta.idea || title.value
      const created = await api.value.createWork({
        title: title.value,
        summary: String(summary || '').slice(0, 500)
      })
      workId = created?.workId
      if (!workId) throw new Error('作品创建失败：响应缺少 workId')
      createdWorkId.value = workId
    }
    await api.value.saveWorkLedger(workId, blueprintToLedger(next))
    writeBlueprint(workId, { ...next, status: 'confirmed' })
    if (withShell) {
      const firstTitle = `第 1 章`
      await api.value.saveChapter(workId, { chapterNo: 1, chapterTitle: firstTitle, content: '', summary: '' })
      writeChapterMeta(workId, 1, { chapterNo: 1, cast: [], items: [], edges: [], source: 'manual' })
    }
    blueprint.value = next
    ElMessage.success(withShell ? '作品已创建，进入工作台创作第 1 章' : '作品已创建，可在大纲页新建章节')
    await router.replace({
      path: `/works/${workId}/studio`,
      query: withShell ? { view: 'chapter', chapter: '1', tab: 'summary' } : { view: 'outline' }
    })
  } catch (failure) {
    error.value = createdWorkId.value
      ? `作品已创建（#${createdWorkId.value}），但资料保存失败：${failure.message || '请重试'}`
      : (failure.message || '创建作品失败，请稍后重试')
    if (failure?.status) await handleError(failure)
  } finally {
    busy.value = false
  }
}

async function loadQuota() {
  if (!api.value?.getAiQuota || !user.value?.userId) return
  try { quota.value = (await api.value.getAiQuota(user.value.userId)).available }
  catch { quota.value = null }
}

onMounted(() => {
  const stored = takeDraft()
  if (!stored?.blueprint) return
  draft.value = stored
  blueprint.value = stored.blueprint
  loadQuota()
  window.addEventListener('recharge-success', loadQuota)
})
</script>
<style scoped>
.blue-empty-block { padding: 48px 24px; text-align: center; border: 1px dashed var(--rule-2); background: #fcfbf8; }
.blue-empty-block h2 { font-size: 20px; margin-bottom: 8px; }
.blue-empty-block p { margin: 0 0 18px; color: var(--ink-3); font-size: 13px; }
</style>
