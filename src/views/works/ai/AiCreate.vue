<template>
  <section class="v3-scope" aria-label="创作 · AI 起稿">
    <div class="page">
      <div class="ai-page">
        <header class="ai-head">
          <button class="ai-back" type="button" @click="goWorks">← 返回工作台</button>
          <div class="ai-head-copy">
            <h1>创作 · AI 起稿</h1>
            <p>先确定作品设定，再让 AI 生成可逐项确认的作品资料。</p>
          </div>
          <ol class="steps" aria-label="创作步骤">
            <li class="active" aria-current="step">一 作品设定</li>
            <li aria-hidden="true"><i></i></li>
            <li>二 资料确认</li>
            <li aria-hidden="true"><i></i></li>
            <li>三 进入工作台</li>
          </ol>
        </header>

        <div class="ai-body">
          <form class="sheet" novalidate @submit.prevent="generate">
            <div class="sheet-title">
              <h2>作品设定</h2>
              <p>AI 只根据这些设定整理资料，不会在此直接生成章节。</p>
            </div>
            <div class="register">
              <label class="reg-row">
                <span class="reg-key">书名 <em aria-hidden="true">*</em></span>
                <input v-model="setup.title" class="reg-title" maxlength="100" required placeholder="例如：深夜频率" aria-label="书名" :disabled="generating" />
              </label>
              <label class="reg-row">
                <span class="reg-key">故事灵感 <em aria-hidden="true">*</em></span>
                <textarea v-model="setup.idea" rows="4" maxlength="2000" required placeholder="一句话讲清人物、冲突与悬念，例如：一位深夜电台主播在听众留言里听到了十年前的自己。" aria-label="故事灵感" :disabled="generating" />
              </label>
              <label class="reg-row">
                <span class="reg-key">题材</span>
                <select v-model="setup.genre" aria-label="题材" :disabled="generating">
                  <option value="">请选择题材</option>
                  <option v-for="genre in genres" :key="genre" :value="genre">{{ genre }}</option>
                </select>
              </label>
              <label class="reg-row">
                <span class="reg-key">计划集数</span>
                <span class="reg-inline">
                  <input v-model.number="setup.episodes" class="reg-count" type="number" min="1" max="60" step="1" aria-label="计划集数" :disabled="generating" />
                  <span class="reg-hint">集，1–60</span>
                </span>
              </label>
              <label class="reg-row">
                <span class="reg-key">单集时长</span>
                <select v-model.number="setup.minutes" aria-label="单集时长" :disabled="generating">
                  <option :value="1">1 分钟</option>
                  <option :value="1.5">1.5 分钟</option>
                  <option :value="2">2 分钟</option>
                </select>
              </label>
              <label class="reg-row">
                <span class="reg-key">你的要求</span>
                <textarea v-model="setup.prompt" rows="3" maxlength="1000" placeholder="第一集就出现异常线索。人物对白自然，结尾保留一个能推动下一集的悬念。" aria-label="你的要求" :disabled="generating" />
              </label>
              <label class="reg-row">
                <span class="reg-key">模型</span>
                <select v-model="setup.model" aria-label="模型" :disabled="generating">
                  <option value="">默认模型</option>
                  <option v-for="option in modelOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
                </select>
              </label>
              <label v-if="advanced" class="reg-row">
                <span class="reg-key">导演 Skill</span>
                <select v-model="setup.skillId" aria-label="导演 Skill" :disabled="generating">
                  <option value="">默认导演</option>
                  <option v-for="skill in skills" :key="skill.id" :value="skill.id">{{ skill.skillName }}</option>
                </select>
              </label>
            </div>
            <button class="advanced-toggle" type="button" :aria-expanded="advanced" @click="advanced = !advanced">
              {{ advanced ? '收起高级参数' : '高级参数：导演 Skill / 模型' }}
            </button>
            <p v-if="error" class="note bad" role="alert">{{ error }}</p>
            <p v-if="skillError || modelError" class="cost">{{ skillError || modelError }}</p>
            <footer class="sheet-foot">
              <small>{{ quotaText }}。生成作品资料将按实际 token 扣积分。</small>
              <button v-if="quota === 0" class="btn quiet" type="button" @click="openRecharge">充值</button>
              <button class="btn quiet" type="button" @click="openHistory">AI 使用记录<span v-if="historyCount">（{{ historyCount }}）</span></button>
              <button class="btn" type="submit" :disabled="generating || !canCreate">{{ generating ? '正在生成作品资料…' : '生成作品资料 →' }}</button>
            </footer>
          </form>

          <aside class="ai-side" aria-label="创作流程">
            <h3>创作流程</h3>
            <p>这一版不再在资料阶段生成章节大纲，章节内容全部在「工作台」里逐章生成。</p>
            <ol>
              <li><b>1</b><span><strong>填写设定</strong><br />确定故事方向与创作要求</span></li>
              <li><b>2</b><span><strong>确认资料</strong><br />逐张查看故事核心、世界规则、人物与物品</span></li>
              <li><b>3</b><span><strong>进入工作台</strong><br />按章生成概要、正文、分镜与人物关系</span></li>
            </ol>
            <div v-if="generating" class="progress-list" role="status" aria-live="polite">
              <span v-for="stage in stages" :key="stage.key" :data-state="stage.state">{{ stage.state === 'done' ? '✓' : stage.state === 'active' ? '·' : '·' }} {{ stage.label }}</span>
            </div>
            <div class="notice">作品资料会作为工作台里每一章创作的共同上下文。</div>
          </aside>
        </div>
      </div>
    </div>

    <PortalLayer v-model="historyOpen" title="AI 使用记录">
      <div class="panel-content">
        <LoadState :pending="historyLoading" :error="historyError" :retry="loadHistory" :empty="!historyLoading && !historyError && !historyRecords.length" empty-text="还没有 AI 生成记录" />
        <ul v-if="historyRecords.length" class="usage-list">
          <li v-for="record in historyRecords" :key="record.recordId">
            <span class="usage-type">{{ historyLabels[record.type] || 'AI 创作' }}</span>
            <b>{{ record.title || '独立创作' }}</b>
            <small>{{ record.tokens == null ? '—' : record.tokens + ' token' }} · {{ dateText(record.createdAt) }}</small>
          </li>
        </ul>
      </div>
    </PortalLayer>
  </section>
</template>
<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { usePortal } from '../../../utils/portal.js'
import { quotaTip, dateText } from '../../../utils/creator.js'
import { stashDraft, takeDraft } from '../../../composables/useBlueprint.js'
import PortalLayer from '../../../components/PortalLayer.vue'
import LoadState from '../../../components/LoadState.vue'
import '../../../assets/styles/studio.css'

const { api, user, canCreate, goWorks, openPanel, handleError } = usePortal()
const router = useRouter()
const route = useRoute()

const genres = ['都市悬疑', '都市情感', '玄幻冒险', '古装权谋', '科幻未来', '青春校园']
const setup = reactive({ title: '', idea: '', genre: '都市悬疑', episodes: 12, minutes: 2, prompt: '', skillId: '', model: '' })
const advanced = ref(false)
const generating = ref(false)
const error = ref('')
const quota = ref(null)
const skills = ref([])
const skillError = ref('')
const modelChannels = ref([])
const modelError = ref('')
const activeStage = ref('')
const historyOpen = ref(false)
const historyLoading = ref(false)
const historyError = ref('')
const historyRecords = ref([])
const historyLabels = { outline: '剧本大纲', write: '章节正文', polish: '润色', storyboard: '分镜', blueprint: '作品资料' }

const STAGES = [
  { key: 'story', label: '故事核心' },
  { key: 'world', label: '世界规则' },
  { key: 'characters', label: '主要人物' },
  { key: 'items', label: '关键物品' },
  { key: 'outline', label: '三幕大纲' }
]
const stages = computed(() => {
  const current = STAGES.findIndex(stage => stage.key === activeStage.value)
  return STAGES.map((stage, index) => ({ ...stage, state: index < current ? 'done' : index === current ? 'active' : 'pending' }))
})

const modelOptions = computed(() => (modelChannels.value || []).flatMap(channel =>
  (channel.models || []).map(model => ({ value: model, label: `${channel.channelName} · ${model}${model === channel.defaultModel ? '（默认）' : ''}` }))
))
const quotaText = computed(() => quota.value === null ? '剩余积分 —' : `剩余 ${Number(quota.value) || 0} 积分`)
const historyCount = computed(() => historyRecords.value.length)

function openRecharge() { openPanel?.('recharge') }

async function loadQuota() {
  if (!api.value?.getAiQuota || !user.value?.userId) return
  try { quota.value = (await api.value.getAiQuota(user.value.userId)).available }
  catch (failure) { if (failure.message?.includes('积分不足')) quota.value = 0; else await handleError(failure) }
}

async function loadSkills() {
  if (!api.value?.listAiSkills) return
  try {
    // 起稿只写剧本，分镜类导演( skillType=storyboard )不属于这里的「导演」。
    skills.value = (await api.value.listAiSkills()).filter(skill => !skill.skillType || skill.skillType === 'write')
  } catch (failure) { skillError.value = `导演列表暂不可用：${failure.message || '请稍后重试'}` }
}

async function loadModels() {
  if (!api.value?.listAiModels) return
  try { modelChannels.value = await api.value.listAiModels() }
  catch (failure) { modelError.value = `模型列表暂不可用，将使用默认模型：${failure.message || ''}` }
}

async function loadHistory() {
  if (!api.value?.listAiRecords) return
  historyLoading.value = true; historyError.value = ''
  try { historyRecords.value = (await api.value.listAiRecords()).slice(0, 50) }
  catch (failure) { historyError.value = failure.message || '记录加载失败' }
  finally { historyLoading.value = false }
}

function openHistory() { historyOpen.value = true; loadHistory() }

function validate() {
  const title = setup.title.trim()
  if (!title) return '请输入书名'
  if (title.length > 100) return '书名最多 100 字'
  const idea = setup.idea.trim()
  if (idea.length < 10) return '故事灵感请至少写 10 个字'
  if (idea.length > 2000) return '故事灵感最多 2000 字'
  const episodes = Number(setup.episodes)
  if (!Number.isInteger(episodes) || episodes < 1 || episodes > 60) return '计划集数需为 1–60 的整数'
  return ''
}

async function generate() {
  if (generating.value) return
  error.value = ''
  const invalid = validate()
  if (invalid) { error.value = invalid; return }
  if (!canCreate.value) { error.value = '请先开通创作者能力'; return }
  if (quota.value === 0) { error.value = quotaTip(0); return }
  generating.value = true
  activeStage.value = ''
  try {
    const result = await api.value.generateStream('blueprint', {
      title: setup.title.trim(),
      inspiration: setup.idea.trim(),
      genre: setup.genre,
      episodes: Number(setup.episodes),
      minutes: Number(setup.minutes),
      prompt: setup.prompt.trim(),
      skillId: setup.skillId || undefined,
      model: setup.model || undefined
    }, undefined, stage => { activeStage.value = stage })
    if (!result?.sessionId || !result.blueprint) throw new Error('生成响应缺少作品资料或会话编号')
    const sessionId = String(result.sessionId)
    stashDraft({ sessionId, setup: { ...setup } })
    ElMessage.success('作品资料已生成，请逐项确认')
    await router.push({ path: '/works/create/ai/blueprint', query: { sessionId } })
  } catch (failure) {
    error.value = failure?.message || '生成失败，请稍后重试'
    if (failure?.status || failure?.code) await handleError(failure)
  } finally {
    generating.value = false
  }
}

onMounted(() => {
  const stored = takeDraft()
  if (stored?.setup && stored.sessionId === route.query.sessionId) Object.assign(setup, stored.setup)
  loadQuota(); loadSkills(); loadModels(); loadHistory()
  window.addEventListener('recharge-success', loadQuota)
})
onBeforeUnmount(() => window.removeEventListener('recharge-success', loadQuota))
</script>
<style scoped>
.usage-list { list-style: none; margin: 0; padding: 0; }
.usage-list li { padding: 11px 0; border-bottom: 1px solid var(--rule); font-size: 12.5px; }
.usage-list li b { display: block; margin: 3px 0; font-family: var(--serif); font-weight: 600; color: var(--ink); overflow-wrap: anywhere; }
.usage-list li small { color: var(--ink-3); font-size: 11px; }
.usage-type { display: inline-block; padding: 1px 7px; border: 1px solid var(--rule-2); border-radius: 2px; color: var(--indigo); font-size: 11px; }
</style>
