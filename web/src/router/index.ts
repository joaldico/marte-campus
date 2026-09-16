import { createRouter, createWebHistory } from 'vue-router'
import { ensureSession } from '../auth/session'
import CatalogPage from '../pages/CatalogPage.vue'
import LoginPage from '../pages/LoginPage.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'login',
      component: LoginPage,
    },
    {
      path: '/catalogo',
      name: 'catalog',
      component: CatalogPage,
      meta: { requiresAuth: true },
    },
  ],
})

router.beforeEach(async (to) => {
  if (!to.meta.requiresAuth) {
    return true
  }
  const user = await ensureSession()
  if (!user) {
    return { name: 'login' }
  }
  return true
})

export default router
