import { createRouter, createWebHistory } from 'vue-router'
import { getToken, safeRedirect } from './auth.js'
import { portal } from './portal.js'
const workChildren = [
  { path: '', component: () => import('./views/works/index.vue'), meta: { title: '我的作品' } },
  { path: 'create', component: () => import('./views/works/Create.vue'), meta: { title: '创作上传' } },
  { path: ':id(\\d+)', component: () => import('./views/works/Detail.vue'), meta: { title: '作品详情' } }
]
const router = createRouter({ history: createWebHistory(import.meta.env.BASE_URL), scrollBehavior: () => ({ top: 0 }), routes: [
  { path: '/', redirect: '/works' },
  { path: '/login', component: () => import('./views/Login.vue') },
  { path: '/session', redirect: '/works' },
  { path: '/session-check', component: () => import('./views/Session.vue') },
  { path: '/works', component: () => import('./layout/index.vue'), children: workChildren },
  { path: '/:pathMatch(.*)*', redirect: '/works' }
] })
router.beforeEach(to => {
  document.title = '剧云策 · ' + (to.meta.title || portal.label)
  if (!getToken() && to.path !== '/login') return { path: '/login', query: { redirect: safeRedirect(to.fullPath) } }
  if (getToken() && to.path === '/login') return safeRedirect(to.query.redirect)
})
export default router
