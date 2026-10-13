import { createRouter, createWebHistory } from 'vue-router'
import { getToken, safeRedirect } from './auth.js'
import { portal } from './portal.js'
const router = createRouter({ history: createWebHistory(), routes: [
  { path: '/', redirect: '/session' },
  { path: '/login', component: () => import('./views/Login.vue') },
  { path: '/session', component: () => import('./views/Session.vue') },
  { path: '/session-check', component: () => import('./views/Session.vue') },
  { path: '/:pathMatch(.*)*', redirect: '/session' }
] })
router.beforeEach(to => {
  document.title = '剧云策 · ' + portal.label
  if (!getToken() && to.path !== '/login') return { path: '/login', query: { redirect: safeRedirect(to.fullPath) } }
  if (getToken() && to.path === '/login') return safeRedirect(to.query.redirect)
})
export default router
