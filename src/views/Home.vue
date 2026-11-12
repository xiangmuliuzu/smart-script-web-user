<template>
  <div class="creator-home creator-portal">
    <header class="topbar">
      <button class="brand" aria-label="剧云策工作台" @click="goProtected('/works')"><b>剧云策</b><span>创作者中心</span></button>
      <nav class="nav" aria-label="主导航">
        <button aria-current="page" @click="router.push('/')">首页</button>
        <button @click="goProtected('/works')">工作台</button>
        <button @click="router.push('/demand')">任务广场</button>
      </nav>
      <div class="topbar-right">
        <button v-if="loggedIn && realNameStatus && realNameStatus !== 'APPROVED'" class="chip verify-chip" @click="openPanel('account', 'profile')">⚠ 实名认证{{ realNameStatus === 'PENDING' ? '审核中' : '未完成' }}</button>
        <div v-if="loggedIn" class="nav-group" role="group" aria-label="交易链路">
          <button v-for="item in tradeLinks" :key="item.label" class="nav-icon" :aria-label="item.label" :title="item.label" @click="openPanel('cooperation', item.tab)"><span class="ico"><el-icon><component :is="item.icon" /></el-icon></span><span class="lbl">{{ item.label }}</span></button>
        </div>
        <div v-if="loggedIn" class="nav-group" role="group" aria-label="沟通通知">
          <button v-for="item in messageLinks" :key="item.label" class="nav-icon" :aria-label="item.label" :title="item.label" @click="openPanel(item.panel)"><span class="ico"><el-icon><component :is="item.icon" /></el-icon><span v-if="item.panel === 'messages' && unread" class="badge">{{ unread > 99 ? '99+' : unread }}</span><span v-if="item.panel === 'chat' && chatUnread" class="badge">{{ chatUnread > 99 ? '99+' : chatUnread }}</span></span><span class="lbl">{{ item.label }}</span></button>
        </div>
        <el-dropdown v-if="loggedIn" trigger="click" @command="accountCommand">
          <button class="avatar-btn" aria-label="账号菜单"><el-avatar class="avatar" :size="28" :src="avatarUrl(user?.avatar)" :alt="displayName + '的头像'">{{ displayName.slice(0, 1) }}</el-avatar><em>{{ displayName }}</em><el-icon><ArrowDown /></el-icon></button>
          <template #dropdown><el-dropdown-menu class="portal-menu"><div class="who"><b>{{ displayName }}</b><span>{{ user?.userName || '平台用户' }}</span></div><el-dropdown-item command="profile">个人资料</el-dropdown-item><el-dropdown-item command="feedback">意见反馈</el-dropdown-item><el-dropdown-item command="logout" divided :disabled="leaving">退出登录</el-dropdown-item></el-dropdown-menu></template>
        </el-dropdown>
        <button v-else class="topbar-login" @click="goLogin">请登录</button>
      </div>
    </header>

    <main ref="landing" class="landing">
      <section id="home-hero" class="screen hero">
        <div class="hero-grid"></div><div class="hero-glow"></div>
        <div class="hero-inner">
          <div class="hero-copy"><p class="eyebrow"><i></i> 剧本创作者的 AI 起稿工具</p><h1>把灵感写下来，<br><em>让故事开始生长。</em></h1><p class="lead">从一句故事灵感出发，生成可继续修改的剧本大纲与章节。AI 先搭好骨架，故事始终由你来决定。</p><div class="actions"><button class="gold-button" @click="startCreate">立即创作 <b>↗</b></button><button class="text-button" @click="scrollTo('home-ai')">看看 AI 如何起稿 <b>↓</b></button></div><p class="caption">—　设定 · 大纲 · 章节，一条完整创作流程</p></div>
          <div class="hero-visual" aria-label="AI 创作草稿示意"><div class="orbit orbit-a"></div><div class="orbit orbit-b"></div><div class="folio"><div class="folio-top"><span>AI 创作草稿</span><span class="editable"><i></i> 可继续编辑</span></div><div class="gold-rule"></div><small>故事灵感</small><h2>如果一通电话，<br>来自三年前呢？</h2><p>深夜电台　·　都市悬疑　·　12 集</p><div class="folio-line"></div><div class="folio-steps"><b>01 设定</b><span>→</span><span>02 大纲</span><span>→</span><span>03 章节</span></div></div><div class="float-note note-ai">✦ <span>AI 起稿</span></div><div class="float-note note-step"><b>3</b><span>步开始创作</span></div><span class="visual-index">STORY / 001</span></div>
        </div><button class="scroll-cue" @click="scrollTo('home-ai')"><i></i>向下探索</button>
      </section>

      <section id="home-ai" class="screen ai-section">
        <div class="ai-layout"><div class="section-copy"><p class="eyebrow"><i></i> AI CREATION FLOW</p><h2>不用等灵感完整，<br><em>先把第一稿写出来。</em></h2><p>三步推进创作，每一步都能检查、修改，再决定是否继续。</p></div>
          <div class="process"><div class="process-list">
            <button v-for="(item,i) in flow" :key="item.title" class="process-row" :class="{ selected: activeStep===i }" @mouseenter="activeStep=i" @focus="activeStep=i" @click="activeStep=i"><b class="step-no">0{{ i+1 }}</b><span><strong>{{ item.title }}</strong><small>{{ item.description }}</small></span><i>↗</i></button>
            <button class="gold-button start-ai" @click="startCreate">开始 AI 创作 <b>↗</b></button>
          </div>
          <div class="preview-window"><div class="window-bar"><span class="window-dots"><i></i><i></i><i></i></span><span>剧云策 · AI 创作</span><b>{{ flow[activeStep].title }}</b></div>
            <div v-if="activeStep===0" class="preview-body"><small>作品设定</small><h3>深夜频率</h3><div class="input-look"><label>故事灵感</label><p>一位深夜电台主播，接到来自三年前失踪女孩的电话。</p></div><div class="chips"><span>都市悬疑</span><span>12 集</span><span>默认导演</span></div><div class="fake-button">生成剧本大纲　✦</div></div>
            <div v-else-if="activeStep===1" class="preview-body"><small>AI 生成 · 可手动编辑</small><h3>故事大纲</h3><div class="line wide"></div><div class="line"></div><div class="line short"></div><div class="outline-row"><b>第 1 集</b><span>深夜频率 · 意外来电</span></div><div class="outline-row"><b>第 2 集</b><span>没有来电的人</span></div><div class="outline-row"><b>第 3 集</b><span>信号另一端</span></div></div>
            <div v-else class="preview-body script-body"><small>第一集 · AI 起稿</small><h3>深夜频率</h3><b>1. 内景 · 电台直播间 · 深夜</b><p>凌晨两点十七分，城市的噪音终于降到最低。林默坐在没有观众的直播间里。</p><p>耳机里忽然传来一阵短促的电流声。</p><p class="dialogue">“有人吗？”一个女孩的声音从沉默里浮出来。</p></div>
          </div></div>
        </div><button class="scroll-cue" @click="scrollTo('home-ranking')"><i></i>看看热门作品</button>
      </section>

      <section id="home-ranking" class="screen ranking-section">
        <div class="ranking-wrap"><div class="ranking-head"><div><p class="eyebrow"><i></i> FROM THE HOT LIST</p><h2>热门榜里的<br><em>好故事。</em></h2><p>从平台热门榜发现受欢迎的作品，也为自己的下一个故事找一点灵感。</p></div><div class="quote"><b>“</b><p>每个好故事，<br>都从一个念头开始。</p><small>剧云策 · 创作者中心</small></div></div>
          <div v-if="loading" class="ranking-state"><span class="spinner"></span>正在读取热门榜</div>
          <div v-else-if="error" class="ranking-state">{{ error }} <button @click="loadRankings">重新加载</button></div>
          <div v-else-if="rankings.length" class="works-grid"><article v-for="(work,index) in rankings.slice(0,6)" :key="work.workId || work.id || index" class="work-card" role="button" tabindex="0" @click="openWork(work)" @keydown.enter.prevent="openWork(work)"><div class="cover" :class="{ photo: hasCover(work) }"><img v-if="hasCover(work)" class="cover-image" :src="cover(work)" :alt="title(work) + '封面'" loading="lazy" @error="markCoverFailed(work)" /><b>{{ String(index+1).padStart(2,'0') }}</b><span v-if="!hasCover(work)" class="cover-word">{{ title(work).slice(0,1) }}</span><div><small>{{ genre(work) }}</small><h3>{{ title(work) }}</h3></div><span class="cover-cta">点击查看 · 首页试读</span></div><div class="work-desc"><p>{{ summary(work) || '热门榜精选作品' }}</p><div><span>{{ author(work) }}</span><span v-if="heat(work)">热度 {{ heat(work) }}</span></div></div></article></div>
          <div v-else class="ranking-state">热门榜暂时没有可展示的作品。</div>
          <div class="ranking-foot"><span>平台热门榜作品</span><button @click="startCreate">用 AI 开始我的故事 <b>↗</b></button></div>
        </div><button class="scroll-cue" @click="scrollTo('home-end')"><i></i>开始你的创作</button>
      </section>

      <section id="home-end" class="screen end-section"><div class="end-halo"></div><div class="end-copy"><p class="eyebrow"><i></i> YOUR STORY STARTS HERE</p><h2>下一部好故事，<br><em>可以从现在开始。</em></h2><p>写下灵感，AI 帮你起稿。后面的故事，由你继续。</p><button class="gold-button" @click="startCreate">立即创作 <b>↗</b></button><small>设定　·　大纲　·　章节</small></div><footer><RouterLink to="/">剧云策</RouterLink><span>让每个灵感，都有机会成为好故事。</span></footer></section>
    </main>
    <MessagesPanel v-if="loggedIn && panel === 'messages'" v-model="panelVisible" />
    <PlatformChatPanel v-if="loggedIn && panel === 'chat'" v-model="panelVisible" />
    <CooperationPanel v-if="loggedIn && panel === 'cooperation'" v-model="panelVisible" :initial-tab="panelTab" :order-search="panelOrderSearch" :initial-keyword="panelKeyword" />
    <RightsPanel v-if="loggedIn && panel === 'rights'" ref="rightsPanelRef" v-model="panelVisible" :initial-tab="panelTab" />
    <AccountPanel v-if="loggedIn && panel === 'account'" v-model="panelVisible" :initial-tab="panelTab" />
    <RechargePanel v-if="loggedIn && panel === 'recharge'" v-model="panelVisible" />
    <nav class="section-dots" aria-label="首页分区"><button v-for="(item,index) in sections" :key="item.id" :class="{ active: currentSection===index }" :aria-label="item.label" @click="scrollTo(item.id)"><i></i></button></nav>
    <div v-if="activeWork" class="work-modal-backdrop" role="presentation">
      <section class="work-modal" role="dialog" aria-modal="true" :aria-label="title(activeWork) + '作品预览'">
        <header class="work-modal-head"><div><small>热门榜作品 · 首页预览</small><h2>{{ title(activeWork) }}</h2></div><button class="modal-close" aria-label="关闭作品预览" @click="closeWork">×</button></header>
        <div class="work-modal-body">
          <aside class="work-modal-info"><div class="modal-cover" :class="{ photo:hasCover(activeWork) }"><img v-if="hasCover(activeWork)" class="cover-image" :src="cover(activeWork)" :alt="title(activeWork) + '封面'" @error="markCoverFailed(activeWork)" /><span>{{ genre(activeWork) }}</span><b>{{ title(activeWork) }}</b></div><h3>作品简介</h3><p>{{ summary(activeWork) || '作者暂未填写作品简介。' }}</p><dl><div><dt>作者</dt><dd>{{ author(activeWork) }}</dd></div><div v-if="heat(activeWork)"><dt>热度</dt><dd>{{ heat(activeWork) }}</dd></div></dl><button class="modal-create" @click="startCreate">我也要创作 <b>↗</b></button></aside>
          <div class="work-modal-reading"><div class="reading-head"><div><small>免费试读</small><h3>{{ selectedChapter ? (selectedChapter.chapterTitle || selectedChapter.title || '章节预览') : '章节目录' }}</h3></div><span v-if="previewChapters.length">可读 {{ previewChapters.length }} 章</span></div>
            <div v-if="previewLoading" class="modal-state">正在加载作品与试读内容…</div><div v-else-if="previewError" class="modal-state error">{{ previewError }}</div>
            <template v-else><div v-if="previewChapters.length" class="chapter-preview-layout"><nav class="chapter-list" aria-label="可试读章节"><button v-for="(chapter,index) in previewChapters" :key="chapter.chapterId || index" :class="{ selected: selectedChapter?.chapterId === chapter.chapterId }" @click="readChapter(chapter)">{{ chapter.chapterTitle || `第 ${index+1} 章` }}<span>阅读 ›</span></button></nav><article class="chapter-content"><div v-if="chapterLoading" class="modal-state">正在打开章节…</div><template v-else-if="chapterContent"><h4>{{ selectedChapter?.chapterTitle || '章节内容' }}</h4><p>{{ chapterContent }}</p><div class="preview-limit">以上为平台允许的试读内容</div></template><div v-else class="modal-state">选择左侧章节开始试读</div></article></div><div v-else class="modal-state">该作品暂未开放章节试读，可查看作品简介。</div></template>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, provide, ref, shallowRef } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { ArrowDown, Bell, ChatDotRound, ChatLineSquare, ChatRound, Document, Tickets } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getInfo, isAuthFailure, logout, request } from '../auth.js'
import { asList } from '../utils/creator.js'
import { mediaUrl } from '../utils/avatarUrl.js'
import { avatarUrl } from '../utils/avatarUrl.js'
import { portalKey } from '../utils/portal.js'
import MessagesPanel from './panels/Messages.vue'
import PlatformChatPanel from './panels/PlatformChat.vue'
import CooperationPanel from './panels/Cooperation.vue'
import RightsPanel from './panels/Rights.vue'
import AccountPanel from './panels/Account.vue'
import RechargePanel from './panels/Recharge.vue'

const router = useRouter()
const landing = ref(null)
const activeStep = ref(0)
const rankings = ref([])
const loading = ref(true)
const error = ref('')
const activeWork = ref(null)
const previewChapters = ref([])
const previewLoading = ref(false)
const previewError = ref('')
const failedCovers = ref({})
const selectedChapter = ref(null)
const chapterContent = ref('')
const chapterLoading = ref(false)
const currentSection = ref(0)
const api = shallowRef(null)
const user = ref(null)
const unread = ref(0)
const chatUnread = ref(0)
const realNameStatus = ref('')
const panel = ref('')
const panelTab = ref('')
const panelOrderSearch = ref('')
const panelKeyword = ref('')
const panelVisible = ref(false)
const rightsPanelRef = ref(null)
const leaving = ref(false)
const loggedIn = computed(() => Boolean(localStorage.getItem('PcUser-Token')))
const displayName = computed(() => user.value?.nickname || user.value?.userName || '用户')
const canCreate = computed(() => user.value?.authorCapability === true)
const basePath = '/works'
const sections = [{ id:'home-hero', label:'首页' }, { id:'home-ai', label:'AI 创作' }, { id:'home-ranking', label:'热门榜' }, { id:'home-end', label:'开始创作' }]
const tradeLinks = [
  { label:'询盘', icon:ChatLineSquare, tab:'inquiry' }, { label:'会话', icon:ChatRound, tab:'session' },
  { label:'订单', icon:Tickets, tab:'order' }, { label:'合同', icon:Document, tab:'contract' }
]
const messageLinks = [{ label:'消息', icon:Bell, panel:'messages' }, { label:'平台客服', icon:ChatDotRound, panel:'chat' }]
const flow = [
  { title:'设定故事', description:'书名、故事灵感、题材和集数' },
  { title:'生成大纲', description:'确认故事方向和分集规划' },
  { title:'逐章起稿', description:'生成章节，带入创作工作台' }
]
let observer
const title = item => item?.title || item?.workName || item?.name || '未命名作品'
const genre = item => item?.genreName || item?.categoryName || item?.genre || item?.workTypeName || '热门作品'
const summary = item => item?.summary || item?.description || item?.intro || item?.synopsis || ''
const author = item => item?.authorName || item?.penName || item?.nickname || '平台创作者'
const heat = item => item?.heat ?? item?.heatScore ?? item?.hotValue ?? item?.score ?? item?.viewCount ?? ''
const cover = item => mediaUrl(item?.cover || item?.coverUrl || item?.workCover || item?.workCoverUrl || item?.coverImage || '')
const coverKey = item => String(item?.workId ?? item?.id ?? item?.workName ?? item?.title ?? 'unknown')
const hasCover = item => Boolean(cover(item)) && !failedCovers.value[coverKey(item)]
function markCoverFailed(item) { failedCovers.value[coverKey(item)] = true }

async function loadRankings() {
  loading.value = true; error.value = ''
  try {
    const response = await request('/api/v1/content/rankings', { authenticated: false })
    const data = response?.data ?? response
    rankings.value = asList(data?.rankings ?? data?.works ?? data?.list ?? data)
  } catch (failure) { error.value = failure.message || '热门榜加载失败' }
  finally { loading.value = false }
}
async function openWork(work) {
  const id = work?.workId || work?.id
  if (!id) return
  activeWork.value = work; previewLoading.value = true; previewError.value = ''; previewChapters.value = []; selectedChapter.value = null; chapterContent.value = ''
  try {
    const [detailResponse, previewResponse] = await Promise.all([
      request(`/api/v1/content/works/${encodeURIComponent(id)}`, { authenticated:false }),
      request(`/api/v1/content/works/${encodeURIComponent(id)}/preview`, { authenticated:false })
    ])
    activeWork.value = { ...work, ...(detailResponse?.data ?? detailResponse) }
    previewChapters.value = asList((previewResponse?.data ?? previewResponse)?.previewChapters)
    if (previewChapters.value.length) await readChapter(previewChapters.value[0])
  } catch (failure) { previewError.value = failure.message || '作品预览暂时不可用' }
  finally { previewLoading.value = false }
}
async function readChapter(chapter) {
  if (!chapter?.chapterId) { selectedChapter.value = chapter; chapterContent.value = chapter?.content || ''; return }
  selectedChapter.value = chapter; chapterLoading.value = true; chapterContent.value = ''
  try {
    const response = await request(`/api/v1/content/chapters/${encodeURIComponent(chapter.chapterId)}`, { authenticated:false })
    const detail = response?.data ?? response
    chapterContent.value = detail?.formattedContent || detail?.content || '该章节暂时没有可展示的试读内容。'
  } catch (failure) { chapterContent.value = failure.message || '该章节暂时无法试读' }
  finally { chapterLoading.value = false }
}
function closeWork() { activeWork.value = null; selectedChapter.value = null; chapterContent.value = ''; previewChapters.value = [] }
function startCreate() { return goProtected('/works/create/ai', 'AI 创作') }
function goProtected(path, feature = '该功能') {
  if (loggedIn.value) return router.push(path)
  return ElMessageBox.confirm(`${feature}需要登录后使用，是否前往登录？`, '请先登录', {
    confirmButtonText:'去登录', cancelButtonText:'稍后再说', type:'info', closeOnClickModal:false
  }).then(() => router.push({ path:'/login', query:{ redirect:path } })).catch(() => {})
}
function goLogin() { return router.push({ path:'/login', query:{ redirect:'/works' } }) }
function openPanel(name, tab, keyword = '') {
  panelVisible.value = false
  panel.value = name
  panelTab.value = tab || ''
  panelOrderSearch.value = tab === 'order' ? keyword : ''
  panelKeyword.value = tab === 'inquiry' ? keyword : ''
  panelVisible.value = true
}
async function openDeliveryByOrder(orderId) {
  if (!orderId) return
  openPanel('rights', 'delivery')
  await nextTick()
  await nextTick()
  rightsPanelRef.value?.openDeliveryByOrder?.(orderId)
}
function goWorks() { panelVisible.value = false; return router.push('/works') }
function goHome() { panelVisible.value = false; return router.push('/') }
function goWork(id) { panelVisible.value = false; return router.push(`/works/${id}`) }
function goDemand() { panelVisible.value = false; return router.push('/demand') }
function goDemandDetail(id) { panelVisible.value = false; return router.push(`/demand/${id}`) }
async function handleError(failure) {
  if (isAuthFailure(failure)) {
    await router.replace({ path:'/login', query:{ redirect:'/' } })
    return
  }
  ElMessage.error(failure?.message || '操作失败，请稍后重试')
}
async function refreshUnread() {
  if (!api.value) return
  try { unread.value = Number(await api.value.unreadCount()) || 0 }
  catch (failure) { if (isAuthFailure(failure)) await handleError(failure) }
  try { chatUnread.value = Number(await api.value.chatUnreadCount()) || 0 }
  catch (failure) { if (isAuthFailure(failure)) await handleError(failure) }
}
async function refreshRealName() {
  try { realNameStatus.value = (await api.value.getRealName())?.status || '' }
  catch (failure) { if (isAuthFailure(failure)) await handleError(failure) }
}
async function loadAccountInfo() {
  try {
    const info = await getInfo()
    const currentUser = { ...(info?.user || {}) }
    user.value = currentUser
    api.value = await import('../api/creator.js')
    try {
      const profile = await api.value.getProfile()
      Object.assign(currentUser, profile, {
        nickname: profile?.nickname || currentUser.nickname || currentUser.userName,
        avatar: profile?.avatar || currentUser.avatar
      })
    } catch (failure) {
      if (isAuthFailure(failure)) throw failure
    }
    await Promise.allSettled([refreshUnread(), refreshRealName()])
  } catch (failure) {
    if (isAuthFailure(failure)) await handleError(failure)
    else ElMessage.warning('账号信息暂时无法加载，请稍后重试')
  }
}
async function accountCommand(command) {
  if (command !== 'logout') { openPanel('account', command); return }
  if (leaving.value) return
  leaving.value = true
  try { await logout() }
  catch { ElMessage.warning('服务端退出未成功，已清理本地登录状态') }
  finally {
    user.value = null
    panelVisible.value = false
    await router.replace('/login')
    leaving.value = false
  }
}
provide(portalKey, { api, user, canCreate, basePath, openPanel, openDeliveryByOrder, goWork, goWorks, goHome, goDemand, goDemandDetail, handleError, refreshUnread })
function scrollTo(id) { document.getElementById(id)?.scrollIntoView({ behavior:'smooth', block:'start' }) }
function observeSections(entries) { for (const entry of entries) if (entry.isIntersecting) currentSection.value = sections.findIndex(section => section.id === entry.target.id) }
onMounted(() => {
  loadRankings()
  if (loggedIn.value) loadAccountInfo()
  if (landing.value && 'IntersectionObserver' in window) {
    observer = new IntersectionObserver(observeSections, { root:landing.value, threshold:.55 })
    sections.forEach(section => { const element = document.getElementById(section.id); if (element) observer.observe(element) })
  }
})
onBeforeUnmount(() => observer?.disconnect())
</script>

<style scoped>
.creator-home{--bg:#111417;--bg-soft:#191e20;--fg:#f2efe6;--muted:#a0a5a3;--teal:#79b8ae;--gold:#d7b779;position:fixed;inset:0;overflow:hidden;background:var(--bg);color:var(--fg);font-family:var(--sans,"Microsoft YaHei",sans-serif)}
.home-nav{position:absolute;z-index:5;inset:0 0 auto;height:70px;padding:0 clamp(18px,5vw,80px);display:grid;grid-template-columns:1fr auto 1fr;align-items:center;border-bottom:1px solid #ffffff10;background:linear-gradient(#111417ed,#11141722);backdrop-filter:blur(12px)}
.brand{display:flex;align-items:center;gap:10px;width:max-content;color:var(--fg);text-decoration:none}.brand-seal{width:31px;height:31px;display:grid;place-items:center;border:1px solid #d7b7799c;color:var(--gold);font:18px var(--serif,Georgia,serif)}.brand b{display:block;font:600 16px var(--serif,Georgia,serif);letter-spacing:.2em}.brand small{display:block;margin-top:1px;color:#8f9694;font-size:9px;letter-spacing:.12em}.home-nav nav{height:100%;display:flex;gap:clamp(18px,3vw,42px)}.home-nav nav a{position:relative;display:flex;align-items:center;color:#a8acab;text-decoration:none;font-size:13px}.home-nav nav a:hover,.home-nav nav a[aria-current=page]{color:#fff}.home-nav nav a[aria-current=page]:after{content:"";position:absolute;bottom:0;left:0;right:0;height:2px;background:var(--gold)}.nav-end{display:flex;justify-content:end;align-items:center;gap:20px}.nav-caption{font-size:10px;color:#b6bcba;white-space:nowrap}.nav-caption i,.editable i{display:inline-block;width:6px;height:6px;margin-right:6px;border-radius:50%;background:var(--teal);box-shadow:0 0 8px var(--teal)}.login{color:var(--gold);font-size:11px;text-decoration:none;white-space:nowrap}
.landing{position:absolute;inset:0;overflow:auto;scroll-snap-type:y mandatory;scroll-behavior:smooth;scrollbar-width:none;overscroll-behavior:contain}.landing::-webkit-scrollbar{display:none}.screen{position:relative;min-height:100svh;padding:92px clamp(20px,7vw,108px) 68px;display:flex;align-items:center;justify-content:center;overflow:hidden;scroll-snap-align:start;scroll-snap-stop:always;isolation:isolate}.hero{background:radial-gradient(ellipse at 76% 48%,#496e681c,transparent 36%),radial-gradient(ellipse at 18% 83%,#b3894c10,transparent 40%),#111417}.hero-grid{position:absolute;inset:0;z-index:-1;opacity:.14;background-image:linear-gradient(#fff1 1px,transparent 1px),linear-gradient(90deg,#fff1 1px,transparent 1px);background-size:68px 68px;mask-image:linear-gradient(90deg,transparent,#000 42%,#000 85%,transparent)}.hero-glow{position:absolute;right:8%;top:14%;width:min(600px,54vw);aspect-ratio:1;border-radius:50%;background:radial-gradient(circle,#73978c19,transparent 68%);filter:blur(10px);z-index:-1}.hero-inner{width:min(1220px,100%);display:grid;grid-template-columns:1fr .9fr;align-items:center;gap:5vw}.hero-copy{padding:20px 0}.eyebrow{display:flex;align-items:center;gap:10px;margin:0;color:var(--teal);font-size:10px;letter-spacing:.18em}.eyebrow i{width:20px;height:1px;background:var(--gold)}h1,h2,h3,p{overflow-wrap:anywhere}.hero h1,.section-copy h2,.ranking-head h2,.end-copy h2{margin:22px 0 17px;color:var(--fg);font:500 clamp(40px,5.1vw,70px)/1.23 var(--serif,Georgia,serif);letter-spacing:.02em}.hero h1 em,.section-copy h2 em,.ranking-head h2 em,.end-copy h2 em{color:var(--gold);font-style:normal}.lead{max-width:480px;color:#a9aeab;font-size:13px;line-height:2}.actions{display:flex;align-items:center;gap:22px;margin-top:30px}.gold-button{min-width:150px;padding:12px 16px;display:inline-flex;align-items:center;justify-content:space-between;gap:23px;border:1px solid #e3c98e;background:linear-gradient(115deg,#cfaa69,#ebcf96);color:#20211e;font-size:12px;font-weight:600;letter-spacing:.05em;cursor:pointer;transition:.2s}.gold-button:hover{transform:translateY(-2px);box-shadow:0 10px 28px #d7b77936}.gold-button b{font-size:15px;font-weight:400}.text-button{border:0;background:none;color:#d0d1cb;font-size:11px;cursor:pointer}.text-button b{margin-left:8px;color:var(--gold);font-size:14px;font-weight:400}.caption{margin-top:43px;color:#777f7c;font-size:9px;letter-spacing:.08em}
.hero-visual{position:relative;min-height:480px;display:grid;place-items:center}.orbit{position:absolute;border:1px solid #d7b77914;border-radius:50%}.orbit-a{width:min(520px,48vw);aspect-ratio:1}.orbit-b{width:min(680px,60vw);aspect-ratio:1;border-color:#79b8ae12}.folio{position:relative;z-index:1;width:min(365px,80%);min-height:345px;padding:24px 27px;border:1px solid #e5dfcf2b;background:linear-gradient(145deg,#303637,#202527);box-shadow:22px 27px 65px #0008;transform:rotate(2deg)}.folio:after{content:"";position:absolute;inset:8px -10px -10px 10px;z-index:-1;border:1px solid #d7b77945}.folio-top{display:flex;justify-content:space-between;color:#c4c6be;font-size:9px}.editable{color:#9dcdb1;font-size:8px}.gold-rule{height:1px;margin:17px 0 25px;background:linear-gradient(90deg,var(--gold),#ffffff18)}.folio small{color:var(--gold);font-size:8px;letter-spacing:.14em}.folio h2{margin:12px 0;color:#f0eee5;font:500 27px/1.55 var(--serif,Georgia,serif)}.folio>p{color:#a1a9a5;font-size:9px}.folio-line{height:1px;margin:31px 0 15px;background:#ffffff19}.folio-steps{display:flex;justify-content:space-between;align-items:center;color:#929a96;font-size:8px}.folio-steps b{color:#e2c98e;font-weight:500}.folio-steps span:nth-child(2),.folio-steps span:nth-child(4){color:var(--gold)}.float-note{position:absolute;z-index:2;display:flex;align-items:center;gap:8px;padding:9px 12px;border:1px solid #ffffff20;background:#252c2d;box-shadow:0 10px 28px #0007;color:#dec792}.float-note span{color:#c6cbc5;font-size:8px}.note-ai{left:0;top:18%;font-size:13px}.note-step{right:0;bottom:17%}.note-step b{font:21px var(--serif,Georgia,serif)}.visual-index{position:absolute;right:2%;top:10%;color:#79817e;font:8px var(--sans,sans-serif);letter-spacing:.2em}.scroll-cue{position:absolute;bottom:18px;left:50%;transform:translateX(-50%);display:grid;justify-items:center;gap:7px;border:0;background:none;color:#777f7c;font-size:8px;letter-spacing:.14em;cursor:pointer}.scroll-cue i{width:1px;height:20px;background:linear-gradient(var(--gold),transparent)}
.ai-section{background:radial-gradient(ellipse at 78% 48%,#496e6815,transparent 43%),#171b1d}.ai-layout{width:min(1150px,100%);display:grid;grid-template-columns:.72fr 1.28fr;align-items:center;gap:6vw}.section-copy h2{font-size:clamp(34px,4vw,54px)}.section-copy>p:last-child{max-width:340px;color:#a1a7a4;font-size:11px;line-height:1.9}.process{display:grid;grid-template-columns:minmax(185px,.78fr) minmax(300px,1.22fr);align-items:center;gap:19px}.process-list{display:grid;gap:7px}.process-row{display:grid;grid-template-columns:31px 1fr 12px;align-items:center;gap:8px;padding:13px 10px;border:1px solid transparent;background:transparent;text-align:left;color:var(--fg);cursor:pointer;transition:.2s}.process-row.selected{border-color:#d7b7794a;background:linear-gradient(100deg,#d7b77912,#fff1)}.step-no{color:#c8ab73;font:13px var(--serif,Georgia,serif)}.process-row strong{display:block;font:500 13px var(--serif,Georgia,serif)}.process-row small{display:block;margin-top:4px;color:#969d99;font-size:8px;line-height:1.5}.process-row>i{color:var(--gold);font-style:normal;opacity:0}.process-row.selected>i{opacity:1}.start-ai{margin:13px 0 0 10px;min-width:154px}.preview-window{position:relative;min-height:395px;border:1px solid #ffffff1b;background:#1c2224;box-shadow:0 25px 65px #0006;overflow:hidden}.preview-window:after{content:"";position:absolute;width:180px;height:180px;right:-90px;bottom:-95px;border:1px solid #d7b77924;border-radius:50%;pointer-events:none}.window-bar{height:35px;display:flex;align-items:center;gap:10px;padding:0 12px;border-bottom:1px solid #ffffff14;color:#929a97;font-size:8px}.window-bar>b{margin-left:auto;color:var(--gold);font-weight:400}.window-dots{display:flex;gap:4px}.window-dots i{width:5px;height:5px;border-radius:50%;background:#c38d7b}.window-dots i:nth-child(2){background:#c8b678}.window-dots i:nth-child(3){background:#7ea58f}.preview-body{max-width:440px;margin:auto;padding:30px 30px 23px;animation:appear .25s ease}.preview-body>small{color:var(--gold);font-size:8px;letter-spacing:.1em}.preview-body h3{margin:9px 0 18px;color:#f0eee7;font:500 21px var(--serif,Georgia,serif)}.input-look{padding:11px;border:1px solid #ffffff18;background:#11171966}.input-look label{color:#aaa18c;font-size:8px}.input-look p{margin:7px 0 0;color:#c4c8c0;font-size:9px;line-height:1.8}.chips{display:flex;gap:6px;margin-top:10px}.chips span{padding:4px 7px;border:1px solid #ffffff1b;color:#b1b9b4;font-size:7px}.fake-button{margin-top:16px;padding:8px;background:#d7b779;color:#24231f;text-align:center;font-size:8px}.line{height:5px;width:84%;margin:9px 0;background:#ffffff1b}.line.wide{width:61%;background:#cfad7180}.line.short{width:67%}.outline-row{display:flex;gap:13px;padding:10px 0;border-bottom:1px solid #ffffff13;color:#c4c9c4;font-size:8px}.outline-row b{color:#e0c58b;font-weight:500}.script-body h3{margin-bottom:13px}.script-body>b{color:#d6bd88;font-size:8px}.script-body p{color:#b8c0bb;font:10px/1.9 var(--serif,Georgia,serif)}.script-body .dialogue{color:#e5d2a5}.ranking-section{background:radial-gradient(ellipse at 12% 50%,#9b774112,transparent 40%),#111417}.ranking-wrap{width:min(1120px,100%)}.ranking-head{display:flex;justify-content:space-between;align-items:end;gap:25px;margin-bottom:22px}.ranking-head h2{margin:15px 0 8px;font-size:clamp(38px,4.3vw,58px)}.ranking-head>div:first-child>p:last-child{max-width:445px;color:#a2a7a3;font-size:10px;line-height:1.8}.quote{width:190px;padding:5px 0 4px 17px;border-left:1px solid #d7b77973}.quote>b{color:var(--gold);font:40px/.7 var(--serif,Georgia,serif)}.quote p{color:#d4cdbd;font:14px/1.7 var(--serif,Georgia,serif)}.quote small{color:#858c87;font-size:8px}.works-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:13px}.work-card{min-width:0;border:1px solid #ffffff17;background:#191e20;transition:transform .2s,border-color .2s}.work-card:hover{transform:translateY(-4px);border-color:#d7b77978}.cover{position:relative;height:clamp(155px,24vh,220px);overflow:hidden;background:linear-gradient(145deg,#304447,#1a2929 58%,#78674d);background-size:cover;background-position:center}.work-card:nth-child(3n+2) .cover:not(.photo){background-image:linear-gradient(145deg,#45383d,#273439 58%,#76624c)}.work-card:nth-child(3n) .cover:not(.photo){background-image:linear-gradient(145deg,#3c3b4b,#263d3a 58%,#866d48)}.cover> b{position:absolute;top:10px;left:11px;color:#efd393;font:14px var(--serif,Georgia,serif)}.cover-word{position:absolute;top:13%;left:50%;transform:translateX(-50%);color:#f0dfb526;font:clamp(70px,9vw,125px)/1 var(--serif,Georgia,serif)}.cover>div{position:absolute;left:13px;right:12px;bottom:12px}.cover small{color:#dec891;font-size:8px;letter-spacing:.13em}.cover h3{margin:5px 0 0;color:#f3f0e7;font:500 17px var(--serif,Georgia,serif)}.work-desc{padding:10px 12px 11px}.work-desc>p{height:30px;margin:0;color:#a9afaa;font-size:8px;line-height:1.7;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden}.work-desc>div{display:flex;justify-content:space-between;gap:8px;margin-top:8px;color:#818984;font-size:8px}.ranking-state{min-height:205px;display:flex;justify-content:center;align-items:center;gap:9px;color:#9da39f;font-size:10px}.ranking-state button{border:1px solid #ffffff3d;background:transparent;color:var(--gold);padding:4px 8px;font-size:8px}.spinner{width:14px;height:14px;border:1px solid #626966;border-top-color:var(--gold);border-radius:50%;animation:spin .8s linear infinite}.ranking-foot{display:flex;justify-content:space-between;align-items:center;margin-top:17px;color:#777f7b;font-size:8px}.ranking-foot button{border:0;background:transparent;color:var(--gold);font-size:9px;cursor:pointer}.ranking-foot b{margin-left:10px;font-size:13px;font-weight:400}.end-section{min-height:84svh;background:radial-gradient(ellipse at center,#67847a1a,transparent 52%),#171b1d;text-align:center}.end-halo{position:absolute;width:min(650px,90vw);aspect-ratio:1;border-radius:50%;background:radial-gradient(circle,#ad8e5320,transparent 69%)}.end-copy{position:relative;z-index:1}.end-copy .eyebrow{justify-content:center}.end-copy h2{font-size:clamp(40px,5vw,67px)}.end-copy>p:not(.eyebrow){color:#a2a8a4;font-size:10px}.end-copy .gold-button{margin:18px auto}.end-copy>small{display:block;color:#7e8681;font-size:8px;letter-spacing:.16em}.end-section footer{position:absolute;bottom:0;left:0;right:0;height:43px;padding:0 clamp(18px,5vw,80px);display:flex;align-items:center;justify-content:space-between;border-top:1px solid #ffffff10;background:#111417;color:#777f7b;font-size:8px}.end-section footer a{color:#d5bd87;text-decoration:none;font:13px var(--serif,Georgia,serif);letter-spacing:.15em}.section-dots{position:absolute;z-index:4;right:clamp(8px,2vw,26px);top:50%;transform:translateY(-50%);display:grid;gap:9px}.section-dots button{width:15px;height:15px;display:grid;place-items:center;padding:0;border:0;background:transparent;cursor:pointer}.section-dots i{width:5px;height:5px;border-radius:50%;background:#626a66;transition:.2s}.section-dots button.active i{width:8px;height:8px;background:var(--gold);box-shadow:0 0 9px #d7b77999}
@keyframes appear{from{opacity:.5;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}@keyframes spin{to{transform:rotate(360deg)}}
.cover-image{position:absolute;z-index:0;inset:0;display:block;width:100%;height:100%;object-fit:cover}.cover.photo::after,.modal-cover.photo::after{position:absolute;z-index:1;inset:0;content:"";background:linear-gradient(180deg,transparent 38%,#0d1112e8)}.modal-cover.photo::after{background:linear-gradient(180deg,transparent 35%,#173e35dd)}.cover>b,.cover-word,.cover>div,.cover-cta{z-index:2}.modal-cover>span,.modal-cover>b{position:relative;z-index:2}
.modal-cover{position:relative;overflow:hidden}
@media(max-width:900px){.home-nav{grid-template-columns:1fr auto}.home-nav nav{grid-column:2}.nav-end{display:none}.hero-inner{grid-template-columns:1fr .86fr;gap:20px}.hero-visual{min-height:400px}.folio{width:min(320px,85%);min-height:315px;padding:20px}.folio h2{font-size:23px}.ai-layout{grid-template-columns:.76fr 1.24fr;gap:25px}.process{grid-template-columns:1fr}.process-list{grid-template-columns:repeat(3,1fr)}.process-row{grid-template-columns:24px 1fr;padding:9px 5px;gap:5px}.process-row>i{display:none}.process-row small{font-size:7px}.start-ai{grid-column:1/-1}.preview-window{min-height:330px}.screen{padding-left:5vw;padding-right:5vw}}
@media(max-width:620px){.home-nav{height:58px;padding:0 12px;gap:8px}.brand{gap:6px}.brand-seal{width:26px;height:26px;font-size:14px}.brand b{font-size:12px}.brand small{font-size:7px}.home-nav nav{gap:12px}.home-nav nav a{font-size:9px}.screen{min-height:100svh;padding:76px 17px 53px;scroll-snap-stop:normal}.hero-inner{display:flex;flex-direction:column;align-items:stretch;justify-content:center;gap:0}.hero h1{margin:16px 0 10px;font-size:clamp(34px,9.5vw,47px)}.lead{font-size:10px}.actions{gap:14px;margin-top:19px}.gold-button{min-width:124px;padding:10px 11px;gap:13px;font-size:9px}.text-button{font-size:9px}.caption{margin-top:18px;font-size:7px}.hero-visual{min-height:260px}.folio{width:218px;min-height:220px;padding:14px}.folio-top{font-size:7px}.gold-rule{margin:10px 0 14px}.folio small{font-size:7px}.folio h2{margin:7px 0;font-size:17px}.folio>p{font-size:7px}.folio-line{margin:15px 0 8px}.folio-steps{font-size:6px}.orbit-a{width:290px}.orbit-b,.visual-index{display:none}.float-note{padding:6px 8px}.float-note span{font-size:7px}.note-ai{top:14px}.note-step{bottom:12px}.note-step b{font-size:15px}.scroll-cue{bottom:10px;font-size:7px}.scroll-cue i{height:13px}.ai-layout{display:block}.section-copy h2{margin:14px 0 7px;font-size:30px}.section-copy>p:last-child{margin:0;font-size:8px}.process{gap:8px;margin-top:12px}.process-list{gap:2px}.process-row{padding:6px 3px;grid-template-columns:17px 1fr;gap:3px}.step-no{font-size:8px}.process-row strong{font-size:8px}.process-row small{display:none}.start-ai{margin:6px 0 0;min-width:115px;padding:7px;font-size:8px}.preview-window{min-height:260px}.window-bar{height:29px;font-size:7px}.preview-body{padding:17px}.preview-body h3{margin:7px 0 12px;font-size:16px}.input-look{padding:8px}.input-look p{font-size:8px}.chips{margin-top:7px}.chips span{padding:3px 5px;font-size:6px}.fake-button{margin-top:10px;padding:6px;font-size:7px}.line{height:4px;margin:7px 0}.outline-row{padding:7px 0;font-size:7px}.script-body>b{font-size:7px}.script-body p{font-size:8px}.ranking-section{padding:75px 17px 53px}.ranking-head{margin-bottom:11px}.ranking-head h2{margin:10px 0 6px;font-size:35px}.ranking-head>div:first-child>p:last-child{max-width:250px;margin:0;font-size:8px}.quote{display:none}.works-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.work-card:nth-child(n+5){display:none}.cover{height:clamp(116px,20vh,166px)}.cover>b{top:6px;left:7px;font-size:10px}.cover-word{font-size:73px}.cover>div{left:8px;bottom:8px}.cover small{font-size:6px}.cover h3{font-size:12px}.work-desc{padding:6px 7px}.work-desc>p{height:25px;font-size:7px}.work-desc>div{margin-top:5px;font-size:6px}.ranking-state{min-height:155px;font-size:8px}.ranking-foot{margin-top:10px;font-size:7px}.ranking-foot button{font-size:7px}.end-section{min-height:84svh}.end-copy h2{margin:16px 0 8px;font-size:36px}.end-copy>p:not(.eyebrow){font-size:8px}.end-section footer{height:35px;padding:0 12px;font-size:6px}.end-section footer a{font-size:10px}.section-dots{right:4px;gap:6px}.section-dots button{width:11px;height:11px}.section-dots button.active i{width:7px;height:7px}}
@media(prefers-reduced-motion:reduce){.landing{scroll-behavior:auto}.gold-button,.process-row,.work-card{transition:none}.preview-body{animation:none}}



</style>
<style scoped>
/* 明亮主题：暖白纸感底色，青绿作为创作主色，琥珀色强调行动入口。 */
.creator-home{--bg:#f7faf6;--bg-soft:#eef5ef;--fg:#203b35;--muted:#687d75;--teal:#168d78;--gold:#d99526;background:var(--bg);color:var(--fg)}
.home-nav{border-bottom-color:#dfe9e2;background:linear-gradient(#ffffffed,#ffffffb8);box-shadow:0 5px 24px #2246380a}
.brand{color:#203b35}.brand-seal{border-color:#d9952680;color:#b97916}.brand small{color:#70847b}
.home-nav nav a{color:#637870}.home-nav nav a:hover,.home-nav nav a[aria-current=page]{color:#197c6c}.home-nav nav a[aria-current=page]:after{background:#e7a83b}
.nav-caption{color:#526b62}.nav-caption i,.editable i{background:#27a88e;box-shadow:0 0 8px #27a88e66}.login{color:#167d6b}.landing{background:#f7faf6}.screen{color:#203b35}
.hero{background:radial-gradient(ellipse at 78% 44%,#47b99b24,transparent 36%),radial-gradient(ellipse at 13% 84%,#f2bd6730,transparent 39%),linear-gradient(135deg,#fbfdf9,#f1f7f1)}
.hero-grid{opacity:.18;background-image:linear-gradient(#277b6510 1px,transparent 1px),linear-gradient(90deg,#277b6510 1px,transparent 1px)}.hero-glow{background:radial-gradient(circle,#7cd6bd36,transparent 68%)}
.eyebrow{color:#168d78}.eyebrow i{background:#e7a83b}.hero h1,.section-copy h2,.ranking-head h2,.end-copy h2{color:#203b35}.hero h1 em,.section-copy h2 em,.ranking-head h2 em,.end-copy h2 em{color:#c17f1d}
.lead{color:#5f746c}.gold-button{border-color:#d99a31;background:linear-gradient(115deg,#f1bd5b,#f8d889);color:#3d321e;box-shadow:0 8px 22px #d99a3124}.gold-button:hover{box-shadow:0 12px 28px #d99a3140}.hero .actions .gold-button{min-width:232px;min-height:66px;padding:18px 24px;border:2px solid #d28a19;border-radius:8px;background:linear-gradient(115deg,#f2b843,#ffdf8b);color:#352710;font-size:18px;font-weight:750;box-shadow:0 13px 30px #d99a3152,0 0 0 5px #e6ab3526}.hero .actions .gold-button b{font-size:22px}.hero .actions .gold-button:hover{box-shadow:0 16px 36px #d99a3170,0 0 0 7px #e6ab3533}
.text-button{color:#49645b}.text-button b{color:#168d78}.caption{color:#71847b}.hero-visual .orbit{border-color:#258b741a}.hero-visual .orbit-b{border-color:#d89a3024}
.folio{border-color:#dce8df;background:linear-gradient(145deg,#fff,#f2f7f2);box-shadow:18px 25px 58px #345b451c}.folio:after{border-color:#d9a34370}.folio-top{color:#5d7168}.editable{color:#168d78}
.gold-rule{background:linear-gradient(90deg,#e5ac48,#d9e5dc)}.folio small{color:#a56d17}.folio h2{color:#25443a}.folio>p{color:#6e8178}.folio-line{background:#dce7df}.folio-steps{color:#75857e}.folio-steps b{color:#13806e}.folio-steps span:nth-child(2),.folio-steps span:nth-child(4){color:#cc8b26}
.float-note{border-color:#dbe7df;background:#fff;box-shadow:0 10px 28px #3156421a;color:#c58a29}.float-note span{color:#526a60}.visual-index{color:#84948c}.scroll-cue{color:#6e8178}.scroll-cue i{background:linear-gradient(#d99a31,transparent)}
.ai-section{background:radial-gradient(ellipse at 82% 49%,#54b99c20,transparent 43%),linear-gradient(135deg,#eff7f1,#f8faf5)}.section-copy>p:last-child{color:#62766e}.process-row{color:#203b35}
.process-row.selected{border-color:#6bb9a34f;background:linear-gradient(100deg,#dff2e9,#f7f8ed)}.step-no{color:#168d78}.process-row small{color:#6c8077}.process-row>i{color:#c58a29}
.preview-window{border-color:#d8e5dc;background:#fff;box-shadow:0 22px 55px #345b4518}.preview-window:after{border-color:#e6bd6c45}.window-bar{border-bottom-color:#e4ece6;background:#f5f9f5;color:#6c7f76}.window-bar>b{color:#13806e}
.window-dots i{background:#e58c72}.window-dots i:nth-child(2){background:#e8b84f}.window-dots i:nth-child(3){background:#63ad85}.preview-body>small{color:#a56d17}.preview-body h3{color:#25443a}
.input-look{border-color:#dfe9e2;background:#f9fbf8}.input-look label{color:#7d6b4c}.input-look p{color:#52675e}.chips span{border-color:#dce8df;background:#f7faf7;color:#587067}.fake-button{background:linear-gradient(90deg,#168d78,#2ba88d);color:#fff}
.line{background:#e6eee8}.line.wide{background:#9ccdb9}.outline-row{border-bottom-color:#e4ece6;color:#50665c}.outline-row b{color:#a56d17}.script-body>b{color:#98701f}.script-body p{color:#52685e}.script-body .dialogue{color:#16806d}
.ranking-section{background:radial-gradient(ellipse at 10% 48%,#efc66d20,transparent 40%),linear-gradient(135deg,#fbfcf8,#f2f7f1)}.ranking-head>div:first-child>p:last-child{color:#61756c}.quote{border-left-color:#d7a345}.quote>b{color:#d39a37}.quote p{color:#405b50}.quote small{color:#7a8b82}
.work-card{border-color:#dce7df;background:#fff;box-shadow:0 9px 25px #3156420c}.work-card:hover{border-color:#d5a04699;box-shadow:0 14px 30px #31564219}.cover{background:linear-gradient(145deg,#77b8a2,#397c70 58%,#d1a65b)}
.work-card:nth-child(3n+2) .cover:not(.photo){background-image:linear-gradient(145deg,#d68e73,#9b625e 58%,#e0b66a)}.work-card:nth-child(3n) .cover:not(.photo){background-image:linear-gradient(145deg,#7998be,#4a728b 58%,#c9a365)}
.cover-word{color:#fff5d75c}.cover small{color:#ffe5a6}.cover h3{color:#fff}.work-desc>p{color:#566d63}.work-desc>div{color:#75877e}
.ranking-state{color:#647970}.ranking-state button{border-color:#bbd2c4;background:#fff;color:#167d6b;cursor:pointer}.spinner{border-color:#d7e4db;border-top-color:#d99a31}.ranking-foot{color:#71847b}.ranking-foot button{color:#167d6b}
.end-section{background:radial-gradient(ellipse at center,#71c7aa28,transparent 52%),linear-gradient(135deg,#edf7f0,#fbfaf3)}.end-halo{background:radial-gradient(circle,#edc87933,transparent 69%)}.end-copy>p:not(.eyebrow){color:#61766d}.end-copy>small{color:#71847b}
.end-section footer{border-top-color:#dce8df;background:#f7faf6;color:#71847b}.end-section footer a{color:#16806d}.section-dots i{background:#a8b8ae}.section-dots button.active i{background:#d99a31;box-shadow:0 0 9px #d99a3166}
.home-nav{height:76px}.home-nav nav a{font-size:15px}.nav-caption{font-size:12px}.login{font-size:13px}
.screen{padding-top:104px;padding-bottom:78px}.hero-inner{width:min(1380px,100%);grid-template-columns:1.02fr .98fr;gap:3vw}.eyebrow{font-size:12px}.hero h1{font-size:clamp(54px,6vw,84px)}.lead{max-width:570px;font-size:17px;line-height:1.9}.actions{margin-top:34px}.gold-button{min-width:174px;padding:15px 19px;font-size:15px}.text-button{font-size:14px}.caption{margin-top:32px;font-size:12px}
.hero-visual{min-height:540px}.orbit-a{width:min(570px,45vw)}.orbit-b{width:min(700px,56vw)}.folio{width:min(430px,82%);min-height:400px;padding:32px}.folio-top{font-size:12px}.editable{font-size:11px}.folio small{font-size:11px}.folio h2{font-size:32px}.folio>p{font-size:12px}.folio-steps{font-size:11px}.float-note{padding:12px 16px}.float-note span{font-size:11px}.visual-index{font-size:10px}.scroll-cue{font-size:11px}
.ai-layout{width:min(1320px,100%);grid-template-columns:.75fr 1.25fr;gap:4vw}.section-copy h2{font-size:clamp(42px,4.5vw,64px)}.section-copy>p:last-child{font-size:15px;line-height:1.8}.process{grid-template-columns:minmax(220px,.75fr) minmax(390px,1.25fr);gap:24px}.process-row{padding:17px 13px;grid-template-columns:38px 1fr 16px}.step-no{font-size:17px}.process-row strong{font-size:17px}.process-row small{font-size:12px}.start-ai{min-width:180px;margin-top:18px}.preview-window{min-height:450px}.window-bar{height:43px;font-size:11px}.preview-body{max-width:520px;padding:40px}.preview-body>small,.input-look label{font-size:11px}.preview-body h3{font-size:27px}.input-look{padding:17px}.input-look p{font-size:13px}.chips span{padding:6px 10px;font-size:10px}.fake-button{padding:11px;font-size:11px}.outline-row{padding:13px 0;font-size:12px}.script-body>b{font-size:12px}.script-body p{font-size:14px}
.ranking-wrap{width:min(1320px,100%)}.ranking-head h2{font-size:clamp(46px,5vw,68px)}.ranking-head>div:first-child>p:last-child{font-size:14px;line-height:1.8}.quote{width:230px}.quote p{font-size:18px}.quote small{font-size:11px}.works-grid{gap:20px}.cover{height:clamp(230px,31vh,330px)}.cover>b{top:14px;left:16px;font-size:18px}.cover small{font-size:11px}.cover h3{font-size:23px}.work-desc{padding:15px 17px}.work-desc>p{height:48px;font-size:13px;line-height:1.8}.work-desc>div{margin-top:11px;font-size:12px}.ranking-state{min-height:250px;font-size:14px}.ranking-state button,.ranking-foot button{font-size:12px}.ranking-foot{font-size:12px}.ranking-foot b{font-size:17px}.work-card{cursor:pointer}.work-card:focus-visible{outline:3px solid #168d78;outline-offset:3px}.cover-cta{position:absolute;right:12px;bottom:12px;padding:7px 10px;border:1px solid #ffffff99;border-radius:20px;background:#143f36a6;color:white;font-size:11px;opacity:0;transform:translateY(5px);transition:.18s}.work-card:hover .cover-cta,.work-card:focus-visible .cover-cta{opacity:1;transform:translateY(0)}
.end-copy h2{font-size:clamp(52px,6vw,78px)}.end-copy>p:not(.eyebrow){font-size:15px}.end-copy>small{font-size:11px}.end-section footer{font-size:11px}.end-section footer a{font-size:16px}
.work-modal-backdrop{position:fixed;z-index:20;inset:0;display:grid;place-items:center;padding:26px;background:#213c33a6;backdrop-filter:blur(5px)}.work-modal{width:min(1120px,96vw);max-height:min(86vh,900px);display:flex;flex-direction:column;overflow:hidden;border:1px solid #d8e6dc;border-radius:18px;background:#f9fcf8;color:#203b35;box-shadow:0 30px 100px #10282055}.work-modal-head{display:flex;align-items:center;justify-content:space-between;padding:20px 26px;border-bottom:1px solid #e0e9e2;background:#fff}.work-modal-head small,.reading-head small{color:#b17a1c;font-size:12px;letter-spacing:.1em}.work-modal-head h2{margin:4px 0 0;font-size:24px}.modal-close{width:38px;height:38px;border:1px solid #dce8df;border-radius:50%;background:#fff;color:#45635a;font-size:25px;cursor:pointer}.work-modal-body{min-height:0;display:grid;grid-template-columns:300px 1fr;overflow:auto}.work-modal-info{padding:23px;border-right:1px solid #e0e9e2;background:#f3f8f3}.modal-cover{height:310px;display:flex;flex-direction:column;justify-content:end;gap:8px;padding:18px;border-radius:11px;background:linear-gradient(145deg,#82b9a4,#397c70 58%,#dbad5a);background-size:cover;background-position:center;color:white}.modal-cover span{font-size:13px}.modal-cover b{font-size:23px}.work-modal-info h3{margin:20px 0 8px;font-size:16px}.work-modal-info>p{margin:0;color:#5c7168;font-size:14px;line-height:1.9;white-space:pre-wrap}.work-modal-info dl{margin:16px 0}.work-modal-info dl div{display:flex;gap:12px;padding:7px 0;border-bottom:1px solid #e1eae3;font-size:13px}.work-modal-info dt{color:#7b8c83}.work-modal-info dd{margin:0;color:#405a50}.modal-create{width:100%;padding:12px 15px;border:0;border-radius:8px;background:#168d78;color:#fff;font-size:14px;cursor:pointer}.modal-create b{margin-left:10px}.work-modal-reading{min-width:0;padding:24px}.reading-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:17px}.reading-head h3{margin:4px 0 0;font-size:20px}.reading-head>span{color:#6d8077;font-size:12px}.chapter-preview-layout{min-height:470px;display:grid;grid-template-columns:210px 1fr;border:1px solid #e0e9e2;border-radius:12px;background:#fff;overflow:hidden}.chapter-list{padding:9px;border-right:1px solid #e2eae4;background:#f5f9f5;overflow:auto}.chapter-list button{width:100%;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:11px 9px;border:0;border-radius:7px;background:transparent;color:#52695f;text-align:left;font-size:13px;cursor:pointer}.chapter-list button.selected,.chapter-list button:hover{background:#e4f3e9;color:#147764}.chapter-list button span{color:#9aa79f;font-size:11px;white-space:nowrap}.chapter-content{padding:25px 30px;overflow:auto}.chapter-content h4{margin:0 0 16px;font-size:21px}.chapter-content>p{margin:0;color:#334d43;font:16px/2 Georgia,"Microsoft YaHei",serif;white-space:pre-wrap}.preview-limit{margin-top:24px;padding-top:12px;border-top:1px dashed #dce8df;color:#8b9a91;font-size:12px}.modal-state{min-height:200px;display:grid;place-items:center;color:#71847b;font-size:14px}.modal-state.error{color:#ad6556}.chapter-content .modal-state{min-height:420px}
@media(max-width:980px){.hero-inner{grid-template-columns:1fr}.hero-visual{min-height:410px}.ai-layout{grid-template-columns:1fr}.section-copy>p:last-child{max-width:600px}.work-modal-body{grid-template-columns:240px 1fr}.modal-cover{height:260px}.process{grid-template-columns:220px 1fr}}
@media(max-width:620px){.home-nav{height:62px;padding:0 12px;grid-template-columns:auto 1fr}.brand-seal{width:27px;height:27px;font-size:14px}.brand b{font-size:12px}.brand small{font-size:8px}.home-nav nav{justify-content:center;gap:13px}.home-nav nav a{font-size:11px}.nav-end{display:none}.screen{padding:78px 16px 52px}.hero h1{font-size:clamp(38px,10vw,52px)}.lead{font-size:14px}.hero-visual{min-height:330px}.folio{width:min(300px,82%);min-height:285px;padding:20px}.folio h2{font-size:23px}.folio-top{font-size:9px}.folio small,.folio>p{font-size:9px}.folio-steps{font-size:8px}.float-note{padding:8px 10px}.float-note span{font-size:9px}.caption{font-size:10px}.ai-layout{display:block}.section-copy h2{font-size:34px}.section-copy>p:last-child{font-size:13px}.process{display:flex;flex-direction:column;align-items:stretch;gap:12px;margin-top:18px}.process-list{grid-template-columns:repeat(3,1fr);gap:4px}.process-row{grid-template-columns:22px 1fr;gap:4px;padding:10px 6px}.step-no{font-size:11px}.process-row strong{font-size:11px}.process-row small{display:none}.start-ai{grid-column:1/-1;margin:8px 0 0;min-width:135px}.preview-window{min-height:310px}.preview-body{padding:22px}.preview-body h3{font-size:20px}.input-look p{font-size:11px}.chips span{font-size:8px}.outline-row{font-size:10px}.script-body p{font-size:11px}.ranking-section{padding:76px 16px 52px}.ranking-head h2{font-size:40px}.ranking-head>div:first-child>p:last-child{font-size:12px}.quote{display:none}.works-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.work-card:nth-child(n+5){display:none}.cover{height:clamp(145px,22vh,205px)}.cover small{font-size:8px}.cover h3{font-size:15px}.work-desc{padding:8px}.work-desc>p{height:38px;font-size:10px}.work-desc>div{font-size:9px}.cover-cta{right:6px;bottom:6px;padding:5px 7px;font-size:8px;opacity:1;transform:none}.ranking-foot{font-size:10px}.end-copy h2{font-size:42px}.end-copy>p:not(.eyebrow){font-size:13px}.work-modal-backdrop{padding:8px}.work-modal{width:100%;max-height:92vh;border-radius:12px}.work-modal-head{padding:13px 15px}.work-modal-head h2{font-size:18px}.work-modal-body{display:flex;flex-direction:column}.work-modal-info{display:grid;grid-template-columns:100px 1fr;column-gap:13px;padding:13px;border-right:0;border-bottom:1px solid #e0e9e2}.modal-cover{height:130px;grid-row:span 3;padding:9px}.modal-cover b{font-size:14px}.modal-cover span{font-size:10px}.work-modal-info h3{margin:0 0 5px}.work-modal-info>p{font-size:11px;line-height:1.6}.work-modal-info dl{display:none}.modal-create{grid-column:2;padding:8px;font-size:12px}.work-modal-reading{padding:14px}.reading-head h3{font-size:16px}.chapter-preview-layout{min-height:380px;grid-template-columns:130px 1fr}.chapter-list{padding:5px}.chapter-list button{padding:9px 5px;font-size:10px}.chapter-list button span{font-size:9px}.chapter-content{padding:16px}.chapter-content h4{font-size:16px}.chapter-content>p{font-size:13px}.chapter-content .modal-state{min-height:300px}.modal-state{font-size:12px}}
@media(max-width:620px){.hero .actions{gap:10px}.hero .actions .gold-button{min-width:174px;min-height:56px;padding:14px 16px;font-size:15px}.hero .actions .gold-button b{font-size:18px}}
.creator-home .topbar .brand{display:flex;align-items:baseline;gap:9px;width:auto;color:var(--ink);text-decoration:none;font-family:var(--serif);background:none;border:0;padding:0;flex:none}
.creator-home .topbar .brand b{display:inline;font:600 19px var(--serif);letter-spacing:.06em}
.creator-home .topbar .brand span{font-family:var(--sans);font-size:13px;color:var(--ink-3);letter-spacing:.14em}
.creator-home .topbar-login{padding:6px 14px;border:1px solid var(--rule-2);border-radius:var(--radius);background:transparent;color:var(--indigo);font-size:13px;transition:background .15s,color .15s}
.creator-home .topbar-login:hover{background:var(--indigo-wash);color:var(--ink)}

</style>
