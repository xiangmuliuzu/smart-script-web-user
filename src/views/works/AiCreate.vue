<template>
  <section class="ai-studio" aria-label="AI 创作">
    <header class="studio-head">
      <button class="studio-back" type="button" @click="leavePage">← <span>返回我的作品</span></button>
      <div class="studio-heading">
        <h1>AI 创作</h1>
        <p :class="{ bad: Boolean(error) }" role="status">{{ error || statusText }}</p>
      </div>
      <button class="studio-history" type="button" @click="openHistory">AI 使用记录<span v-if="historyCount" class="history-count">{{ historyCount > 99 ? '99+' : historyCount }}</span></button>
      <ol class="steps" aria-label="创作步骤">
        <li :aria-current="step === 1 ? 'step' : undefined" :data-done="step > 1">
          <span class="step-no" aria-hidden="true">一</span><span class="step-name">设定</span>
        </li>
        <li :aria-current="step === 2 ? 'step' : undefined" :data-done="step > 2">
          <span class="step-no" aria-hidden="true">二</span><span class="step-name">大纲</span>
        </li>
        <li :aria-current="step === 3 ? 'step' : undefined">
          <span class="step-no" aria-hidden="true">三</span><span class="step-name">章节</span>
        </li>
      </ol>
    </header>

    <div class="studio-body">
      <main class="studio-desk">
        <!-- 一 · 设定 -->
        <section v-if="step === 1" :key="'setup'" class="sheet" aria-label="作品设定">
          <div class="sheet-head">
            <h2>作品设定</h2>
            <p class="sheet-status">先写清楚要讲的故事，AI 会据此生成剧本大纲。</p>
          </div>
          <form @submit.prevent="goOutline">
            <div class="register">
              <label class="reg-row">
                <span class="reg-key">书名<em aria-hidden="true">*</em></span>
                <input v-model="setup.title" class="reg-title" aria-label="书名" maxlength="100" required placeholder="例如：深夜频率" />
              </label>
              <label class="reg-row">
                <span class="reg-key">故事灵感<em aria-hidden="true">*</em></span>
                <textarea v-model="setup.idea" class="reg-idea" aria-label="故事灵感" rows="4" required placeholder="例如：一位深夜电台主播在听众留言里听到了十年前的自己"></textarea>
              </label>
              <label class="reg-row">
                <span class="reg-key">题材</span>
                <input v-model="setup.genre" aria-label="题材" placeholder="都市情感 / 悬疑 / 玄幻，可留空" />
              </label>
              <label class="reg-row">
                <span class="reg-key">集数</span>
                <span class="reg-inline">
                  <input v-model.number="setup.episodes" class="reg-count" aria-label="集数" type="number" min="1" max="200" />
                  <span class="reg-hint">集，1–200</span>
                </span>
              </label>
              <label class="reg-row">
                <span class="reg-key">导演 (skill)</span>
                <select v-model="setup.skillId" aria-label="导演(skill)">
                  <option value="">默认导演</option>
                  <option v-for="skill in skills" :key="skill.id" :value="skill.id">{{ skill.skillName }}</option>
                </select>
              </label>
              <label class="reg-row">
                <span class="reg-key">模型</span>
                <select v-model="setup.model" aria-label="模型">
                  <option value="">默认模型</option>
                  <option v-for="option in modelOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
                </select>
              </label>
            </div>
            <p v-if="skillError || modelError" class="note bad">{{ skillError || modelError }}</p>
            <footer class="sheet-foot">
              <p class="cost">{{ quotaText }}。生成大纲与每章正文都会按 token 扣减积分。</p>
              <button class="btn" type="submit" :disabled="!canCreate">生成剧本大纲</button>
            </footer>
          </form>
        </section>

        <!-- 二 · 大纲 -->
        <section v-else-if="step === 2" :key="'outline'" class="sheet" aria-label="大纲">
          <div class="sheet-head">
            <h2>剧本大纲</h2>
            <p class="sheet-status">
              <span v-if="outlineBusy" class="working"><span class="spinner" aria-hidden="true"></span>正在生成{{ streamingEpisodes.length ? ` · 已写出 ${streamingEpisodes.length} 集` : '' }}</span>
              <span v-else-if="outlineIncomplete">大纲达到长度上限，请减少集数后重新生成。</span>
              <span v-else>选中任意一段，可以提意见让 AI 只改这一段。</span>
            </p>
            <button v-if="outline.trim() && !outlineBusy && !outlineLocked" class="outline-mode" type="button" :aria-pressed="outlineEditing" @click="toggleOutlineMode">{{ outlineEditing ? '完成编辑' : '手动编辑' }}</button>
          </div>
          <div v-if="outlineEditing" class="outline-paper editing">
            <textarea v-model="outline" aria-label="剧本大纲" :disabled="outlineBusy || outlineLocked" placeholder="AI 生成的大纲会出现在这里"></textarea>
          </div>
          <div v-else ref="paperRef" class="outline-paper" @mouseup="captureSelection" @keyup="captureSelection" @touchend="captureSelection">
            <div ref="previewRef" class="outline-preview" aria-label="剧本大纲预览">
              <p v-if="!outline.trim()" class="outline-empty">AI 生成的大纲会出现在这里</p>
              <template v-else>
                <template v-for="(segment, index) in outlineSegments" :key="index">
                  <mark v-if="segment.mark" class="outline-passage" :data-revising="segment.revising || undefined" :data-error="segment.error || undefined">{{ segment.text }}</mark>
                  <template v-else>{{ segment.text }}</template>
                </template>
              </template>
            </div>
            <button v-if="selection && !revising && !outlineBusy && !outlineLocked" class="select-bubble" type="button" :style="bubbleStyle" @mousedown.prevent @click="startRevise">修改这段</button>
          </div>
          <div v-if="revising" class="revise-panel" aria-label="局部修改">
            <div class="revise-passage">
              <span class="revise-label">选中段落 · {{ revising.passage.length }} 字</span>
              <p>{{ previewPassage(revising.passage) }}</p>
            </div>
            <div class="working revise-status" v-if="revising.busy" role="status"><span class="spinner sm" aria-hidden="true"></span>正在改写这一段 · 已收到 {{ revising.output.length }} 字</div>
            <p v-if="revising.error" class="note bad" role="alert">{{ revising.error }}</p>
            <div class="revise-input">
              <input v-model="revising.instruction" aria-label="修改意见" placeholder="哪里不合理、希望怎么改，例如：让反转提前到第二集，别让主角直接说出来" :disabled="revising.busy" @keyup.enter="runRevise" />
              <button class="btn sm" type="button" :disabled="revising.busy || !revising.instruction.trim() || outlineLocked" @click="runRevise">{{ revising.busy ? '正在改写…' : '让 AI 改这一段' }}</button>
              <button class="btn quiet sm" type="button" :disabled="revising.busy" @click="cancelRevise">取消</button>
            </div>
          </div>
          <div v-if="outlineBusy || streamingEpisodes.length" class="episode-strip" aria-label="生成中的分集">
            <span class="strip-label">{{ outlineBusy ? '正在写' : '已写出' }} {{ streamingEpisodes.length }} 集</span>
            <ol>
              <li v-for="episode in streamingEpisodes" :key="episode.title"><i aria-hidden="true"></i>{{ episode.title }}<em v-if="!episode.summary">…</em></li>
            </ol>
          </div>
          <div class="parse-line">
            <template v-if="outline.trim() && !outlineBusy && parsedChapters.length">
              <span class="stamp" data-s="passed" aria-hidden="true">{{ parsedChapters.length }}<br>集</span>
              <p>已识别 <b>{{ parsedChapters.length }}</b> 个分集。确认后逐章生成正文，每个分集都会保存为作品的一章。</p>
            </template>
            <p v-else-if="parsedError" class="note bad" role="alert">{{ parsedError }}</p>
            <p v-else class="cost">生成完成后在这里核对分集标题。</p>
          </div>
          <footer class="sheet-foot">
            <button class="btn quiet" type="button" :disabled="outlineBusy || outlineLocked" @click="regenerateOutline">{{ outline ? '重新生成' : '开始生成' }}</button>
            <button class="btn quiet" type="button" :disabled="outlineLocked" @click="step = 1">上一步</button>
            <button v-if="outlineLocked" class="btn quiet" type="button" :disabled="revising?.busy || running || Boolean(committedWorkId) || committedChapters.length > 0" :title="committedWorkId ? '作品和章节已保存，请到工作台继续修改' : ''" @click="unlockOutline">{{ committedWorkId ? '已保存，到工作台修改' : '解锁大纲' }}</button>
            <button class="btn" type="button" :disabled="outlineBusy || !outline.trim()" @click="goChapters">{{ outlineLocked ? '返回章节' : '确认大纲，进入章节生成' }}</button>
          </footer>
        </section>

        <!-- 三 · 章节 -->
        <section v-else :key="'chapters'" class="sheet" aria-label="逐章生成">
          <div class="sheet-head">
            <h2>逐章生成</h2>
            <p class="sheet-status">{{ chapterStatusText }}</p>
          </div>
          <LoadState :pending="creating" :error="createError" :retry="ensureWork" loading-text="正在创建作品…" />
          <template v-if="workId || chapters.length">
            <LoadState :empty="!chapters.length" empty-text="大纲里没有识别到分集，请返回修改大纲格式。" />
            <template v-if="chapters.length">
              <div class="progress-bar" role="progressbar" :aria-valuenow="generatedCount" aria-valuemin="0" :aria-valuemax="chapters.length" :aria-label="`章节进度：已生成 ${generatedCount}，共 ${chapters.length} 章`">
                <span class="progress-value" :style="{ width: progressPercent + '%' }"></span>
              </div>
              <p v-if="running" class="working strip-status" role="status">
                <span class="spinner" aria-hidden="true"></span>{{ stopping ? '当前章写完后停止，已完成的章节会保存' : runningChapter ? `正在写「${runningChapter.title}」` : '正在准备' }}
                <span class="cost">{{ streamingChars ? `已收到 ${streamingChars.toLocaleString()} 字` : '' }}</span>
                <span class="grow"></span><span class="cost">{{ generatedCount }}/{{ chapters.length }}</span>
              </p>
              <div class="roll-tools">
                <p class="cost">已勾选 {{ selectedCount }} 章，每章生成后立即保存。</p>
                <span class="grow"></span>
                <button class="btn quiet sm" type="button" :disabled="running" @click="toggleAll(selectedCount !== chapters.length)">{{ selectedCount === chapters.length ? '全不选' : '全选' }}</button>
                <button v-if="!running" class="btn" type="button" :disabled="selectedCount === 0 || remainingAiCount === 0" @click="startGeneration">{{ remainingAiCount ? `生成 ${remainingAiCount} 章` : '全部已生成' }}</button>
                <button v-else class="btn quiet" type="button" :disabled="stopping" @click="stopGeneration">{{ stopping ? '正在停止…' : '停止' }}</button>
              </div>
              <ol class="chapter-list">
                <li v-for="(chapter, index) in chapters" :key="chapter.key" class="chapter" :data-state="chapter.state">
                  <label class="chapter-pick" :aria-label="`是否生成 ${chapter.title}`">
                    <input type="checkbox" :checked="chapter.selected" :disabled="running || chapter.state === 'generating'" @change="chapter.selected = $event.target.checked" />
                    <span class="chapter-no" aria-hidden="true">{{ String(index + 1).padStart(2, '0') }}</span>
                  </label>
                  <div class="chapter-copy">
                    <div class="chapter-line">
                      <h3>{{ chapter.title }}</h3>
                      <span :key="chapter.state" class="tag chapter-tag" :class="stateTone[chapter.state]">{{ stateLabels[chapter.state] }}</span>
                    </div>
                    <p>{{ chapter.summary }}</p>
                    <p v-if="chapter.recovered" class="chapter-recovered">来自 AI 使用记录 · 如需保存为分集，请重新生成或写进文章</p>
                    <div v-if="chapter.state === 'generating' && chapter.streaming" class="chapter-live">
                      <span class="working"><span class="spinner sm" aria-hidden="true"></span>正文生成中 · {{ chapter.streaming.length.toLocaleString() }} 字</span>
                      <div class="chapter-prose live">{{ chapter.streaming.slice(-600) }}</div>
                    </div>
                    <div v-if="chapter.state === 'failed'" class="chapter-error">
                      <p class="note bad" role="alert">{{ errors[chapter.key] || '生成失败，请重试。' }}</p>
                      <button class="btn quiet sm" type="button" :disabled="running" @click="generateOne(chapter)">重试本章</button>
                    </div>
                    <details v-if="chapter.state === 'generated' && chapter.content" class="chapter-preview">
                      <summary>查看正文 · {{ wordCount(chapter.content) }} 字</summary>
                      <div class="chapter-prose">{{ documentText(chapter.content) }}</div>
                      <div class="row">
                        <button class="btn quiet sm" type="button" :disabled="running" @click="generateOne(chapter)">重新生成</button>
                        <button class="btn quiet sm" type="button" :disabled="running" @click="removeChapter(chapter)">删除</button>
                      </div>
                    </details>
                  </div>
                </li>
              </ol>
              <footer class="sheet-foot sticky">
                <p class="cost">{{ generatedCount }} 章已保存为草稿，未生成的可以稍后回到工作台继续写。</p>
                <button class="btn" type="button" :disabled="running || saving || !generatedCount" @click="insertToWork">{{ saving ? '正在补存…' : '插入到文章并进入编辑' }}</button>
              </footer>
            </template>
          </template>
        </section>
      </main>

      <aside class="studio-rail" aria-label="本次创作">
        <section class="rail-block">
          <span class="rail-label">作品</span>
          <h2 class="rail-work">{{ setup.title.trim() || '未命名作品' }}</h2>
          <p class="rail-meta">{{ workId ? '已创建草稿 #' + workId : restoredChapters ? '已从使用记录恢复，插入文章时再创建草稿' : '确认大纲后自动创建草稿' }}</p>
        </section>
        <section class="rail-block">
          <span class="rail-label">积分</span>
          <p class="rail-quota">{{ quota === null ? '—' : quota }}</p>
          <div class="rail-actions">
            <button class="rail-refresh" type="button" :disabled="running" @click="refreshQuota">刷新余额</button>
            <button class="rail-refresh rail-recharge" type="button" @click="openRecharge">充值</button>
          </div>
        </section>
        <section v-if="step === 3 && chapters.length" class="rail-block">
          <span class="rail-label">进度</span>
          <dl class="rail-stats">
            <div><dt>分集</dt><dd>{{ chapters.length }}</dd></div>
            <div><dt>已生成</dt><dd>{{ generatedCount }}</dd></div>
            <div><dt>待生成</dt><dd>{{ pendingCount }}</dd></div>
            <div><dt>失败</dt><dd>{{ failedCount }}</dd></div>
          </dl>
        </section>
        <section v-if="step > 1" class="rail-block">
          <span class="rail-label">本次设定</span>
          <dl class="rail-facts">
            <div><dt>题材</dt><dd>{{ setup.genre.trim() || '不限' }}</dd></div>
            <div><dt>集数</dt><dd>{{ setup.episodes }} 集</dd></div>
            <div><dt>导演</dt><dd>{{ skillName }}</dd></div>
            <div><dt>模型</dt><dd>{{ setup.model || '默认模型' }}</dd></div>
          </dl>
        </section>
        <p class="rail-note">生成结果与积分消耗以服务端返回为准。重新生成会再次扣减积分；已生成的章节会立即保存，离开页面也不会丢失。</p>
      </aside>
    </div>

    <el-drawer v-model="historyOpen" title="AI 使用记录" direction="rtl" size="min(460px, 94vw)" class="ai-history-drawer" @open="loadHistory" @closed="exitManage">
      <div class="history-body">
        <p class="history-note">这是你在所有页面使用 AI 的最近记录（大纲、正文、润色、分镜），按时间倒序。</p>
        <div v-if="historyRecords.length && !historyError && !manageMode" class="history-tools">
          <span class="cost">共 {{ historyRecords.length }} 条</span>
          <button class="btn quiet sm" type="button" @click="enterManage">记录管理</button>
        </div>
        <div v-if="manageMode" class="history-tools manage">
          <button class="text-button" type="button" :disabled="historyDeleting" @click="toggleSelectAll">{{ allSelected ? '全不选' : '全选' }}</button>
          <span class="cost">已选 {{ selectedRecordIds.size }} 条</span>
          <span class="grow"></span>
          <button class="btn quiet sm" type="button" :disabled="historyDeleting" @click="exitManage">取消</button>
          <button class="btn sm danger" type="button" :disabled="historyDeleting || selectedRecordIds.size === 0" @click="deleteSelected">{{ historyDeleting ? '正在删除…' : `删除所选${selectedRecordIds.size ? ' ' + selectedRecordIds.size : ''}` }}</button>
        </div>
        <LoadState :pending="historyLoading && !historyRecords.length" :error="historyError" :retry="loadHistory" :empty="!historyLoading && !historyError && !historyRecords.length" empty-text="还没有 AI 使用记录" />
        <p v-if="historyLoading && historyRecords.length" class="working history-refreshing"><span class="spinner sm" aria-hidden="true"></span>正在刷新记录</p>
        <ol v-if="!historyError && historyRecords.length" class="history-list">
          <li v-for="record in historyRecords" :key="record.recordId" :class="{ 'picked': selectedRecordIds.has(record.recordId) }">
            <div class="history-entry">
              <label v-if="manageMode" class="history-pick">
                <input type="checkbox" :checked="selectedRecordIds.has(record.recordId)" :disabled="historyDeleting" :aria-label="`选择 ${record.title || '这条记录'}`" @change="toggleRecordSelection(record.recordId)" />
                <span class="history-type">{{ historyLabels[record.type] || 'AI 创作' }}</span>
                <span class="history-title">{{ record.title || '独立创作' }}</span>
                <time>{{ dateText(record.createdAt) }}</time>
                <span class="history-tokens">{{ record.tokens === null || record.tokens === undefined ? '—' : record.tokens + ' token' }}</span>
              </label>
              <button v-else type="button" class="history-row" :aria-expanded="historyExpanded.has(record.recordId)" @click="toggleHistory(record.recordId)">
                <span class="history-type">{{ historyLabels[record.type] || 'AI 创作' }}</span>
                <span class="history-title">{{ record.title || '独立创作' }}</span>
                <time>{{ dateText(record.createdAt) }}</time>
                <span class="history-tokens">{{ record.tokens === null || record.tokens === undefined ? '—' : record.tokens + ' token' }}</span>
              </button>
              <button v-if="!manageMode && record.type === 'outline' && parseAiCreateOutlineInput(record.input)" type="button" class="btn quiet sm history-continue" @click="continueSession(record)">继续这次创作</button>
            </div>
            <div v-if="!manageMode && historyExpanded.has(record.recordId)" class="history-detail">
              <template v-if="record.input"><h4>我的输入</h4><pre>{{ record.input }}</pre></template>
              <template v-if="record.output"><h4>AI 输出</h4><pre>{{ record.output }}</pre></template>
              <p v-if="!record.input && !record.output" class="cost">这条记录没有留存输入输出。</p>
            </div>
          </li>
        </ol>
      </div>
    </el-drawer>
  </section>
</template>
<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { usePortal } from '../../utils/portal.js'
import { dateText, outlineChapters, outlineToText, wordCount } from '../../utils/creator.js'
import { outlineInspiration, outlineSummary, listOutlineChapters, locateOutlineRange, outlineContext, outlineRevisePrompt, previewPassage, stripEchoedHeading, chapterWritePrompt, chapterContinuePrompt, parseAiCreateOutlineInput, buildAiCreateSession } from '../../utils/creatorAi.js'
import { documentText } from '../../utils/document.js'
import LoadState from '../../components/LoadState.vue'
import '../../assets/styles/creation.css'

// 已提交到后端的作品 / 章节：进入确认或生成后锁定，避免重复创建。
const committedWorkId = ref(null)
const committedChapters = computed(() => chapters.value.filter(chapter => chapter.chapterId))
const { api, user, canCreate, handleError, openPanel } = usePortal()
// 换行常量：局部修订时拼正则用，避免手写转义。
const LINE_BREAK = String.fromCharCode(10)
const router = useRouter()

const step = ref(1)
const setup = reactive({ title: '', idea: '', genre: '', episodes: 12, skillId: '', model: '' })
const skills = ref([])
const skillError = ref('')
const modelChannels = ref([])
const modelError = ref('')
const quota = ref(null)
const error = ref('')
const statusText = ref('先填写作品设定，AI 会先生成剧本大纲。')

// 设定与大纲在两栏间往返时沿用同一份数据。
let skillPromise = null
let modelPromise = null
const loadSkills = () => skillPromise ||= (api.value.listAiSkills ? api.value.listAiSkills().then(rows => { skills.value = rows || [] }, failure => { skillError.value = failure.message; return handleError(failure) }) : Promise.resolve())
const loadModels = () => modelPromise ||= (api.value.listAiModels ? api.value.listAiModels().then(rows => { modelChannels.value = rows || [] }, failure => { modelError.value = failure.message; return handleError(failure) }) : Promise.resolve())
const modelOptions = computed(() => (modelChannels.value || []).flatMap(channel => (channel.models || []).map(model => ({ value: model, label: `${channel.channelName} · ${model}${model === channel.defaultModel ? '（默认）' : ''}` }))))
const skillName = computed(() => (skills.value || []).find(skill => String(skill.id) === String(setup.skillId))?.skillName || '默认导演')
const quotaText = computed(() => quota.value === null ? '剩余积分 —' : quota.value > 0 ? `剩余 ${quota.value} 积分` : '剩余 0 积分，可充值或在 App 福利中心获取')
// 充值面板与 AI 创作页是兄弟组件：打开后由充值成功事件触发刷新（与工作台 AI 助手一致）。
function openRecharge() { openPanel?.('recharge') }
function refreshAfterRecharge() { refreshQuota() }
async function refreshQuota() {
  // 余额接口按 userId 查询（与工作台 AiStudio 一致），缺少用户时静默跳过。
  if (!api.value?.getAiQuota || !user.value?.userId) return
  try { quota.value = (await api.value.getAiQuota(user.value.userId)).available }
  catch (failure) { if (failure.message?.includes('积分不足')) quota.value = 0; else await handleError(failure) }
}

watch(step, value => {
  error.value = ''
  statusText.value = value === 1 ? '先填写作品设定，AI 会先生成剧本大纲。'
    : value === 2 ? '核对大纲与分集，确认后逐章生成。'
      : '逐章生成并保存到作品，完成后插入文章。'
})

// ── AI 使用记录 ──
const historyOpen = ref(false)
const historyLoading = ref(false)
const historyError = ref('')
const historyRecords = ref([])
const historyExpanded = ref(new Set())
const historyLabels = { outline: '大纲生成', write: '章节正文', polish: '润色', storyboard: '分镜' }
function openHistory() { historyOpen.value = true }
async function loadHistory({ silent = false } = {}) {
  historyLoading.value = true
  historyError.value = ''
  try { historyRecords.value = (await api.value.listAiRecords()).slice(0, 50) }
  catch (failure) {
    if (!historyRecords.value.length && !silent) historyError.value = failure.message || '记录加载失败'
    if (!silent) await handleError(failure)
  }
  finally { historyLoading.value = false }
}
// 从历史记录恢复一次会话：设定 + 大纲 + 已生成的章节（章节只保留为预览，不重复落库）。
async function continueSession(record) {
  if (revising.value?.busy || running.value || creating.value) return
  const target = buildAiCreateSession(historyRecords.value, record)
  if (!target) return
  const dirty = Boolean(outline.value.trim() || chapters.value.length)
  if (dirty) {
    try {
      await ElMessageBox.confirm('会用在记录里的设定、大纲和已生成章节替换当前页面内容，当前未提交的改动会丢失。', '继续这次创作', { confirmButtonText: '替换并继续', cancelButtonText: '取消' })
    } catch { return }
  }
  Object.assign(setup, { title: target.setup.title, idea: target.setup.idea, genre: target.setup.genre || '', episodes: target.setup.episodes || setup.episodes })
  outline.value = target.outline
  outlineEditing.value = false
  outlineLocked = false
  revisedPassages.value = []
  revising.value = null
  selection.value = null
  workId.value = null
  committedWorkId.value = null
  createError.value = ''
  const parsed = outlineChapters(outline.value)
  const recovered = target.chapters.map((chapter, index) => {
    // 恢复的内容还没落库：chapterId 只作显示占位（保证章节区渲染），真正保存时才写回。
    const placeholderId = Number(chapter.chapterId || 0) || null
    return { key: crypto.randomUUID(), title: chapter.title || `第 ${index + 1} 集`, summary: parsed[index]?.summary || '', selected: true, state: 'generated', content: chapter.content, streaming: '', progress: '', chapterId: placeholderId, remote: false, recovered: true }
  })
  chapters.value = recovered.length ? recovered : parsed.map(item => ({ key: crypto.randomUUID(), title: item.title, summary: item.summary, selected: true, state: 'idle', content: '', streaming: '', progress: '', chapterId: null }))
  step.value = target.outline ? 3 : 2
  historyOpen.value = false
  ElMessage.success(recovered.length ? `已恢复大纲和 ${recovered.length} 章正文` : '已恢复大纲，可以继续逐章生成')
}
// ── 记录管理：多选删除 ──
const manageMode = ref(false)
const selectedRecordIds = ref(new Set())
const historyDeleting = ref(false)
const allSelected = computed(() => historyRecords.value.length > 0 && selectedRecordIds.value.size === historyRecords.value.length)
function enterManage() {
  manageMode.value = true
  selectedRecordIds.value = new Set()
  historyExpanded.value = new Set()
}
function exitManage() {
  manageMode.value = false
  selectedRecordIds.value = new Set()
}
function toggleRecordSelection(id) {
  const next = new Set(selectedRecordIds.value)
  next.has(id) ? next.delete(id) : next.add(id)
  selectedRecordIds.value = next
}
function toggleSelectAll() {
  selectedRecordIds.value = allSelected.value ? new Set() : new Set(historyRecords.value.map(record => record.recordId))
}
async function deleteSelected() {
  const ids = [...selectedRecordIds.value]
  if (!ids.length || historyDeleting.value) return
  try {
    await ElMessageBox.confirm(`删除选中的 ${ids.length} 条 AI 记录？删除后无法恢复，已生成的作品和章节不受影响。`, '删除记录', { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' })
  } catch { return }
  historyDeleting.value = true
  try {
    await api.value.deleteAiRecords(ids)
    const removed = new Set(ids)
    historyRecords.value = historyRecords.value.filter(record => !removed.has(record.recordId))
    selectedRecordIds.value = new Set()
    if (!historyRecords.value.length) manageMode.value = false
    ElMessage.success(`已删除 ${ids.length} 条记录`)
  } catch (failure) { await handleError(failure) }
  finally { historyDeleting.value = false }
}
function toggleHistory(id) {
  const next = new Set(historyExpanded.value)
  next.has(id) ? next.delete(id) : next.add(id)
  historyExpanded.value = next
}
const historyCount = computed(() => historyRecords.value.length)
// 抽屉打开时实时重拉，保证刚生成的记录立刻出现。
function markHistoryChanged() { if (historyOpen.value) loadHistory() }

// ── 大纲 ──
const outline = ref('')
const outlineBusy = ref(false)
const outlineIncomplete = ref(false)
async function generateOutline() {
  outlineBusy.value = true
  outlineIncomplete.value = false
  error.value = ''
  statusText.value = '正在生成大纲…'
  outline.value = ''
  try {
    const body = { inspiration: outlineInspiration({ title: setup.title, idea: setup.idea, episodes: setup.episodes }), genre: setup.genre, style: `共 ${setup.episodes} 集`, skillId: setup.skillId || undefined, model: setup.model || undefined }
    let rest = outline.value
    const response = await api.value.generateStream('outline', body, delta => {
      rest += delta
      outline.value = rest
    })
    let text = rest
    // 与服务端/工作台一致：大纲是 JSON 时转可读文本。
    if (text.trim().startsWith('{') || text.trim().startsWith('[')) {
      try { const parsed = JSON.parse(text); if (parsed && typeof parsed === 'object') text = outlineToText(parsed) } catch { /* 非完整 JSON 保留原文 */ }
    }
    outline.value = text
    outlineIncomplete.value = Boolean(response.truncated)
    markHistoryChanged()
    statusText.value = response.truncated ? '大纲达到长度上限，请减少集数后重新生成。' : '大纲已生成，请核对分集标题。'
  } catch (failure) {
    error.value = failure.message || '大纲生成失败，请重试'
    await handleError(failure)
  } finally {
    outlineBusy.value = false
    await refreshQuota()
  }
}
async function goOutline() {
  if (!setup.title.trim()) return (error.value = '请输入书名')
  if (!setup.idea.trim()) return (error.value = '请先输入故事灵感或主题')
  if (!Number.isInteger(Number(setup.episodes)) || Number(setup.episodes) < 1 || Number(setup.episodes) > 200) return (error.value = '集数需为 1–200 的整数')
  if (!canCreate.value) return
  error.value = ''
  step.value = 2
  if (!outline.value) await generateOutline()
}
// ── 大纲局部修订 ──
const outlineEditing = ref(false)
const paperRef = ref(null)
const previewRef = ref(null)
const selection = ref(null)
const revising = ref(null)
// 已被 AI 改写过的段落按文字匹配，预览里用朱笔底纹标出来。
const revisedPassages = ref([])
const outlineSegments = computed(() => {
  const segments = []
  let rest = outline.value
  const marks = revisedPassages.value
    .map(passage => ({ passage, index: rest.indexOf(passage) }))
    .filter(item => item.index >= 0)
    .sort((a, b) => a.index - b.index)
  for (const mark of marks) {
    const from = rest.indexOf(mark.passage)
    if (from < 0) continue
    if (from > 0) segments.push({ text: rest.slice(0, from) })
    segments.push({ text: mark.passage, mark: true, revising: revising.value?.passage === mark.passage && revising.value?.busy, error: revising.value?.passage === mark.passage && Boolean(revising.value?.error) })
    rest = rest.slice(from + mark.passage.length)
  }
  if (rest) segments.push({ text: rest })
  return segments
})
const bubbleStyle = computed(() => {
  const rect = selection.value?.rect
  if (!rect || !paperRef.value) return { display: 'none' }
  const base = paperRef.value.getBoundingClientRect()
  return { left: Math.max(0, Math.min(rect.left - base.left, base.width - 96)) + 'px', top: Math.max(0, rect.top - base.top - 40) + 'px' }
})
function toggleOutlineMode() {
  selection.value = null
  // 切换模式时收回未提交的修订面板，避免手动编辑与局部修订的定位失配。
  if (revising.value && !revising.value.busy) revising.value = null
  outlineEditing.value = !outlineEditing.value
}
// 只在预览区内的选区才处理，避免把页面其他文字当成大纲段落。
function captureSelection() {
  const root = previewRef.value
  const sel = typeof window !== 'undefined' ? window.getSelection() : null
  if (!root || !sel || !sel.rangeCount || sel.isCollapsed) { selection.value = null; return }
  const range = sel.getRangeAt(0)
  if (!root.contains(range.commonAncestorContainer)) { selection.value = null; return }
  const before = range.cloneRange()
  before.selectNodeContents(root)
  before.setEnd(range.startContainer, range.startOffset)
  const range2 = locateOutlineRange(outline.value, before.toString().length, before.toString().length + range.toString().length)
  if (!range2) { selection.value = null; return }
  const rect = range.getBoundingClientRect()
  selection.value = { ...range2, rect: { left: rect.left, top: rect.top } }
}
function startRevise() {
  if (!selection.value || revising.value?.busy) return
  revising.value = { ...selection.value, instruction: '', output: '', busy: false, error: '' }
  selection.value = null
  nextTick(() => document.querySelector('.revise-panel input')?.focus())
}
function cancelRevise() { revising.value = null }

async function runRevise() {
  const current = revising.value
  if (!current || current.busy || !current.instruction.trim()) return
  if (outlineLocked || outlineBusy.value) return
  current.busy = true
  current.error = ''
  current.output = ''
  try {
    const prompt = outlineRevisePrompt({ passage: current.passage, instruction: current.instruction.trim(), context: outlineContext(outline.value) })
    const result = await api.value.generateStream('write', { prompt, type: 'script', skillId: setup.skillId || undefined, model: setup.model || undefined }, delta => {
      current.output += delta
      // 流式预览：先让这一段在原文位置显示新内容，取消则还原。
      outline.value = outline.value.slice(0, current.start) + current.output + outline.value.slice(current.end)
      current.end = current.start + current.output.length
    })
    let text = (result.content || current.output).trim()
    // 去掉模型偶尔带回的 markdown 代码块或引号包裹。
    const fence = String.fromCharCode(96, 96, 96)
    text = text.replace(new RegExp('^' + fence + '[a-zA-Z]*' + LINE_BREAK + '?'), '').replace(new RegExp(LINE_BREAK + '?' + fence + '$'), '').replace(/^["“]|["”]$/g, '').trim()
    // 模型偶尔会把上一行的分集标题一起回显，先清掉再替换，避免出现重复标题导致分集解析失败。
    text = stripEchoedHeading(outline.value, current.start, text)
    if (!text) throw new Error('AI 没有返回改写内容，请重试')
    outline.value = outline.value.slice(0, current.start) + text + outline.value.slice(current.end)
    revisedPassages.value = [...revisedPassages.value.filter(passage => !passage.includes(text.slice(0, 12))), text]
    markHistoryChanged()
    revising.value = null
    ElMessage.success('这一段已按意见改写，可继续选中其他段落')
  } catch (failure) {
    current.error = failure.message || '这一段改写失败，请重试'
    // 还原为改写前的原文，避免留下半截内容。
    outline.value = outline.value.slice(0, current.start) + current.passage + outline.value.slice(current.end)
    current.end = current.start + current.passage.length
    await handleError(failure)
  } finally {
    current.busy = false
    await refreshQuota()
  }
}

async function regenerateOutline() {
  if (!outline.value) return generateOutline()
  try { await ElMessageBox.confirm('重新生成会再次消耗积分，并覆盖当前大纲。', '重新生成大纲', { confirmButtonText: '重新生成', cancelButtonText: '取消' }) } catch { return }
  return generateOutline()
}

// ── 章节 ──
const workId = ref(null)
const creating = ref(false)
const createError = ref('')
const chapters = ref([])
const running = ref(false)
const stopping = ref(false)
const saving = ref(false)
const inserted = ref(false)
const errors = reactive({})
// 正在生成的章节与实时字数：顶部进度条与行内预览共用。
const runningChapter = ref(null)
const streamingChars = computed(() => runningChapter.value?.streaming?.length || 0)
const progressPercent = computed(() => (chapters.value.length ? Math.round(generatedCount.value / chapters.value.length * 100) : 0))
const stateLabels = { idle: '待生成', generating: '生成中', generated: '已完成', failed: '生成失败' }
const stateTone = { idle: 'off', generating: 'wait', generated: 'ok', failed: 'bad' }
// 流式大纲中已经出现的分集（宽松识别，供进度反馈；正式建章仍用 parsedChapters）。
const streamingEpisodes = computed(() => listOutlineChapters(outline.value))
const parsedChapters = computed(() => outlineChapters(outline.value))
const parsedError = computed(() => step.value === 2 && outline.value.trim() && !outlineBusy.value && !parsedChapters.value.length ? '未识别到分集标题。请按「第1集：章节名称」每行一个标题、下一行写该集概要的格式修改。' : '')
const selectedCount = computed(() => chapters.value.filter(chapter => chapter.selected).length)
const generatedCount = computed(() => chapters.value.filter(chapter => chapter.state === 'generated').length)
const failedCount = computed(() => chapters.value.filter(chapter => chapter.state === 'failed').length)
const pendingCount = computed(() => chapters.value.filter(chapter => chapter.state !== 'generated').length)
const remainingAiCount = computed(() => chapters.value.filter(chapter => chapter.selected && chapter.state !== 'generated').length)
// 从使用记录恢复的章节（尚未落库），插入文章时会补建作品并保存。
const restoredChapters = computed(() => chapters.value.some(chapter => chapter.recovered && !chapter.remote))
const chapterStatusText = computed(() => {
  if (creating.value) return '正在创建作品…'
  if (createError.value) return '作品创建失败，可重试。'
  if (running.value) return `生成中 ${generatedCount.value}/${chapters.value.filter(chapter => chapter.selected).length}`
  return workId.value ? `已生成 ${generatedCount.value}/${chapters.value.length} 章，每章都已保存。` : '确认后创建作品并开始生成。'
})

/** 确保作品已创建；并发调用复用同一个创建请求。返回作品编号，失败返回 null。 */
let creatingRequest = null
async function ensureWork() {
  if (workId.value) return workId.value
  if (creatingRequest) return creatingRequest
  creatingRequest = (async () => {
    creating.value = true
    createError.value = ''
    error.value = ''
    try {
      const title = setup.title.trim()
      let description = outlineSummary(outline.value)
      if (!description) description = `由 AI 创作的《${title}》。`
      if (description.length < 10) description = (description + '，由 AI 创作生成，后续可持续补充。').slice(0, 200)
      // 作品接口 description 落库 sys_work.summary；createWork 读取 form.summary。
      const result = await api.value.createWork({ title, summary: description })
      if (!result?.workId) throw new Error('创建响应缺少作品编号')
      workId.value = Number(result.workId)
      return workId.value
    } catch (failure) {
      createError.value = failure.message || '作品创建失败，请重试'
      await handleError(failure)
      return null
    } finally {
      creating.value = false
    }
  })()
  try { return await creatingRequest } finally { creatingRequest = null }
}
// 进入章节步骤后大纲锁定内容（仍可编辑文本），返回上一步不重建分集。
let outlineLocked = false
async function goChapters() {
  if (outlineBusy.value) return
  const parsed = parsedChapters.value
  if (!parsed.length) return (error.value = '未识别到分集标题，请先按格式修改大纲')
  error.value = ''
  step.value = 3
  if (!chapters.value.length || !outlineLocked) {
    chapters.value = parsed.map(item => ({ key: crypto.randomUUID(), title: item.title, summary: item.summary, selected: true, state: 'idle', content: '', chapterId: null }))
    outlineLocked = true
  }
  await ensureWork()
}
async function unlockOutline() {
  if (revising.value?.busy || running.value || committedWorkId.value || committedChapters.value.length) return
  outlineLocked = false
  revisedPassages.value = []
  await nextTick()
}

// 每收到一段就把预览推进一次（最多每 400ms），让生成过程可见而不是等到整章结束。
function liveDelta(chapter) {
  let last = 0
  let silent = false
  return delta => {
    chapter.words = (chapter.words || 0) + delta.length
    const now = Date.now()
    if (now - last < 400) {
      if (silent) return
      silent = true
      setTimeout(() => { silent = false }, 400)
    }
    last = now
    chapter.streaming = (chapter.streaming || '') + delta
  }
}
async function callWrite(chapter, prompt) {
  return api.value.generateStream('write', { prompt, workId: workId.value || undefined, type: 'script' }, liveDelta(chapter))
}
// 按大纲生成单章，达到长度上限时询问续写（与创作工作台一致）。
async function generateChapterContent(chapter) {
  let output = await callWrite(chapter, chapterWritePrompt({ title: chapter.title, summary: chapter.summary, outline: outline.value }))
  let generated = output.content
  while (output.truncated) {
    try {
      await ElMessageBox.confirm(`「${chapter.title}」达到单次生成长度上限。续写会额外消耗积分，是否继续？`, '章节需要续写', { confirmButtonText: '续写本章', cancelButtonText: '暂时停止' })
    } catch {
      return generated
    }
    output = await callWrite(chapter, chapterContinuePrompt({ title: chapter.title, summary: chapter.summary, outline: outline.value, basedOnText: generated.slice(-8000) }))
    generated += output.content
  }
  return generated
}
async function saveChapterContent(chapter, content) {
  // 只有已落库的章节才带 chapterId 走更新；从历史记录恢复的章节是占位编号，按新建保存。
  const existingId = chapter.remote ? chapter.chapterId : undefined
  const saved = await api.value.saveChapter(workId.value, { chapterId: existingId, chapterTitle: chapter.title, content, isFree: '0' })
  const chapterId = Number(saved?.chapterId || saved?.id)
  if (!existingId) {
    if (!chapterId) throw new Error('分集保存响应缺少编号，请到作品详情确认保存状态')
    chapter.chapterId = chapterId
  }
  chapter.remote = true
}
async function runChapter(chapter) {
  chapter.state = 'generating'
  chapter.progress = ''
  chapter.streaming = ''
  chapter.words = 0
  runningChapter.value = chapter
  errors[chapter.key] = ''
  try {
    const content = await generateChapterContent(chapter)
    chapter.content = content
    await saveChapterContent(chapter, content)
    chapter.remote = true
    chapter.state = 'generated'
    markHistoryChanged()
  } catch (failure) {
    chapter.state = 'failed'
    errors[chapter.key] = failure.message || '生成失败，请重试'
    await handleError(failure)
  } finally {
    chapter.progress = ''
    chapter.streaming = ''
    chapter.words = 0
    if (runningChapter.value === chapter) runningChapter.value = null
  }
}
async function startGeneration() {
  if (running.value || !selectedCount.value || !(await ensureWork())) return
  running.value = true
  stopping.value = false
  error.value = ''
  try {
    for (const chapter of chapters.value) {
      if (stopping.value) break
      if (!chapter.selected || chapter.state === 'generated') continue
      await runChapter(chapter)
      if (stopping.value) break
    }
    if (generatedCount.value) ElMessage.success(`已生成 ${generatedCount.value} 章并保存到作品`)
  } finally {
    running.value = false
    stopping.value = false
    await refreshQuota()
  }
}
function stopGeneration() {
  stopping.value = true
  if (runningChapter.value) runningChapter.value.progress = '当前章写完后停止'
}
async function generateOne(chapter) {
  if (running.value || !(await ensureWork())) return
  running.value = true
  try { await runChapter(chapter) } finally { running.value = false; await refreshQuota() }
}
async function removeChapter(chapter) {
  if (running.value) return
  try { await ElMessageBox.confirm(`删除「${chapter.title}」？已保存的正文会一并删除。`, '删除章节', { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' }) } catch { return }
  try {
    if (chapter.chapterId) await api.value.deleteChapter(workId.value, chapter.chapterId)
    chapters.value = chapters.value.filter(item => item !== chapter)
    ElMessage.success('已删除本章')
  } catch (failure) { await handleError(failure) }
}
function toggleAll(value) { for (const chapter of chapters.value) chapter.selected = value }

async function insertToWork() {
  if (running.value || saving.value || !generatedCount.value) return
  // 从历史记录恢复的会话还没有作品：先建一部草稿再补存章节。
  if (!workId.value && !(await ensureWork())) return
  if (workId.value) committedWorkId.value = workId.value
  if (running.value || saving.value || !workId.value || !generatedCount.value) return
  saving.value = true
  try {
    // 有正文但尚未落库的章节补存一次，保证编辑器能看到全部内容。
    for (const chapter of chapters.value) {
      if (chapter.state === 'generated' && chapter.content && !chapter.remote) await saveChapterContent(chapter, chapter.content)
    }
    const first = chapters.value.find(chapter => chapter.state === 'generated' && chapter.remote)
    inserted.value = true
    await router.push({ path: '/works/create', query: { workId: String(workId.value), ...(first ? { chapterId: String(first.chapterId) } : {}) } })
  } catch (failure) { await handleError(failure) }
  finally { saving.value = false }
}

// 生成中离开要确认：作品和已生成章节会保留。
async function allowNavigation() {
  if (inserted.value || (!running.value && !creating.value)) return true
  try {
    await ElMessageBox.confirm('正在生成章节，离开会停止生成；已生成的章节会保存在作品中。', '正在生成', { confirmButtonText: '离开', cancelButtonText: '继续等待' })
    return true
  } catch { return false }
}
onBeforeRouteLeave(to => allowNavigation())
function protectUnload(event) { if (running.value || creating.value) { event.preventDefault(); event.returnValue = '' } }
async function leavePage() { if (await allowNavigation()) router.push('/works') }
onMounted(() => {
  refreshQuota()
  loadHistory({ silent: true })
  window.addEventListener('recharge-success', refreshAfterRecharge)
  loadSkills()
  loadModels()
  window.addEventListener('beforeunload', protectUnload)
})
onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', protectUnload)
  window.removeEventListener('recharge-success', refreshAfterRecharge)
})
</script>
<style scoped>
.ai-studio { display: flex; flex-direction: column; height: calc(100dvh - 56px); background: var(--paper-3); caret-color: var(--cinnabar); }
.ai-studio ::selection { background: rgba(176, 58, 46, .16); }

/* 顶栏 */
.studio-head { display: flex; align-items: center; gap: 24px; flex-wrap: wrap; padding: 16px 28px 15px; background: var(--paper); border-bottom: 1px solid var(--rule-2); flex: none; }
.studio-back { display: inline-flex; align-items: center; gap: 6px; border: 0; border-right: 1px solid var(--rule); background: none; padding: 4px 18px 4px 0; font-size: 13px; color: var(--ink-2); }
.studio-back:hover { color: var(--indigo); }
.studio-heading { min-width: 0; flex: 1 1 260px; }
.studio-heading h1 { font-family: var(--serif); font-size: 22px; letter-spacing: .05em; }
.studio-heading p { margin: 4px 0 0; font-size: 12.5px; color: var(--ink-3); overflow-wrap: anywhere; }
.studio-heading p.bad { color: var(--cinnabar); }
.studio-history { position: relative; border: 0; border-bottom: 1px solid var(--rule-2); background: none; padding: 3px 0; font-size: 12.5px; color: var(--ink-2); white-space: nowrap; }
.studio-history:hover { color: var(--indigo); border-bottom-color: var(--indigo); }
.history-count { display: inline-block; min-width: 16px; margin-left: 6px; padding: 0 5px; border-radius: 8px; background: var(--indigo-wash); color: var(--indigo); font-size: 10.5px; line-height: 16px; text-align: center; font-variant-numeric: tabular-nums; }
.steps { display: flex; align-items: center; margin: 0; padding: 0; list-style: none; font-size: 13px; white-space: nowrap; }
.steps li { display: flex; align-items: center; gap: 7px; }
.steps li + li::before { content: ""; width: 28px; height: 1px; background: var(--rule-2); margin: 0 14px; }
.step-no { font-family: var(--serif); font-size: 13px; color: var(--ink-3); }
.step-name { padding-bottom: 3px; border-bottom: 2px solid transparent; color: var(--ink-2); }
.steps li[data-done='true'] .step-no { color: var(--indigo-dim); }
.steps li[aria-current='step'] .step-no { color: var(--cinnabar); }
.steps li[aria-current='step'] .step-name { color: var(--ink); border-bottom-color: var(--cinnabar); font-weight: 600; }

/* 工作区 */
.studio-body { display: grid; grid-template-columns: minmax(0, 1fr) clamp(240px, 21vw, 300px); flex: 1; min-height: 0; overflow: hidden; }
.studio-desk { min-width: 0; min-height: 0; padding: 30px 32px 60px; overflow-y: auto; scrollbar-width: thin; scrollbar-color: var(--rule-2) transparent; }
.sheet { width: 100%; max-width: 1180px; margin: 0 auto; padding: clamp(26px, 3vw, 42px) clamp(26px, 4vw, 56px) clamp(22px, 2.6vw, 34px); background: #FCFBF8; border: 1px solid var(--rule-2); border-radius: 2px; box-shadow: 0 18px 44px rgba(27, 26, 24, .07); animation: sheet-rise .34s cubic-bezier(.16, 1, .3, 1) both; }
@keyframes sheet-rise { from { opacity: 0; transform: translateY(10px); filter: blur(2px); } to { opacity: 1; transform: none; filter: none; } }
.sheet-head { display: flex; align-items: baseline; justify-content: space-between; gap: 18px; flex-wrap: wrap; padding-bottom: 14px; border-bottom: 1px solid var(--rule); }
.sheet-head h2 { font-family: var(--serif); font-size: 23px; letter-spacing: .05em; }
.sheet-status { margin: 0; font-size: 12.5px; color: var(--ink-2); max-width: 56ch; text-align: right; }

/* 生成中：旋转标记与实时状态 */
.spinner { flex: none; width: 12px; height: 12px; border-radius: 50%; border: 1.5px solid var(--rule-2); border-top-color: var(--cinnabar); animation: spin .75s linear infinite; }
.spinner.sm { width: 10px; height: 10px; }
@keyframes spin { to { transform: rotate(360deg); } }
.working { display: inline-flex; align-items: center; gap: 7px; color: var(--ink-2); }
.sheet-status .working { color: var(--indigo); }
.strip-status { margin: 12px 0 0; font-size: 12.5px; }
.strip-status .grow { flex: 1; }
.strip-status .cost { margin: 0; font-variant-numeric: tabular-nums; }

/* 大纲：已写出的分集实时列出 */
.episode-strip { display: flex; gap: 14px; align-items: flex-start; padding: 14px 0 6px; border-top: 1px dashed var(--rule); }
.strip-label { flex: none; padding-top: 3px; font-size: 12px; color: var(--ink-3); letter-spacing: .04em; }
.episode-strip ol { display: flex; flex-wrap: wrap; gap: 6px 8px; margin: 0; padding: 0; list-style: none; }
.episode-strip li { display: inline-flex; align-items: center; gap: 6px; max-width: 100%; padding: 3px 10px; border: 1px solid var(--rule-2); background: var(--paper); font-size: 12.5px; color: var(--ink-2); overflow-wrap: anywhere; animation: chip-in .3s cubic-bezier(.16, 1, .3, 1) both; }
.episode-strip li i { width: 5px; height: 5px; background: var(--bamboo); border-radius: 50%; flex: none; }
.episode-strip li:last-child:not(:only-child) i { background: var(--ochre); animation: pulse 1.2s ease-in-out infinite; }
.episode-strip li em { font-style: normal; color: var(--ochre); letter-spacing: .1em; }
@keyframes chip-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .25; } }

/* 章节：进度条与行内实时正文 */
.chapter-recovered { margin-top: 6px !important; color: var(--indigo) !important; font-size: 11.5px !important; }
.progress-bar { height: 3px; margin-top: 18px; background: var(--paper-3); overflow: hidden; box-shadow: inset 0 0 0 1px var(--rule); }
.progress-value { display: block; height: 100%; background: var(--indigo-dim); transition: width .5s cubic-bezier(.16, 1, .3, 1); }
.chapter-live { margin-top: 12px; }
.chapter-live .working { font-size: 12px; }
.chapter-prose.live { max-height: 170px; background: #fff; color: var(--ink-2); }

/* 设定：卷宗登记表 */
.register { display: flex; flex-direction: column; }
.reg-row { display: grid; grid-template-columns: 116px minmax(0, 1fr); gap: 20px; padding: 16px 0; border-bottom: 1px solid var(--rule); align-items: start; }
.reg-row:last-of-type { border-bottom: 0; }
.reg-key { font-size: 12.5px; color: var(--ink-3); letter-spacing: .05em; padding-top: 9px; }
.reg-key em { font-style: normal; color: var(--cinnabar); margin-left: 3px; }
.reg-row input, .reg-row select, .reg-row textarea { width: 100%; padding: 7px 0; border: 0; border-bottom: 1px solid transparent; background: none; font: inherit; font-size: 14px; color: var(--ink); transition: border-color .15s, box-shadow .15s; }
.reg-row input:focus, .reg-row select:focus, .reg-row textarea:focus { outline: none; border-bottom-color: var(--indigo); box-shadow: 0 1px 0 0 var(--indigo); }
.reg-row input::placeholder, .reg-row textarea::placeholder { color: var(--ink-2); opacity: 1; }
.reg-row select { cursor: pointer; }
.reg-title { font-family: var(--serif); font-size: 26px !important; letter-spacing: .03em; line-height: 1.4; }
.reg-idea { font-family: var(--serif); font-size: 15px !important; line-height: 1.95; resize: vertical; min-height: 96px; }
.reg-inline { display: flex; align-items: baseline; gap: 8px; }
.reg-row input.reg-count { width: 96px; font-variant-numeric: tabular-nums; }
.reg-hint { font-size: 12px; color: var(--ink-3); }

/* 纸页底部 */
.sheet-foot { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; padding-top: 20px; margin-top: 18px; border-top: 1px solid var(--rule); }
.sheet-foot .cost { margin: 0; max-width: 60ch; }
.sheet-foot > .btn:last-child { margin-left: auto; }
.sheet-foot.sticky { position: sticky; bottom: 0; z-index: 2; margin-top: 0; padding: 16px 0 10px; background: #FCFBF8; box-shadow: 0 -14px 22px -18px rgba(27, 26, 24, .35); }

/* 大纲 */
.outline-paper { position: relative; padding: 0; }
.outline-paper.editing { padding: 18px 0 4px; }
.outline-paper textarea { width: 100%; min-height: 400px; padding: 0; border: 0; background: none; resize: vertical; font-family: var(--serif); font-size: 15px; line-height: 2; color: var(--ink); scrollbar-width: thin; scrollbar-color: var(--rule-2) transparent; }
.outline-paper textarea:focus { outline: none; }
.outline-paper textarea:disabled { color: var(--ink-2); }
.outline-paper textarea::placeholder { color: var(--ink-2); opacity: 1; }
/* 大纲预览与局部修订 */
.outline-mode { flex: none; padding: 2px 0; border: 0; border-bottom: 1px solid var(--rule-2); background: none; font-size: 12px; color: var(--ink-2); }
.outline-mode:hover { color: var(--indigo); border-bottom-color: var(--indigo); }
.outline-preview { min-height: 400px; padding: 18px 0 6px; font-family: var(--serif); font-size: 15px; line-height: 2; color: var(--ink); white-space: pre-wrap; overflow-wrap: anywhere; }
.outline-empty { margin: 0; color: var(--ink-2); }
.outline-passage { padding: 1px 2px; margin: 0 -1px; background: rgba(176, 58, 46, .09); color: var(--ink); border-bottom: 1px solid rgba(176, 58, 46, .55); border-radius: 1px; transition: background .2s ease; }
.outline-passage[data-revising] { background: rgba(168, 119, 41, .18); animation: pulse 1.4s ease-in-out infinite; }
.outline-passage[data-error] { background: var(--cinnabar-w); border-bottom-color: var(--cinnabar); }
.select-bubble { position: absolute; z-index: 3; padding: 5px 12px; border: 1px solid var(--indigo); background: var(--indigo); color: #fff; font-size: 12px; border-radius: 2px; box-shadow: 0 6px 16px rgba(27, 26, 24, .18); animation: chip-in .16s ease-out both; }
.select-bubble::after { content: ""; position: absolute; left: 12px; bottom: -5px; width: 8px; height: 8px; background: var(--indigo); transform: rotate(45deg); }
.revise-panel { display: flex; flex-direction: column; gap: 10px; margin: 6px 0 2px; padding: 16px 18px; border: 1px solid var(--rule-2); background: var(--paper); }
.revise-passage { display: grid; grid-template-columns: 132px minmax(0, 1fr); gap: 14px; align-items: start; }
.revise-label { font-size: 11.5px; color: var(--ink-3); letter-spacing: .04em; padding-top: 2px; }
.revise-passage p { margin: 0; padding-left: 12px; border-left: 2px solid var(--cinnabar); font-family: var(--serif); font-size: 13px; line-height: 1.85; color: var(--ink-2); white-space: pre-wrap; overflow-wrap: anywhere; }
.revise-status { font-size: 12px; color: var(--ink-2); }
.revise-input { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.revise-input input { flex: 1 1 260px; min-width: 0; padding: 8px 11px; border: 1px solid var(--rule-2); background: #fff; font: inherit; font-size: 13px; color: var(--ink); border-radius: 2px; }
.revise-input input:focus { outline: none; border-color: var(--indigo); box-shadow: 0 0 0 3px var(--indigo-wash); }
.parse-line { display: flex; align-items: center; gap: 14px; min-height: 54px; padding: 14px 0 2px; border-top: 1px solid var(--rule); }
.parse-line p { margin: 0; font-size: 13px; color: var(--ink-2); }
.parse-line b { font-family: var(--serif); color: var(--ink); }
.parse-line .stamp { width: 42px; height: 42px; font-size: 11px; }
.parse-line .note { margin: 0; flex: 1; }

/* 章节卷宗 */
.roll-tools { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin: 20px 0 2px; }
.roll-tools .cost { margin: 0; }
.chapter-list { list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--rule); }
.chapter { position: relative; display: grid; grid-template-columns: 52px minmax(0, 1fr); gap: 0 18px; padding: 22px 0; border-bottom: 1px solid var(--rule); }
.chapter-pick { display: flex; align-items: flex-start; gap: 10px; padding-top: 1px; cursor: pointer; }
.chapter-pick input { margin-top: 4px; accent-color: var(--indigo); }
.chapter-no { font-family: var(--serif); font-size: 18px; line-height: 1.2; color: var(--ink-3); font-variant-numeric: tabular-nums; }
.chapter-copy { min-width: 0; }
.chapter-line { display: flex; align-items: baseline; justify-content: space-between; gap: 14px; }
.chapter-copy h3 { font-family: var(--serif); font-size: 15.5px; letter-spacing: .02em; line-height: 1.45; overflow-wrap: anywhere; }
.chapter-copy > p { margin: 7px 0 0; font-size: 12.5px; line-height: 1.8; color: var(--ink-2); overflow-wrap: anywhere; }
.chapter-tag { flex: none; animation: seal-press .26s ease-out both; }
.chapter[data-state='generated'] .chapter-no { color: var(--bamboo); }
.chapter[data-state='failed'] .chapter-no { color: var(--cinnabar); }
.chapter[data-state='generating']::after { content: ""; position: absolute; left: 0; right: 0; bottom: -1px; height: 2px; background: linear-gradient(90deg, transparent, var(--ochre), transparent) no-repeat; background-size: 42% 100%; animation: ink-crawl 1.3s ease-in-out infinite; }
@keyframes ink-crawl { from { background-position: -45% 0; } to { background-position: 145% 0; } }
@keyframes seal-press { from { opacity: 0; transform: scale(1.2); } to { opacity: 1; transform: none; } }
.chapter-error { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: 12px; }
.chapter-error .note { margin: 0; }
.chapter-preview { margin-top: 12px; }
.chapter-preview summary { cursor: pointer; font-size: 12px; color: var(--indigo); }
.chapter-preview .row { margin-top: 10px; }
.chapter-prose { margin-top: 10px; max-height: 280px; overflow: auto; padding: 16px 18px; background: var(--paper); border: 1px solid var(--rule); font-family: var(--serif); font-size: 13.5px; line-height: 1.95; color: var(--ink); white-space: pre-wrap; scrollbar-width: thin; scrollbar-color: var(--rule-2) transparent; }

/* 右栏 */
.studio-rail { display: flex; flex-direction: column; gap: 24px; padding: 26px 22px 34px; background: var(--indigo); color: #EAF0EF; overflow-y: auto; scrollbar-width: thin; scrollbar-color: rgba(234, 240, 239, .28) transparent; }
.rail-block { padding-bottom: 22px; border-bottom: 1px solid rgba(234, 240, 239, .16); }
.rail-block:last-of-type { border-bottom: 0; padding-bottom: 0; }
.rail-label { display: block; font-size: 11.5px; letter-spacing: .16em; color: rgba(234, 240, 239, .7); }
.rail-work { margin: 8px 0 0; font-family: var(--serif); font-size: 19px; line-height: 1.45; letter-spacing: .03em; color: #fff; overflow-wrap: anywhere; }
.rail-meta { margin: 6px 0 0; font-size: 12px; color: rgba(234, 240, 239, .72); }
.rail-quota { margin: 6px 0 0; font-family: var(--serif); font-size: 42px; line-height: 1; color: #fff; font-variant-numeric: tabular-nums; }
.rail-refresh { margin-top: 10px; padding: 3px 0; border: 0; border-bottom: 1px solid rgba(234, 240, 239, .5); background: none; color: #EAF0EF; font-size: 12px; }
.rail-refresh:hover { border-bottom-color: #EAF0EF; }
.rail-actions { display: flex; gap: 16px; }
.rail-recharge { color: #D4A359; border-bottom-color: rgba(212, 163, 89, .6); }
.rail-recharge:hover { border-bottom-color: #D4A359; }
.rail-stats, .rail-facts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 14px; margin: 10px 0 0; }
.rail-stats dt, .rail-facts dt { font-size: 11.5px; color: rgba(234, 240, 239, .7); }
.rail-stats dd, .rail-facts dd { margin: 3px 0 0; font-family: var(--serif); font-size: 16px; color: #fff; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.rail-note { margin: 0; font-size: 12px; line-height: 1.8; color: rgba(234, 240, 239, .72); }

@media (max-width: 1180px) {
  .studio-body { grid-template-columns: minmax(0, 1fr); overflow: visible; }
  .ai-studio { height: auto; min-height: calc(100dvh - 56px); }
  .studio-rail { border-top: 1px solid var(--rule-2); }
  .rail-stats, .rail-facts { grid-template-columns: repeat(4, minmax(0, 1fr)); }
}
@media (max-width: 720px) {
  .chapter-line { flex-wrap: wrap; gap: 6px 12px; }
  .studio-history { order: 3; }
  .revise-passage { grid-template-columns: minmax(0, 1fr); gap: 6px; }
  .revise-input input { flex-basis: 100%; }
  .studio-head { padding: 12px 14px; gap: 10px 14px; }
  .studio-heading h1 { font-size: 19px; }
  .steps { font-size: 12px; }
  .steps li + li::before { width: 18px; margin: 0 10px; }
  .studio-desk { padding: 16px 12px 40px; overflow: visible; }
  .sheet { padding: 20px 18px; }
  .sheet-status { text-align: left; }
  .reg-row { grid-template-columns: minmax(0, 1fr); gap: 6px; }
  .reg-key { padding-top: 0; }
  .chapter { grid-template-columns: 40px minmax(0, 1fr); gap: 0 12px; }
  .rail-stats, .rail-facts { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
/* AI 使用记录抽屉（teleport 到 body，必须用 :global 命中） */
:global(.ai-history-drawer .el-drawer__body) { padding: 0; }
:global(.history-body) { padding: 6px 20px 28px; }
:global(.history-note) { margin: 10px 0 14px; font-size: 12px; line-height: 1.75; color: var(--ink-2); }
:global(.history-refreshing) { margin: 0 0 10px; font-size: 12px; color: var(--ink-3); }
:global(.history-list) { margin: 0; padding: 0; list-style: none; border-top: 1px solid var(--rule); }
:global(.history-list > li) { border-bottom: 1px solid var(--rule); }
:global(.history-row) { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 3px 10px; width: 100%; padding: 13px 2px; border: 0; background: none; text-align: left; }
:global(.history-row:hover) { background: var(--paper-3); }
:global(.history-type) { padding: 1px 7px; border: 1px solid var(--indigo-dim); color: var(--indigo); font-size: 11px; white-space: nowrap; }
:global(.history-title) { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: var(--serif); font-size: 14px; color: var(--ink); }
:global(.history-row time) { grid-column: 2; font-size: 11.5px; color: var(--ink-3); font-variant-numeric: tabular-nums; }
:global(.history-tokens) { grid-column: 3; grid-row: 1 / 3; align-self: center; font-size: 11.5px; color: var(--ink-3); font-variant-numeric: tabular-nums; white-space: nowrap; }
:global(.history-tools) { display: flex; align-items: center; gap: 12px; margin: 0 0 12px; }
:global(.history-tools .grow) { flex: 1; }
:global(.history-tools.manage) { padding: 8px 10px; background: var(--indigo-wash); border: 1px solid var(--indigo-dim); }
:global(.history-pick) { display: grid; grid-template-columns: 18px auto minmax(0, 1fr) auto; gap: 3px 10px; padding: 13px 6px 13px 2px; align-items: center; cursor: pointer; }
:global(.history-pick input) { grid-row: span 2; accent-color: var(--indigo); }
:global(.history-pick .history-type) { grid-column: 2; }
:global(.history-pick .history-title) { grid-column: 3; }
:global(.history-pick time) { grid-column: 3; }
:global(.history-pick .history-tokens) { grid-column: 4; grid-row: 1 / 3; }
:global(.history-list > li.picked) { background: var(--indigo-wash); }
:global(.btn.danger) { background: var(--cinnabar); border-color: var(--cinnabar); color: #fff; }
:global(.btn.danger:hover) { opacity: .88; }
:global(.history-entry) { position: relative; }
:global(.history-continue) { position: absolute; right: 2px; bottom: 8px; }
:global(.history-detail) { padding: 2px 2px 16px; }
:global(.history-detail h4) { margin: 10px 0 6px; font-size: 11.5px; font-weight: 600; color: var(--ink-2); letter-spacing: .04em; }
:global(.history-detail pre) { margin: 0; max-height: 220px; overflow: auto; padding: 12px 14px; background: var(--paper); border: 1px solid var(--rule); font-family: var(--sans); font-size: 12.5px; line-height: 1.8; white-space: pre-wrap; word-break: break-word; color: var(--ink-2); scrollbar-width: thin; }

@media (prefers-reduced-motion: reduce) {
  .sheet, .chapter-tag, .episode-strip li { animation: none; }
  .spinner, .episode-strip li i { animation: none; }
  .chapter[data-state='generating']::after { animation: none; }
}
</style>
