import { createRouter, createWebHistory } from 'vue-router'
import { getToken, safeRedirect } from './auth.js'
import { portal } from './portal.js'
const workChildren = [
  { path: '', component: () => import('./views/works/index.vue'), meta: { title: '我的作品' } },
  { path: 'create', component: () => import('./views/works/Create.vue'), meta: { title: '创作上传', editor: true } },
  // v3 起稿（Screen 1：作品设定）与资料确认（Screen 2：AI Story Blueprint）。
  { path: 'create/ai', component: () => import('./views/works/ai/AiCreate.vue'), meta: { title: 'AI 起稿', editor: true, ai: true } },
  { path: 'create/ai/blueprint', component: () => import('./views/works/ai/BlueprintConfirm.vue'), meta: { title: '资料确认', editor: true, ai: true } },
  { path: ':id(\\d+)', component: () => import('./views/works/Detail.vue'), meta: { title: '作品详情' } },
  // v3 创作者工作台（Screen 3）：query view/chapter/tab 决定视图与章节。
  { path: ':id(\\d+)/studio', component: () => import('./views/works/studio/Studio.vue'), meta: { title: '创作工作台', editor: true, studio: true } }
]
// 任务广场与工作台平级：同一 layout 下另起一条顶级路由，创作端只接单，不含发布入口。
const demandChildren = [
  { path: '', component: () => import('./views/demand/Square.vue'), meta: { title: '任务广场' } },
  { path: 'mine', component: () => import('./views/demand/MyTasks.vue'), meta: { title: '我的任务', requiresAuth: true } },
  { path: ':id(\\d+)', component: () => import('./views/demand/Detail.vue'), meta: { title: '任务详情', requiresAuth: true } }
]
const router = createRouter({ history: createWebHistory(import.meta.env.BASE_URL), scrollBehavior: () => ({ top: 0 }), routes: [
  { path: '/', component: () => import('./views/Home.vue'), meta: { title: '首页', public: true } },
  { path: '/login', component: () => import('./views/Login.vue') },
  { path: '/session', redirect: '/works' },
  { path: '/session-check', component: () => import('./views/Session.vue') },
  { path: '/works', component: () => import('./layout/index.vue'), children: workChildren },
  { path: '/demand', component: () => import('./views/demand/Entry.vue'), meta: { title: '任务广场', public: true }, children: [
    { path: '', component: () => import('./layout/index.vue'), children: demandChildren }
  ] },
  { path: '/:pathMatch(.*)*', redirect: '/works' }
] })
router.beforeEach(to => {
  document.title = '剧云策 · ' + (to.meta.title || portal.label)
  if (!getToken() && to.path !== '/login' && (!to.meta.public || to.meta.requiresAuth)) return { path: '/login', query: { redirect: safeRedirect(to.fullPath) } }
  if (getToken() && to.path === '/login') return safeRedirect(to.query.redirect)
})
export default router
