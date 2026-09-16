<script setup lang="ts">
import {
  NAlert,
  NButton,
  NCard,
  NEmpty,
  NProgress,
  NSpin,
  NTag,
  NText,
} from 'naive-ui'
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getCourse, type CatalogCourseDetail } from '../api/catalog'
import { ApiError } from '../api/client'
import WatchedBar from '../components/WatchedBar.vue'

const route = useRoute()
const router = useRouter()
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

function percent(ratio: number): number {
  return Math.round(ratio * 100)
}
</script>

<template>
  <div class="page">
    <n-button text class="back" @click="router.push({ name: 'catalog' })">
      ← Catálogo
    </n-button>

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
        <n-text class="lead">
          Un capítulo cuenta como visto al 90 % de su duración. La barra pinta
          la unión de tramos que ya reprodujiste.
        </n-text>

        <n-empty
          v-if="!course.chapters.length"
          description="Este curso no tiene capítulos."
        />
        <div v-else class="chapters">
          <n-card
            v-for="(chapter, index) in course.chapters"
            :key="chapter.id"
            hoverable
            class="chapter"
            @click="router.push({ name: 'player', params: { chapterId: chapter.id } })"
          >
            <div class="chapter-row">
              <span class="index">{{ String(index + 1).padStart(2, '0') }}</span>
              <div class="chapter-main">
                <div class="chapter-top">
                  <strong>{{ chapter.title }}</strong>
                  <n-tag
                    v-if="chapter.chapterProgress.completed"
                    type="success"
                    size="small"
                  >
                    Visto (≥ 90 %)
                  </n-tag>
                </div>
                <WatchedBar
                  :ranges="chapter.ranges"
                  :duration="chapter.chapterProgress.durationSeconds"
                />
                <n-progress
                  type="line"
                  :percentage="percent(chapter.chapterProgress.ratio)"
                  :show-indicator="false"
                />
                <n-text depth="3">
                  {{ percent(chapter.chapterProgress.ratio) }} % ·
                  {{ Math.round(chapter.chapterProgress.uniqueSeconds) }} s únicos
                </n-text>
              </div>
              <n-button size="small" type="primary">Reproducir</n-button>
            </div>
          </n-card>
        </div>
      </template>
    </n-spin>
  </div>
</template>

<style scoped>
.page {
  width: min(860px, 100%);
  margin: 0 auto;
}

.back {
  margin-bottom: 16px;
}

.title {
  display: block;
  margin: 0 0 8px;
  font-size: 2rem;
  font-weight: 700;
}

.lead {
  display: block;
  margin-bottom: 24px;
  color: rgba(148, 163, 184, 0.95);
}

.alert {
  margin-bottom: 16px;
}

.chapters {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.chapter {
  cursor: pointer;
}

.chapter-row {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 16px;
  align-items: center;
}

.index {
  font-variant-numeric: tabular-nums;
  color: #22d3ee;
  font-weight: 700;
}

.chapter-main {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.chapter-top {
  display: flex;
  gap: 10px;
  align-items: center;
}
</style>
