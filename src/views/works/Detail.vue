<template>
  <div class="detail-top"><button class="back" @click="goWorks">← 返回我的作品</button><div v-if="work" class="row"><button class="btn quiet" :disabled="!canCreate" @click="deleteVisible = true">删除作品</button><button class="btn settings-btn" :disabled="!editable" @click="settingsVisible = true"><el-icon><Setting /></el-icon>作品设置</button></div></div>
  <LoadState :pending="pending" :error="error" :retry="load" />
  <div v-if="!pending && !error && work" class="work-detail-grid">
    <section class="work-detail-main">
      <div class="workhead"><div class="wh-cover" :class="{ 'script-cover': !(avatarUrl(work.cover) && !coverFailed) }"><img v-if="avatarUrl(work.cover) && !coverFailed" :src="avatarUrl(work.cover)" alt="作品封面" @error="coverFailed = true" /><template v-else><span class="script-slip">{{ work.title }}</span><span class="bg-glyph" aria-hidden="true">{{ work.title?.slice(0, 1) }}</span></template></div><div class="wh-body"><div class="row"><h1 class="detail-title">{{ work.title }}</h1><span class="stamp sm" :data-s="workDisplayState.stamp">{{ workDisplayState.label }}</span></div><p class="work-info">短剧 · {{ work.genreName || '未分类' }} ｜ {{ work.episodeCount ?? chapters.length }} 章 ｜ {{ words(work.wordCount) }} ｜ 最近更新 {{ dateText(work.updateTime).slice(5) }}</p><p class="wh-intro">{{ work.summary || '暂无简介' }}</p></div></div>
      <div class="row section-actions"><button class="btn" :disabled="!editable" @click="editChapter(null)">＋ 写新章节</button><button class="btn quiet" :disabled="!editable" @click="editStoryboard()">＋ 写新分镜</button><span class="cost">{{ work.status === 'reviewing' ? '审核中暂不可编辑，可查看审核进度' : reviewApproved ? (onShelf ? '作品已上架到书城；修改后需重新提交审核' : '审核已通过，请确认信息后手动上架到书城') : '章节随作品审核，通过后可开启试读；分镜提交后由平台单独审核' }}</span></div>
      <div class="creator-catalogs">
        <details class="creator-catalog" open>
          <summary><span><strong>章节目录</strong><em>{{ chapters.length }} 章</em></span><small>章节审核与试读设置</small></summary>
          <div class="creator-catalog-scroll">
            <div v-if="chapters.length" class="tbl"><table><thead><tr><th class="seq-col">序</th><th>章节标题</th><th class="num">字数</th><th>审核状态</th><th>开启试读</th><th>操作</th></tr></thead><tbody><tr v-for="chapter in chapters" :key="chapter.chapterId"><td class="num">{{ String(chapter.chapterNo).padStart(2, '0') }}</td><td>{{ chapter.chapterTitle }}</td><td class="num">{{ Number(chapter.wordCount || 0).toLocaleString() }}</td><td><span class="tag" :class="chapterState(chapter).tone">{{ chapterState(chapter).label }}</span></td>
              <td><el-switch v-if="trialAllowed(chapter)" :model-value="chapter.isFree === '1'" :aria-label="'开启试读：' + chapter.chapterTitle" :disabled="!editable || trialSaving !== null" @change="value => updateTrial(chapter, value)" /><span v-else class="cost">—</span></td><td class="ops"><button class="btn sm" :class="{ quiet: chapterState(chapter).tone !== 'bad' }" :disabled="!editable || deleting !== null" @click="editChapter(chapter)">{{ chapterState(chapter).tone === 'bad' ? '修改' : '编辑' }}</button><button class="btn quiet sm" :disabled="!editable || deleting !== null" @click="remove(chapter)">{{ deleting === chapter.chapterId ? '删除中…' : '删除' }}</button></td></tr></tbody></table></div>
            <LoadState v-else empty-text="还没有章节，写下故事的第一幕。" />
          </div>
        </details>
        <details class="creator-catalog storyboard-catalog" open>
          <summary><span><strong>分镜目录</strong><em>{{ storyboards.length }} 条</em></span><small>按场次、镜号查看分镜成果</small></summary>
          <div class="creator-catalog-scroll storyboard-scroll">
            <div v-if="storyboardLoading" class="catalog-placeholder">正在加载分镜目录…</div>
            <div v-else-if="storyboards.length" class="tbl"><table><thead><tr><th>分镜标题</th><th>关联章节</th><th>镜头数</th><th>审核状态</th><th>试读</th><th>更新时间</th><th>操作</th></tr></thead><tbody><tr v-for="storyboard in storyboards" :key="storyboard.storyboardId || storyboard.id"><td>{{ storyboard.chapterTitle || storyboard.title || storyboard.name || '未命名分镜' }}</td><td>{{ storyboard.chapterTitle || (storyboard.chapterNo ? `第 ${storyboard.chapterNo} 章` : '作品级') }}</td><td>{{ storyboard.shotCount ?? storyboard.totalShots ?? storyboard.wordCount ?? '—' }}</td><td><span class="tag" :class="storyboard.status === 'approved' ? 'ok' : ''">{{ storyboardStatus(storyboard.status) }}</span></td><td><span class="tag" :class="storyboardTrialEnabled(storyboard) ? 'ok' : 'off'">{{ storyboardTrialEnabled(storyboard) ? '已开启' : '未开启' }}</span><small class="trial-source">跟随关联章节</small></td><td>{{ storyboard.updateTime || storyboard.updatedAt || '—' }}</td><td><button class="btn quiet sm" :disabled="!editable || storyboardDeleting !== null" @click="removeStoryboard(storyboard)">{{ storyboardDeleting === (storyboard.storyboardId || storyboard.id) ? '删除中…' : '删除' }}</button></td></tr></tbody></table></div>
            <div v-else class="catalog-placeholder storyboard-empty"><span class="storyboard-glyph">▦</span><strong>分镜目录已建立</strong><p>当前还没有分镜成果。使用 AI 分镜生成，或完成分镜任务交付后，内容会按场次和镜号显示在这里。</p></div>
          </div>
        </details>
      </div>
    </section>
    <aside class="work-detail-side">
      <div v-if="latestReview?.reviewOpinion && ['revision', 'rejected'].includes(work.status)" class="note bad">{{ latestReview.reviewOpinion }}</div>
      <div v-if="!canCreate" class="note info">创作者能力尚未开通，当前仅可查看作品。</div>
      <div class="sub"><div class="sub-head"><h3>当前状态</h3></div><div class="panel attached"><dl class="summary"><div><dt>审核状态</dt><dd :class="workDisplayState.tone">{{ reviewApproved ? '已通过' : stateOf(work.status).label }}</dd></div><div><dt>书城状态</dt><dd :class="onShelf ? 'ok' : reviewApproved ? 'wait' : 'off'">{{ onShelf ? '已上架' : reviewApproved ? '待手动上架' : '未上架' }}</dd></div><div><dt>审核通过章节</dt><dd>{{ chapters.filter(trialAllowed).length }} <small>/ {{ work.episodeCount ?? chapters.length }}</small></dd></div><div><dt>章节总数</dt><dd>{{ chapters.length }}</dd></div></dl><div v-if="reviewApproved" class="shelf-action"><button class="btn shelf-primary" :disabled="shelfing" @click="toggleShelf">{{ shelfing ? '处理中…' : onShelf ? '下架作品' : '上架到书城' }}</button><p>{{ onShelf ? '作品当前已在书城展示。' : '审核已通过，点击后才会展示在书城。' }}</p></div><div class="row section-actions"><button class="btn" :disabled="!editable || !chapters.length || submitting" @click="submit">{{ submitting ? '提交中…' : '提交审核' }}</button><button class="btn quiet" @click="showVersions">查看版本历史</button></div><p class="cost">审核通过不会自动上架；已上架作品改动后需要重新提交审核。</p></div></div>
      <div class="sub"><div class="sub-head"><h3>审核记录</h3></div><div class="panel attached"><LoadState :error="reviewError" :retry="loadReviews" :empty="!reviewError && !reviews.length" empty-text="暂无审核记录" /><ul v-if="!reviewError" class="timeline"><li v-for="review in reviews" :key="review.reviewId" :data-tone="review.status === 'approved' ? 'passed' : ['revision', 'rejected'].includes(review.status) ? 'revise' : ''"><time>{{ dateText(review.reviewEndTime || review.createdAt || review.createTime) }}</time><b>内容审核 · {{ reviewLabels[review.status] || '状态待确认' }}</b><p v-if="review.reviewOpinion">{{ review.reviewOpinion }}<span v-if="review.reviewerName"> —— 审核员 {{ review.reviewerName }}</span></p></li></ul></div></div>
    </aside>
  </div>
  <WorkSettings v-if="settingsVisible" v-model="settingsVisible" :work="work" @saved="load" />
  <WorkDelete v-if="deleteVisible" v-model="deleteVisible" :work="work" @deleted="goWorks" />
  <PortalLayer v-model="versionsVisible" title="版本历史" modal><LoadState :pending="versionLoading" :error="versionError" :retry="showVersions" :empty="!versionLoading && !versionError && !versions.length" /><ul class="timeline"><li v-for="version in versions" :key="version.versionId"><time>{{ dateText(version.createTime) }}</time><b>{{ version.version || version.versionNo || '作品版本' }}</b><p>{{ version.versionDesc || version.description || '暂无版本说明' }}</p></li></ul></PortalLayer>
</template>
<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Setting } from '@element-plus/icons-vue'
import { chapterReviewState, canSetChapterTrial } from '../../utils/chapterReview.js'
import { usePortal } from '../../utils/portal.js'
import { avatarUrl } from '../../utils/avatarUrl.js'
import { canEdit, stateOf, words, dateText } from '../../utils/creator.js'
import LoadState from '../../components/LoadState.vue'
import PortalLayer from '../../components/PortalLayer.vue'
import WorkSettings from './Settings.vue'
import WorkDelete from './Delete.vue'
import { setChapterTrial, changeShelfStatus, deleteWorkStoryboard, listWorkStoryboards } from '../../api/creator.js'
const { api, user, canCreate, goWorks, handleError } = usePortal()
const route = useRoute()
const router = useRouter()
const work = ref(null)
const coverFailed = ref(false)
const chapters = ref([])
const storyboards = ref([])
const storyboardLoading = ref(false)
const reviews = ref([])
const latestReview = ref(null)
const pending = ref(true)
const error = ref('')
const reviewError = ref('')
const submitting = ref(false)
const deleting = ref(null)
const storyboardDeleting = ref(null)
const settingsVisible = ref(false)
const deleteVisible = ref(false)
const versionsVisible = ref(false)
const versionLoading = ref(false)
const versionError = ref('')
const versions = ref([])
const shelfing = ref(false)
const editable = computed(() => canEdit(user.value, work.value))
const reviewApproved = computed(() => work.value?.status === 'published')
const onShelf = computed(() => work.value?.shelfStatus === 'on_shelf')
const workDisplayState = computed(() => reviewApproved.value
  ? (onShelf.value ? { label: '已上架', tone: 'ok', stamp: 'passed' } : { label: '审核通过，待上架', tone: 'wait', stamp: 'passed' })
  : stateOf(work.value?.status))
const reviewLabels = { approved: '通过', pending: '等待审核', ai_reviewing: 'AI 审核中', reviewing: '审核中', revision: '需修改', rejected: '驳回' }
const trialSaving = ref(null)
const chapterState = chapter => chapterReviewState(chapter, work.value?.status)
const trialAllowed = chapter => canSetChapterTrial(chapter, work.value?.status)
async function updateTrial(chapter, enabled) {
  if (!editable.value || !trialAllowed(chapter) || trialSaving.value !== null) return
  trialSaving.value = chapter.chapterId
  try {
    await setChapterTrial(route.params.id, chapter.chapterId, enabled)
    chapter.isFree = enabled ? '1' : '0'
    ElMessage.success(enabled ? '已开启章节试读' : '已关闭章节试读')
    await loadStoryboards()
  } catch (failure) {
    await handleError(failure)
  } finally { trialSaving.value = null }
}
const storyboardStatus = status => ({ ai_reviewing: 'AI审核中', pending: '待人工审核', approved: '审核通过', rejected: '审核驳回' })[status] || '待审核'
// 作者视角的 readable 包含本人权限，不能用它判断是否对读者开放试读。
const storyboardTrialEnabled = storyboard => {
  const explicit = storyboard?.trialEnabled === true || storyboard?.trialEnabled === 1 || storyboard?.trialEnabled === '1'
  if (explicit) return true
  const title = String(storyboard?.chapterTitle || storyboard?.title || storyboard?.name || '').trim()
  const chapter = chapters.value.find(item => String(item.chapterTitle || '').trim() === title)
  return trialAllowed(chapter) && chapter.isFree === '1'
}
async function loadReviews() {
  reviewError.value = ''
  try { reviews.value = await api.value.listReviews(route.params.id) }
  catch (failure) { reviewError.value = failure.message; await handleError(failure) }
}
async function load() {
  pending.value = true; error.value = ''
  try { const detail = await api.value.getWork(route.params.id); work.value = detail.work; coverFailed.value = false; chapters.value = detail.chapters || []; latestReview.value = detail.latestReview; await Promise.all([loadReviews(), loadStoryboards()]) }
  catch (failure) { error.value = failure.message || '作品加载失败'; await handleError(failure) }
  finally { pending.value = false }
}
async function toggleShelf() {
  if (!reviewApproved.value || shelfing.value) return
  const nextStatus = onShelf.value ? 'off_shelf' : 'on_shelf'
  const action = nextStatus === 'on_shelf' ? '上架到书城' : '下架作品'
  try { await ElMessageBox.confirm(nextStatus === 'on_shelf' ? '审核已通过。确认后作品才会展示在书城，是否继续？' : '下架后读者将暂时无法在书城看到该作品，是否继续？', action, { confirmButtonText: '确认', cancelButtonText: '取消', type: nextStatus === 'on_shelf' ? 'success' : 'warning' }) } catch { return }
  shelfing.value = true
  try { await changeShelfStatus(work.value.workId, nextStatus); ElMessage.success(nextStatus === 'on_shelf' ? '作品已上架到书城' : '作品已下架'); await load() }
  catch (failure) { await handleError(failure) }
  finally { shelfing.value = false }
}
async function loadStoryboards() {
  storyboardLoading.value = true
  try {
    const result = await listWorkStoryboards(route.params.id)
    storyboards.value = Array.isArray(result) ? result : result?.list || result?.rows || []
  } catch {
    // 分镜接口尚未接入时保留目录和空状态，不影响作品与章节主流程。
    storyboards.value = []
  } finally {
    storyboardLoading.value = false
  }
}
function editChapter(chapter) {
  if (!editable.value) return
  return router.push({ path: '/works/create', query: { workId: work.value.workId, chapterId: chapter?.chapterId ?? 'new' } })
}
function editStoryboard() {
  if (!editable.value) return
  return router.push({ path: '/works/create', query: { workId: work.value.workId, mode: 'storyboard' } })
}
async function remove(chapter) {
  if (!editable.value || deleting.value !== null) return
  try { await ElMessageBox.confirm(`确定删除「${chapter.chapterTitle}」？删除后无法恢复。`, '删除章节', { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' }) } catch { return }
  deleting.value = chapter.chapterId
  try { await api.value.deleteChapter(work.value.workId, chapter.chapterId); ElMessage.success('章节已删除'); await load() }
  catch (failure) { await handleError(failure) }
  finally { deleting.value = null }
}
async function removeStoryboard(storyboard) {
  const storyboardId = storyboard.storyboardId || storyboard.id
  if (!editable.value || !storyboardId || storyboardDeleting.value !== null) return
  try { await ElMessageBox.confirm(`确定删除关联章节“${storyboard.chapterTitle || '未命名章节'}”的分镜？删除后无法恢复。`, '删除分镜', { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' }) } catch { return }
  storyboardDeleting.value = storyboardId
  try { await deleteWorkStoryboard(work.value.workId, storyboardId); ElMessage.success('分镜已删除'); await load() }
  catch (failure) { await handleError(failure) }
  finally { storyboardDeleting.value = null }
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
