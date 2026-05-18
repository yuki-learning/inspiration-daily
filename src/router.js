import { createRouter, createWebHashHistory } from 'vue-router'

const routes = [
  { path: '/', redirect: '/reports' },
  { path: '/reports/:date?', name: 'reports', component: () => import('./pages/P2ReportDetail.vue') },
  { path: '/directions', name: 'P3', component: () => import('./pages/P3Directions.vue') },
  { path: '/directions/:id', name: 'P4', component: () => import('./pages/P4DirectionDetail.vue') },
  { path: '/wakeups', name: 'P5', component: () => import('./pages/P5Wakeups.vue') },
  { path: '/new', name: 'P6', component: () => import('./pages/P6Wizard.vue') },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
  scrollBehavior() {
    return { top: 0 }
  }
})

export default router
