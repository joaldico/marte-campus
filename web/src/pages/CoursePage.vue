<script setup lang="ts">
import {
  NAlert,
  NList,
  NListItem,
  NSpin,
  NTag,
  NText,
  NThing,
} from 'naive-ui'
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { getCourse, type CatalogCourseDetail } from '../api/catalog'
import { ApiError } from '../api/client'

const route = useRoute()
const courseId = computed(() => String(route.params.id ?? ''))
const course = ref<CatalogCourseDetail | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)

async function loadCourse(): Promise<void> {
  loading.value = true
  error.value = null
  course.value = null
  try {
    course.value = await getCourse(courseId.value)
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) {
      error.value = 'Debes apuntarte a este curso para ver los capítulos.'
    } else if (err instanceof ApiError && err.status === 404) {
      error.value = 'Este curso no está disponible.'
    } else {
      error.value = 'No se pudo cargar el curso.'
    }
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void loadCourse()
})

watch(courseId, () => {
  void loadCourse()
})
</script>

<template>
  <div class="course">
    <router-link :to="{ name: 'catalog' }" class="back">
      Volver al catálogo
    </router-link>

    <n-alert
      v-if="error"
      type="error"
      class="alert"
      :title="error"
      :bordered="false"
    />

    <n-spin :show="loading">
      <template v-if="course">
        <n-text tag="h1" class="title">{{ course.title }}</n-text>
        <n-list v-if="course.chapters.length" bordered>
          <n-list-item v-for="chapter in course.chapters" :key="chapter.id">
            <router-link
              :to="{ name: 'player', params: { chapterId: chapter.id } }"
              class="chapter-link"
            >
              <n-thing :title="chapter.title">
                <template #header-extra>
                  <n-tag
                    v-if="chapter.chapterProgress.completed"
                    type="success"
                    size="small"
                  >
                    Visto
                  </n-tag>
                </template>
              </n-thing>
            </router-link>
          </n-list-item>
        </n-list>
        <n-text v-else depth="3">Este curso no tiene capítulos.</n-text>
      </template>
    </n-spin>
  </div>
</template>

<style scoped>
.course {
  max-width: 960px;
  margin: 0 auto;
}

.back {
  display: inline-block;
  margin-bottom: 16px;
  color: inherit;
}

.title {
  display: block;
  margin: 0 0 24px;
  font-size: 1.5rem;
}

.alert {
  margin-bottom: 16px;
}

.chapter-link {
  display: block;
  color: inherit;
  text-decoration: none;
}
</style>
