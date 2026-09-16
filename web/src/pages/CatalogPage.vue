<script setup lang="ts">
import {
  NAlert,
  NButton,
  NCard,
  NGrid,
  NGridItem,
  NProgress,
  NSpin,
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
  <div class="catalog">
    <n-text tag="h1" class="title">Catálogo</n-text>

    <n-alert
      v-if="error"
      type="error"
      class="alert"
      :title="error"
      :bordered="false"
    />

    <n-spin :show="loading">
      <n-grid
        v-if="courses.length"
        cols="1 600:2 960:3"
        :x-gap="16"
        :y-gap="16"
      >
        <n-grid-item v-for="course in courses" :key="course.id">
          <n-card
            :hoverable="course.enrolled"
            class="course-card"
            :class="{ clickable: course.enrolled }"
            :title="course.title"
            @click="openCourse(course)"
          >
            <template v-if="course.progress">
              <n-progress
                type="line"
                :percentage="progressPercentage(course.progress.averageRatio)"
              />
              <n-text depth="3" class="progress-caption">
                {{ course.progress.completedCount }} de
                {{ course.progress.totalCount }} capítulos vistos
              </n-text>
            </template>
            <n-button
              v-if="course.enrolled"
              class="enroll"
              @click.stop="openCourse(course)"
            >
              Ver curso
            </n-button>
            <n-button
              v-else
              type="primary"
              class="enroll"
              :loading="enrollingId === course.id"
              :disabled="Boolean(enrollingId)"
              @click.stop="enroll(course)"
            >
              Apuntarme
            </n-button>
          </n-card>
        </n-grid-item>
      </n-grid>
      <n-text v-else-if="!loading && !error" depth="3">
        No hay cursos publicados.
      </n-text>
    </n-spin>
  </div>
</template>

<style scoped>
.catalog {
  max-width: 960px;
  margin: 0 auto;
}

.title {
  display: block;
  margin: 0 0 24px;
  font-size: 1.5rem;
}

.alert {
  margin-bottom: 16px;
}

.course-card.clickable {
  cursor: pointer;
}

.progress-caption {
  display: block;
  margin-top: 8px;
}

.enroll {
  margin-top: 8px;
}
</style>
