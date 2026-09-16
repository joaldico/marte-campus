<script setup lang="ts">
import {
  NAlert,
  NButton,
  NCard,
  NEmpty,
  NGrid,
  NGridItem,
  NProgress,
  NSpin,
  NTag,
  NText,
} from 'naive-ui'
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { enrollCourse, listCourses, type CatalogCourse } from '../api/catalog'

const router = useRouter()
const courses = ref<CatalogCourse[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const enrollingId = ref<string | null>(null)

onMounted(async () => {
  try {
    courses.value = await listCourses()
  } catch {
    error.value = 'No se pudo cargar el catálogo.'
  } finally {
    loading.value = false
  }
})

function progressPercentage(averageRatio: number): number {
  return Math.round(averageRatio * 100)
}

function openCourse(course: CatalogCourse): void {
  if (!course.enrolled) {
    return
  }
  void router.push({ name: 'course', params: { id: course.id } })
}

async function enroll(course: CatalogCourse): Promise<void> {
  if (enrollingId.value) {
    return
  }
  enrollingId.value = course.id
  error.value = null
  try {
    await enrollCourse(course.id)
    await router.push({ name: 'course', params: { id: course.id } })
  } catch {
    error.value = 'No se pudo completar la inscripción. Inténtalo de nuevo.'
  } finally {
    enrollingId.value = null
  }
}
</script>

<template>
  <div class="page">
    <header class="hero">
      <div>
        <n-text depth="3">Cursos publicados</n-text>
        <n-text tag="h1" class="title">Catálogo</n-text>
        <n-text class="lead">
          Solo ves lo publicado. El progreso aparece cuando estás apuntado.
        </n-text>
      </div>
    </header>

    <n-alert
      v-if="error"
      type="error"
      class="alert"
      :title="error"
      :bordered="false"
    />

    <n-spin :show="loading">
      <n-empty
        v-if="!loading && !courses.length && !error"
        description="No hay cursos publicados."
      />
      <n-grid v-else cols="1 720:2 1100:3" :x-gap="18" :y-gap="18">
        <n-grid-item v-for="course in courses" :key="course.id">
          <n-card
            :hoverable="course.enrolled"
            class="course-card"
            :class="{ clickable: course.enrolled }"
            @click="openCourse(course)"
          >
            <div class="cover" />
            <div class="card-body">
              <div class="card-top">
                <n-text tag="h2">{{ course.title }}</n-text>
                <n-tag size="small" :type="course.enrolled ? 'success' : 'default'">
                  {{ course.enrolled ? 'Inscrito' : 'Disponible' }}
                </n-tag>
              </div>
              <template v-if="course.progress">
                <n-progress
                  type="line"
                  :percentage="progressPercentage(course.progress.averageRatio)"
                  :show-indicator="false"
                  processing
                />
                <n-text depth="3" class="caption">
                  {{ course.progress.completedCount }} de
                  {{ course.progress.totalCount }} capítulos al 90 %
                </n-text>
              </template>
              <n-text v-else depth="3" class="caption">
                Apúntate para ver el progreso de tus capítulos.
              </n-text>
              <n-button
                v-if="course.enrolled"
                block
                @click.stop="openCourse(course)"
              >
                Abrir curso
              </n-button>
              <n-button
                v-else
                type="primary"
                block
                :loading="enrollingId === course.id"
                :disabled="Boolean(enrollingId)"
                @click.stop="enroll(course)"
              >
                Apuntarme
              </n-button>
            </div>
          </n-card>
        </n-grid-item>
      </n-grid>
    </n-spin>
  </div>
</template>

<style scoped>
.page {
  width: min(1120px, 100%);
  margin: 0 auto;
}

.hero {
  margin-bottom: 28px;
}

.title {
  display: block;
  margin: 4px 0 8px;
  font-size: 2rem;
  font-weight: 700;
}

.lead,
.caption {
  display: block;
  color: rgba(148, 163, 184, 0.95);
}

.alert {
  margin-bottom: 16px;
}

.course-card.clickable {
  cursor: pointer;
}

.cover {
  height: 92px;
  margin: -20px -20px 16px;
  background:
    linear-gradient(135deg, rgba(34, 211, 238, 0.35), rgba(139, 92, 246, 0.45)),
    repeating-linear-gradient(
      -24deg,
      transparent,
      transparent 10px,
      rgba(7, 11, 22, 0.12) 10px,
      rgba(7, 11, 22, 0.12) 11px
    );
}

.card-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.card-top {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}

.card-top h2 {
  margin: 0;
  font-size: 1.15rem;
}
</style>
