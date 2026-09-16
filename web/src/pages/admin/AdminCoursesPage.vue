<script setup lang="ts">
import {
  NAlert,
  NButton,
  NInput,
  NSpin,
  NTable,
  NTag,
  NTbody,
  NTd,
  NText,
  NTh,
  NThead,
  NTr,
} from 'naive-ui'
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  createAdminCourse,
  listAdminCourses,
  type AdminCourseListItem,
} from '../../api/admin'
import { statusLabel, statusTagType } from '../../admin/courseStatus'

const router = useRouter()
const courses = ref<AdminCourseListItem[]>([])
const loading = ref(true)
const creating = ref(false)
const error = ref<string | null>(null)
const newTitle = ref('Paisajes IV')

async function loadCourses(): Promise<void> {
  loading.value = true
  error.value = null
  try {
    courses.value = await listAdminCourses()
  } catch {
    error.value = 'No se pudo cargar la lista de cursos.'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void loadCourses()
})

function openCourse(course: AdminCourseListItem): void {
  void router.push({ name: 'admin-course', params: { id: course.id } })
}

async function createCourse(): Promise<void> {
  const title = newTitle.value.trim()
  if (!title || creating.value) {
    return
  }
  creating.value = true
  error.value = null
  try {
    const created = await createAdminCourse(title)
    await router.push({ name: 'admin-course', params: { id: created.id } })
  } catch {
    error.value = 'No se pudo crear el curso.'
  } finally {
    creating.value = false
  }
}
</script>

<template>
  <div class="admin-courses">
    <n-text tag="h1" class="title">Cursos</n-text>

    <n-alert
      v-if="error"
      type="error"
      class="alert"
      :title="error"
      :bordered="false"
    />

    <form class="create" @submit.prevent="createCourse">
      <n-input
        v-model:value="newTitle"
        placeholder="Paisajes IV"
        :disabled="creating"
      />
      <n-button
        type="primary"
        attr-type="submit"
        :loading="creating"
        :disabled="!newTitle.trim()"
      >
        Crear curso
      </n-button>
    </form>

    <n-spin :show="loading">
      <n-table v-if="courses.length" :single-line="false">
        <n-thead>
          <n-tr>
            <n-th>Título</n-th>
            <n-th>Estado</n-th>
            <n-th>Capítulos</n-th>
          </n-tr>
        </n-thead>
        <n-tbody>
          <n-tr
            v-for="course in courses"
            :key="course.id"
            class="row"
            @click="openCourse(course)"
          >
            <n-td>{{ course.title }}</n-td>
            <n-td>
              <n-tag size="small" :type="statusTagType(course.status)">
                {{ statusLabel(course.status) }}
              </n-tag>
            </n-td>
            <n-td>{{ course.chapterCount }}</n-td>
          </n-tr>
        </n-tbody>
      </n-table>
      <n-text v-else-if="!loading && !error" depth="3">
        No hay cursos.
      </n-text>
    </n-spin>
  </div>
</template>

<style scoped>
.admin-courses {
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

.create {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}

.row {
  cursor: pointer;
}
</style>
