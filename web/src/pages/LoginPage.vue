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

const blurb: Record<string, string> = {
  ana: 'Crea cursos, mueve capítulos y recorre solo los estados legales.',
  bruno: 'Inscrito en Paisajes I. Cascada ya suma 10 s únicos.',
  carla: 'Inscrita. Playa retoma en el segundo 10.',
  diego: 'Sin inscribir. Apúntate y el seed de playa cuenta.',
}

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
  return role === 'admin' ? 'Administración' : 'Alumno'
}

async function chooseUser(user: PublicUser): Promise<void> {
  if (loggingInId.value) {
    return
  }
  loggingInId.value = user.id
  error.value = null
  try {
    const session = await loginAs(user.id)
    await router.push(
      session.role === 'admin'
        ? { name: 'admin-courses' }
        : { name: 'catalog' },
    )
  } catch {
    error.value = 'No se pudo iniciar sesión. Inténtalo de nuevo.'
  } finally {
    loggingInId.value = null
  }
}
</script>

<template>
  <div class="login-screen">
    <div class="login-panel">
      <img src="/logo.png" alt="Campus Marte" class="login-logo" />
      <n-text tag="h1" class="title">Campus Marte</n-text>
      <n-text class="lead">
        Elige quién entra. Sin contraseña. El progreso no se calcula en el
        navegador: el servidor une los tramos realmente reproducidos.
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
          cols="1 640:2"
          :x-gap="16"
          :y-gap="16"
        >
          <n-grid-item v-for="user in users" :key="user.id">
            <n-card
              hoverable
              class="user-card"
              :class="{ busy: Boolean(loggingInId) && loggingInId !== user.id }"
              @click="chooseUser(user)"
            >
              <div class="user-row">
                <div class="glyph">{{ user.name.slice(0, 1) }}</div>
                <div>
                  <strong>{{ user.name }}</strong>
                  <n-tag
                    size="small"
                    :type="user.role === 'admin' ? 'warning' : 'info'"
                    class="role"
                  >
                    {{ roleLabel(user.role) }}
                  </n-tag>
                  <p>{{ blurb[user.id] ?? 'Entrar al campus.' }}</p>
                </div>
              </div>
            </n-card>
          </n-grid-item>
        </n-grid>
        <n-text v-else-if="!loading && !error" depth="3">
          No hay usuarios disponibles.
        </n-text>
      </n-spin>
    </div>
  </div>
</template>

<style scoped>
.login-screen {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 32px 20px;
  background:
    radial-gradient(900px 420px at 15% 0%, rgba(34, 211, 238, 0.2), transparent 55%),
    radial-gradient(800px 380px at 90% 10%, rgba(139, 92, 246, 0.22), transparent 50%),
    #070b16;
}

.login-panel {
  width: min(860px, 100%);
}

.login-logo {
  display: block;
  height: 88px;
  width: auto;
  margin-bottom: 18px;
  border-radius: 16px;
}

.title {
  display: block;
  margin: 0 0 8px;
  font-size: 2.1rem;
  font-weight: 700;
}

.lead {
  display: block;
  max-width: 560px;
  margin-bottom: 28px;
  color: rgba(226, 232, 240, 0.78);
}

.alert {
  margin-bottom: 16px;
}

.user-card {
  cursor: pointer;
}

.user-card.busy {
  pointer-events: none;
  opacity: 0.55;
}

.user-row {
  display: flex;
  gap: 14px;
  align-items: flex-start;
}

.glyph {
  flex: none;
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  border-radius: 12px;
  background: linear-gradient(135deg, #22d3ee, #8b5cf6);
  color: #070b16;
  font-weight: 700;
}

.role {
  margin-left: 8px;
  vertical-align: middle;
}

.user-row p {
  margin: 8px 0 0;
  color: rgba(148, 163, 184, 0.95);
  font-size: 13px;
}
</style>
