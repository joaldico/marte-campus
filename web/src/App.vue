<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { NConfigProvider, NLayout, NLayoutContent, NLayoutHeader } from 'naive-ui'
import type { PublicUser } from './api/auth'
import { ensureSession } from './auth/session'

const route = useRoute()
const showHeader = computed(() => Boolean(route.meta.requiresAuth))
const user = ref<PublicUser | null>(null)
const isAdmin = computed(() => user.value?.role === 'admin')

watch(
  showHeader,
  async (show) => {
    if (!show) {
      user.value = null
      return
    }
    user.value = await ensureSession()
  },
  { immediate: true },
)
</script>

<template>
  <n-config-provider>
    <n-layout>
      <n-layout-header v-if="showHeader" bordered class="header">
        <img src="/logo.png" alt="Campus Marte" class="logo" />
        <nav class="nav">
          <router-link :to="{ name: 'catalog' }">Catálogo</router-link>
          <router-link v-if="isAdmin" :to="{ name: 'admin-courses' }">
            Cursos
          </router-link>
          <router-link v-if="isAdmin" :to="{ name: 'admin-heatmap' }">
            Mapa de calor
          </router-link>
        </nav>
      </n-layout-header>
      <n-layout-content class="content">
        <router-view />
      </n-layout-content>
    </n-layout>
  </n-config-provider>
</template>

<style scoped>
.header {
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 12px 24px;
}

.logo {
  height: 48px;
  width: auto;
}

.nav {
  display: flex;
  gap: 16px;
}

.nav a {
  color: inherit;
  text-decoration: none;
}

.nav a.router-link-active {
  font-weight: 600;
}

.content {
  padding: 24px;
}
</style>
