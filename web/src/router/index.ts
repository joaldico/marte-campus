import { createRouter, createWebHistory } from 'vue-router'
import { ensureSession } from '../auth/session'
import AdminCourseDetailPage from '../pages/admin/AdminCourseDetailPage.vue'
import AdminCoursesPage from '../pages/admin/AdminCoursesPage.vue'
import CatalogPage from '../pages/CatalogPage.vue'
import CoursePage from '../pages/CoursePage.vue'
import LoginPage from '../pages/LoginPage.vue'
import PlayerPage from '../pages/PlayerPage.vue'

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
    {
      path: '/catalogo/:id',
      name: 'course',
      component: CoursePage,
      meta: { requiresAuth: true },
    },
    {
      path: '/reproductor/:chapterId',
      name: 'player',
      component: PlayerPage,
      meta: { requiresAuth: true },
    },
    {
      path: '/admin/cursos',
      name: 'admin-courses',
      component: AdminCoursesPage,
      meta: { requiresAuth: true, requiresAdmin: true },
    },
    {
      path: '/admin/cursos/:id',
      name: 'admin-course',
      component: AdminCourseDetailPage,
      meta: { requiresAuth: true, requiresAdmin: true },
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
  if (to.meta.requiresAdmin && user.role !== 'admin') {
    return { name: 'catalog' }
  }
  return true
})

export default router
