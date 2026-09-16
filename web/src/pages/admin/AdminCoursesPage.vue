<script setup lang="ts">
import {
  NAlert,
  NButton,
  NCard,
  NDataTable,
  NForm,
  NFormItem,
  NInput,
  NModal,
  NSpin,
  NTag,
  NText,
} from 'naive-ui'
import { h, onMounted, ref } from 'vue'
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
const showCreate = ref(false)
const error = ref<string | null>(null)
const newTitle = ref('Paisajes IV')

const columns = [
  {
    title: 'Curso',
    key: 'title',
  },
  {
    title: 'Estado',
    key: 'status',
    width: 160,
    render(row: AdminCourseListItem) {
      return h(
        NTag,
        { size: 'small', type: statusTagType(row.status) },
        { default: () => statusLabel(row.status) },
      )
    },
  },
  {
    title: 'Capítulos',
    key: 'chapterCount',
    width: 120,
  },
]

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
    showCreate.value = false
    await router.push({ name: 'admin-course', params: { id: created.id } })
  } catch {
    error.value = 'No se pudo crear el curso.'
  } finally {
    creating.value = false
  }
}
</script>

<template>
  <div class="page">
    <div class="hero">
      <div>
        <n-text tag="h1" class="title">Cursos</n-text>
        <n-text class="lead">
          Estados solo hacia adelante. Un curso vacío no se publica.
        </n-text>
      </div>
      <n-button type="primary" @click="showCreate = true">Nuevo curso</n-button>
    </div>

    <n-alert
      v-if="error"
      type="error"
      class="alert"
      :title="error"
      :bordered="false"
    />

    <n-card>
      <n-spin :show="loading">
        <n-data-table
          :columns="columns"
          :data="courses"
          :bordered="false"
          :row-props="
            (row: AdminCourseListItem) => ({
              style: 'cursor: pointer',
              onClick: () => openCourse(row),
            })
          "
        />
      </n-spin>
    </n-card>

    <n-modal
      v-model:show="showCreate"
      preset="card"
      title="Crear curso"
      style="width: 420px"
    >
      <n-form @submit.prevent="createCourse">
        <n-form-item label="Título">
          <n-input
            v-model:value="newTitle"
            placeholder="Paisajes IV"
            :disabled="creating"
          />
        </n-form-item>
        <n-button
          type="primary"
          attr-type="submit"
          block
          :loading="creating"
          :disabled="!newTitle.trim()"
        >
          Crear
        </n-button>
      </n-form>
    </n-modal>
  </div>
</template>

<style scoped>
.page {
  width: min(1040px, 100%);
  margin: 0 auto;
}

.hero {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-end;
  margin-bottom: 20px;
}

.title {
  display: block;
  margin: 0 0 6px;
  font-size: 2rem;
  font-weight: 700;
}

.lead {
  color: rgba(148, 163, 184, 0.95);
}

.alert {
  margin-bottom: 16px;
}
</style>
