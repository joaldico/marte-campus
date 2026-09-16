<script setup lang="ts">
import { NAlert, NCard, NGrid, NGridItem, NSpin, NTag, NText } from 'naive-ui'
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { listUsers, type PublicUser } from '../api/auth'
import { loginAs } from '../auth/session'

const router = useRouter()
const users = ref<PublicUser[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const loggingInId = ref<string | null>(null)

onMounted(async () => {
  try {
    users.value = await listUsers()
  } catch {
    error.value = 'No se pudo cargar la lista de usuarios.'
  } finally {
    loading.value = false
  }
})

function roleLabel(role: PublicUser['role']): string {
  return role === 'admin' ? 'Administradora' : 'Alumno'
}

async function chooseUser(user: PublicUser): Promise<void> {
  if (loggingInId.value) {
    return
  }
  loggingInId.value = user.id
  error.value = null
  try {
    await loginAs(user.id)
    await router.push({ name: 'catalog' })
  } catch {
    error.value = 'No se pudo iniciar sesión. Inténtalo de nuevo.'
  } finally {
    loggingInId.value = null
  }
}
</script>

<template>
  <div class="login">
    <img src="/logo.png" alt="Campus Marte" class="login-logo" />
    <n-text tag="h1" class="title">Campus Marte</n-text>
    <n-text depth="2" class="lead">
      Elige un usuario para entrar. No hace falta contraseña.
    </n-text>

    <n-alert
      v-if="error"
      type="error"
      class="alert"
      :title="error"
      :bordered="false"
    />

    <n-spin :show="loading">
      <n-grid
        v-if="users.length"
        cols="1 600:2 960:4"
        :x-gap="16"
        :y-gap="16"
      >
        <n-grid-item v-for="user in users" :key="user.id">
          <n-card
            hoverable
            class="user-card"
            :class="{ busy: Boolean(loggingInId) && loggingInId !== user.id }"
            :title="user.name"
            @click="chooseUser(user)"
          >
            <n-tag
              size="small"
              :type="user.role === 'admin' ? 'warning' : 'info'"
            >
              {{ roleLabel(user.role) }}
            </n-tag>
          </n-card>
        </n-grid-item>
      </n-grid>
      <n-text v-else-if="!loading && !error" depth="3">
        No hay usuarios disponibles.
      </n-text>
    </n-spin>
  </div>
</template>

<style scoped>
.login {
  max-width: 960px;
  margin: 0 auto;
}

.login-logo {
  display: block;
  height: 72px;
  width: auto;
  margin-bottom: 16px;
}

.title {
  display: block;
  margin: 0 0 8px;
  font-size: 1.5rem;
}

.lead {
  display: block;
  margin-bottom: 24px;
}

.alert {
  margin-bottom: 16px;
}

.user-card {
  cursor: pointer;
}

.user-card.busy {
  pointer-events: none;
  opacity: 0.6;
}
</style>
