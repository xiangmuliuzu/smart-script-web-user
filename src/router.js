import { createRouter, createWebHistory } from 'vue-router'
import { getToken, safeRedirect } from './auth.js'
import { portal } from './portal.js'
const workChildren = [
  { path: '', component: () => import('./views/works/index.vue'), meta: { title: '我的作品' } },
  { path: 'create', component: () => import('./views/works/Create.vue'), meta: { title: '创作上传' } },
  { path: ':id(\\d+)', component: () => import('./views/works/Detail.vue'), meta: { title: '作品详情' } }
]
// 任务广场与工作台平级：同一 layout 下另起一条顶级路由，创作端只接单，不含发布入口。
const demandChildren = [
  { path: '', component: () => import('./views/demand/Square.vue'), meta: { title: '任务广场' } },
  { path: 'mine', component: () => import('./views/demand/MyTasks.vue'), meta: { title: '我的任务' } },
  { path: ':id(\\d+)', component: () => import('./views/demand/Detail.vue'), meta: { title: '任务详情' } }
]
const router = createRouter({ history: createWebHistory(import.meta.env.BASE_URL), scrollBehavior: () => ({ top: 0 }), routes: [
  { path: '/', redirect: '/works' },
  { path: '/login', component: () => import('./views/Login.vue') },
  { path: '/session', redirect: '/works' },
  { path: '/session-check', component: () => import('./views/Session.vue') },
  { path: '/works', component: () => import('./layout/index.vue'), children: workChildren },
  { path: '/demand', component: () => import('./layout/index.vue'), children: demandChildren },
  { path: '/:pathMatch(.*)*', redirect: '/works' }
] })
router.beforeEach(to => {
  document.title = '剧云策 · ' + (to.meta.title || portal.label)
  if (!getToken() && to.path !== '/login') return { path: '/login', query: { redirect: safeRedirect(to.fullPath) } }
  if (getToken() && to.path === '/login') return safeRedirect(to.query.redirect)
})
export default router
