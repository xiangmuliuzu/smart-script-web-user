<template>
  <div class="detail-top"><button class="back" @click="goWorks">← 返回我的作品</button><div v-if="work" class="row"><button class="btn quiet" :disabled="!canCreate" @click="deleteVisible = true">删除作品</button><button class="btn settings-btn" :disabled="!editable" @click="settingsVisible = true"><el-icon><Setting /></el-icon>作品设置</button></div></div>
  <LoadState :pending="pending" :error="error" :retry="load" />
  <div v-if="!pending && !error && work" class="work-detail-grid">
    <section class="work-detail-main">
      <div class="workhead"><div class="wh-cover"><img v-if="work.cover" :src="work.cover" alt="作品封面" /><span v-else class="glyph">{{ work.title?.slice(0, 1) }}</span></div><div class="wh-body"><div class="row"><h1 class="detail-title">{{ work.title }}</h1><span class="stamp sm" :data-s="stateOf(work.status).stamp">{{ stateOf(work.status).label }}</span></div><p class="work-info">短剧 · {{ work.genreName || '未分类' }} ｜ {{ work.episodeCount ?? chapters.length }} 章 ｜ {{ words(work.wordCount) }} ｜ 最近更新 {{ dateText(work.updateTime).slice(5) }}</p><p class="wh-intro">{{ work.summary || '暂无简介' }}</p></div></div>
      <div class="row section-actions"><button class="btn" :disabled="!editable" @click="editChapter(null)">＋ 写新章节</button><span class="cost">{{ work.status === 'reviewing' ? '审核中暂不可编辑，可查看审核进度' : '作品 = 章节集合，先写章节再发布' }}</span></div>
      <div class="tbl"><table><thead><tr><th class="seq-col">序</th><th>章节标题</th><th class="num">字数</th><th>状态</th><th>操作</th></tr></thead><tbody><tr v-for="chapter in chapters" :key="chapter.chapterId"><td class="num">{{ String(chapter.chapterNo).padStart(2, '0') }}</td><td>{{ chapter.chapterTitle }}</td><td class="num">{{ Number(chapter.wordCount || 0).toLocaleString() }}</td><td><span class="tag" :class="chapterState(chapter.status).tone">{{ chapterState(chapter.status).label }}</span></td><td class="ops"><button class="btn sm" :class="{ quiet: chapter.status !== 'revision' }" :disabled="!editable || deleting !== null" @click="editChapter(chapter)">{{ chapter.status === 'revision' ? '修改' : '编辑' }}</button><button class="btn quiet sm" :disabled="!editable || deleting !== null" @click="remove(chapter)">{{ deleting === chapter.chapterId ? '删除中…' : '删除' }}</button></td></tr></tbody></table></div>
      <LoadState :empty="!chapters.length" empty-text="还没有章节，写下故事的第一幕。" />
    </section>
    <aside class="work-detail-side">
      <div v-if="latestReview?.reviewOpinion && ['revision', 'rejected'].includes(work.status)" class="note bad">{{ latestReview.reviewOpinion }}</div>
      <div v-if="!canCreate" class="note info">创作者能力尚未开通，当前仅可查看作品。</div>
      <div class="sub"><div class="sub-head"><h3>当前状态</h3></div><div class="panel attached"><dl class="summary"><div><dt>作品状态</dt><dd :class="stateOf(work.status).tone">{{ stateOf(work.status).label }}</dd></div><div><dt>可用章节</dt><dd>{{ chapters.filter(c => c.status === 'approved' || c.status === 'published' || c.status === '0').length }} <small>/ {{ work.episodeCount ?? chapters.length }}</small></dd></div><div><dt>章节总数</dt><dd>{{ chapters.length }}</dd></div></dl><div class="row section-actions"><button class="btn" :disabled="!editable || !chapters.length || submitting" @click="submit">{{ submitting ? '提交中…' : '提交审核' }}</button><button class="btn quiet" @click="showVersions">查看版本历史</button></div><p class="cost">已发布的作品改动后需要重新提交审核。</p></div></div>
      <div class="sub"><div class="sub-head"><h3>审核记录</h3></div><div class="panel attached"><LoadState :error="reviewError" :retry="loadReviews" :empty="!reviewError && !reviews.length" empty-text="暂无审核记录" /><ul v-if="!reviewError" class="timeline"><li v-for="review in reviews" :key="review.reviewId" :data-tone="review.status === 'approved' ? 'passed' : ['revision', 'rejected'].includes(review.status) ? 'revise' : ''"><time>{{ dateText(review.reviewEndTime || review.createdAt || review.createTime) }}</time><b>内容审核 · {{ reviewLabels[review.status] || '状态待确认' }}</b><p v-if="review.reviewOpinion">{{ review.reviewOpinion }}<span v-if="review.reviewerName"> —— 审核员 {{ review.reviewerName }}</span></p></li></ul></div></div>
    </aside>
  </div>
  <ChapterEditor v-if="chapterVisible" ref="chapterEditor" v-model="chapterVisible" :work-id="work.workId" :chapter="selectedChapter" :chapter-no="selectedChapter?.chapterNo || chapters.length + 1" :opinion="selectedChapter?.status === 'revision' ? latestReview?.reviewOpinion : ''" @update:content="editingContent = $event" @saved="load" />
  <WorkSettings v-if="settingsVisible" v-model="settingsVisible" :work="work" @saved="load" />
  <WorkDelete v-if="deleteVisible" v-model="deleteVisible" :work="work" @deleted="goWorks" />
  <PortalLayer v-model="versionsVisible" title="版本历史" modal><LoadState :pending="versionLoading" :error="versionError" :retry="showVersions" :empty="!versionLoading && !versionError && !versions.length" /><ul class="timeline"><li v-for="version in versions" :key="version.versionId"><time>{{ dateText(version.createTime) }}</time><b>{{ version.version || version.versionNo || '作品版本' }}</b><p>{{ version.versionDesc || version.description || '暂无版本说明' }}</p></li></ul></PortalLayer>
  <button v-if="work" class="ai-fab" type="button" title="AI 创作助手" @click="aiVisible = true"><span>✦</span></button>
  <PortalLayer v-model="aiVisible" title="AI 创作助手" size="min(620px, 50vw)"><div class="ai-fab-panel"><AiStudio embedded :work-id="work.workId" :current-content="editingContent" :insert-disabled="!editable" @insert="insertAi" /></div></PortalLayer>
</template>
<script setup>
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Setting } from '@element-plus/icons-vue'
import { usePortal } from '../../utils/portal.js'
import { canEdit, stateOf, words, dateText } from '../../utils/creator.js'
import LoadState from '../../components/LoadState.vue'
import ChapterEditor from '../../components/ChapterEditor.vue'
import PortalLayer from '../../components/PortalLayer.vue'
import WorkSettings from './Settings.vue'
import AiStudio from './AiStudio.vue'
import WorkDelete from './Delete.vue'
const { api, user, canCreate, goWorks, handleError } = usePortal()
const route = useRoute()
const work = ref(null)
const chapters = ref([])
const reviews = ref([])
const latestReview = ref(null)
const pending = ref(true)
const error = ref('')
const reviewError = ref('')
const submitting = ref(false)
const deleting = ref(null)
const selectedChapter = ref(null)
const chapterVisible = ref(false)
const chapterEditor = ref(null)
const editingContent = ref('')
const aiVisible = ref(false)
const settingsVisible = ref(false)
const deleteVisible = ref(false)
const versionsVisible = ref(false)
const versionLoading = ref(false)
const versionError = ref('')
const versions = ref([])
const editable = computed(() => canEdit(user.value, work.value))
const reviewLabels = { approved: '通过', pending: '等待审核', ai_reviewing: 'AI 审核中', reviewing: '审核中', revision: '需修改', rejected: '驳回' }
// 章节 0/1 是正常/停用标记，不等于审核通过。
const chapterState = status => status === '0' ? { label: '已保存', tone: 'off' } : status === '1' ? { label: '已停用', tone: 'bad' } : status === 'approved' ? { label: '已通过', tone: 'ok' } : stateOf(status)
async function loadReviews() {
  reviewError.value = ''
  try { reviews.value = await api.value.listReviews(route.params.id) }
  catch (failure) { reviewError.value = failure.message; await handleError(failure) }
}
async function load() {
  pending.value = true; error.value = ''
  try { const detail = await api.value.getWork(route.params.id); work.value = detail.work; chapters.value = detail.chapters || []; latestReview.value = detail.latestReview; await loadReviews() }
  catch (failure) { error.value = failure.message || '作品加载失败'; await handleError(failure) }
  finally { pending.value = false }
}
function editChapter(chapter) { if (!editable.value) return; selectedChapter.value = chapter; editingContent.value = chapter?.content || ''; chapterVisible.value = true }
async function insertAi(content) {
  if (!content) return
  if (chapterVisible.value) { chapterEditor.value?.appendText(content); ElMessage.success('已插入当前章节末尾') }
  else { editChapter(null); await nextTick(); chapterEditor.value?.appendText(content); ElMessage.success('已插入新章节正文') }
  aiVisible.value = false
}
async function remove(chapter) {
  if (!editable.value || deleting.value !== null) return
  try { await ElMessageBox.confirm(`确定删除「${chapter.chapterTitle}」？删除后无法恢复。`, '删除章节', { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' }) } catch { return }
  deleting.value = chapter.chapterId
  try { await api.value.deleteChapter(work.value.workId, chapter.chapterId); ElMessage.success('章节已删除'); await load() }
  catch (failure) { await handleError(failure) }
  finally { deleting.value = null }
}
async function submit() {
  if (!editable.value || submitting.value) return
  try { await ElMessageBox.confirm('提交后作品将进入审核，期间暂不可编辑。', '提交审核', { confirmButtonText: '确认提交', cancelButtonText: '继续编辑' }) } catch { return }
  submitting.value = true
  try { await api.value.submitWork(work.value.workId); ElMessage.success('已提交审核'); await load() }
  catch (failure) { await handleError(failure) }
  finally { submitting.value = false }
}
async function showVersions() {
  versionsVisible.value = true; versionLoading.value = true; versionError.value = ''; versions.value = []
  try { versions.value = await api.value.listVersions(work.value.workId) }
  catch (failure) { versionError.value = failure.message; await handleError(failure) }
  finally { versionLoading.value = false }
}
onMounted(load)
</script>
