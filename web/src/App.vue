<script setup lang="ts">
import {
  BookOutline,
  FlameOutline,
  LogOutOutline,
  PersonCircleOutline,
  StatsChartOutline,
} from '@vicons/ionicons5'
import {
  NAvatar,
  NButton,
  NConfigProvider,
  NDialogProvider,
  NDropdown,
  NGlobalStyle,
  NIcon,
  NLayout,
  NLayoutContent,
  NLayoutHeader,
  NMenu,
  darkTheme,
  type MenuOption,
} from 'naive-ui'
import { computed, h, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import type { PublicUser } from './api/auth'
import { ensureSession, logoutSession } from './auth/session'
import { campusTheme } from './theme'

const route = useRoute()
const router = useRouter()
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

const menuOptions = computed<MenuOption[]>(() => {
  const items: MenuOption[] = [
    {
      label: () =>
        h(RouterLink, { to: { name: 'catalog' } }, { default: () => 'Catálogo' }),
      key: 'catalog',
      icon: () => h(NIcon, null, { default: () => h(BookOutline) }),
    },
  ]
  if (isAdmin.value) {
    items.push(
      {
        label: () =>
          h(
            RouterLink,
            { to: { name: 'admin-courses' } },
            { default: () => 'Cursos' },
          ),
        key: 'admin-courses',
        icon: () => h(NIcon, null, { default: () => h(FlameOutline) }),
      },
      {
        label: () =>
          h(
            RouterLink,
            { to: { name: 'admin-heatmap' } },
            { default: () => 'Mapa de calor' },
          ),
        key: 'admin-heatmap',
        icon: () => h(NIcon, null, { default: () => h(StatsChartOutline) }),
      },
    )
  }
  return items
})

const activeMenu = computed(() => {
  const name = String(route.name ?? '')
  if (name === 'course' || name === 'player') {
    return 'catalog'
  }
  if (name === 'admin-course') {
    return 'admin-courses'
  }
  return name
})

const userOptions = [
  {
    label: 'Cerrar sesión',
    key: 'logout',
    icon: () => h(NIcon, null, { default: () => h(LogOutOutline) }),
  },
]

async function onUserSelect(key: string): Promise<void> {
  if (key !== 'logout') {
    return
  }
  await logoutSession()
  user.value = null
  await router.push({ name: 'login' })
}
</script>

<template>
  <n-config-provider :theme="darkTheme" :theme-overrides="campusTheme">
    <n-global-style />
    <n-dialog-provider>
    <n-layout class="shell" :native-scrollbar="false">
      <n-layout-header v-if="showHeader" bordered class="header">
        <div class="brand">
          <img src="/logo.png" alt="Campus Marte" class="logo" />
          <div class="brand-copy">
            <strong>Campus Marte</strong>
            <span>Progreso real, calculado en servidor</span>
          </div>
        </div>
        <n-menu
          mode="horizontal"
          :value="activeMenu"
          :options="menuOptions"
          responsive
        />
        <n-dropdown
          v-if="user"
          trigger="click"
          :options="userOptions"
          @select="onUserSelect"
        >
          <n-button quaternary class="user-chip">
            <template #icon>
              <n-icon :component="PersonCircleOutline" />
            </template>
            <n-avatar round size="small" class="avatar">
              {{ user.name.slice(0, 1) }}
            </n-avatar>
            {{ user.name }}
          </n-button>
        </n-dropdown>
      </n-layout-header>
      <n-layout-content
        :class="showHeader ? 'content' : 'content-flush'"
        :native-scrollbar="false"
      >
        <router-view />
      </n-layout-content>
    </n-layout>
    </n-dialog-provider>
  </n-config-provider>
</template>

<style scoped>
.shell {
  min-height: 100vh;
  background:
    radial-gradient(1200px 500px at 10% -10%, rgba(34, 211, 238, 0.16), transparent 55%),
    radial-gradient(900px 420px at 110% 0%, rgba(139, 92, 246, 0.18), transparent 50%),
    #070b16;
}

.header {
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 10px 28px;
  backdrop-filter: blur(16px);
}

.brand {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 240px;
}

.logo {
  height: 44px;
  width: auto;
  border-radius: 10px;
}

.brand-copy {
  display: flex;
  flex-direction: column;
  line-height: 1.15;
}

.brand-copy span {
  font-size: 12px;
  color: rgba(148, 163, 184, 0.9);
}

.content {
  padding: 28px;
}

.content-flush {
  padding: 0;
}

.user-chip {
  margin-left: auto;
}

.avatar {
  margin-right: 8px;
  background: linear-gradient(135deg, #22d3ee, #8b5cf6);
  color: #070b16;
  font-weight: 700;
}
</style>
