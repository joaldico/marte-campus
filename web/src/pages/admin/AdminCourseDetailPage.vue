<script setup lang="ts">
import {
  NAlert,
  NButton,
  NCard,
  NInput,
  NPopconfirm,
  NSpace,
  NSpin,
  NTag,
  NText,
} from 'naive-ui'
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { VueDraggable } from 'vue-draggable-plus'
import {
  addAdminChapter,
  deleteAdminChapter,
  getAdminCourse,
  patchAdminChapter,
  publishAdminRevision,
  reorderAdminChapters,
  submitAdminRevision,
  transitionAdminCourse,
  type AdminChapter,
  type AdminCourseDetail,
} from '../../api/admin'
import { ApiError } from '../../api/client'
import {
  legalTransitionTarget,
  statusLabel,
  statusTagType,
  transitionButtonLabel,
} from '../../admin/courseStatus'

const route = useRoute()
const router = useRouter()
const courseId = computed(() => String(route.params.id ?? ''))
const course = ref<AdminCourseDetail | null>(null)
const chapters = ref<AdminChapter[]>([])
const loading = ref(true)
const busy = ref(false)
const error = ref<string | null>(null)
const newTitle = ref('')
const newUrl = ref('')
const editingId = ref<string | null>(null)
const editTitle = ref('')
const editUrl = ref('')

const legalTarget = computed(() =>
  course.value ? legalTransitionTarget(course.value.status) : null,
)

const hasOpenRevision = computed(() => {
  const current = course.value
  return (
    current != null &&
    current.status === 'published' &&
    current.workingVersionId != null &&
    current.publishedVersionId != null &&
    current.workingVersionId !== current.publishedVersionId
  )
})

const workingRevisionStatus = computed(() => {
  const current = course.value
  if (!current?.workingVersionId) {
    return null
  }
  return (
    current.versions.find((version) => version.id === current.workingVersionId)
      ?.revisionStatus ?? null
  )
})

function applyCourse(detail: AdminCourseDetail): void {
  course.value = detail
  chapters.value = [...detail.chapters]
  if (editingId.value && !detail.chapters.some((chapter) => chapter.id === editingId.value)) {
    editingId.value = null
  }
}

async function loadCourse(): Promise<void> {
  loading.value = true
  error.value = null
  course.value = null
  chapters.value = []
  try {
    applyCourse(await getAdminCourse(courseId.value))
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) {
      await router.replace({ name: 'catalog' })
      return
    }
    if (err instanceof ApiError && err.status === 404) {
      error.value = 'Este curso no existe.'
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

async function runMutation(action: () => Promise<void>, failMessage: string): Promise<void> {
  if (busy.value) {
    return
  }
  busy.value = true
  error.value = null
  try {
    await action()
  } catch {
    error.value = failMessage
    if (course.value) {
      chapters.value = [...course.value.chapters]
    }
  } finally {
    busy.value = false
  }
}

async function changeStatus(): Promise<void> {
  const to = legalTarget.value
  if (!to) {
    return
  }
  await runMutation(async () => {
    await transitionAdminCourse(courseId.value, to)
    applyCourse(await getAdminCourse(courseId.value))
  }, 'No se pudo cambiar el estado del curso.')
}

async function submitRevision(): Promise<void> {
  await runMutation(async () => {
    await submitAdminRevision(courseId.value)
    applyCourse(await getAdminCourse(courseId.value))
  }, 'No se pudo enviar la revisión.')
}

async function publishRevision(): Promise<void> {
  await runMutation(async () => {
    await publishAdminRevision(courseId.value)
    applyCourse(await getAdminCourse(courseId.value))
  }, 'No se pudo publicar la revisión.')
}

async function addChapter(): Promise<void> {
  const title = newTitle.value.trim()
  const url = newUrl.value.trim()
  if (!title || !url) {
    return
  }
  await runMutation(async () => {
    await addAdminChapter(courseId.value, title, url)
    applyCourse(await getAdminCourse(courseId.value))
    newTitle.value = ''
    newUrl.value = ''
  }, 'No se pudo añadir el capítulo.')
}

async function onReorder(): Promise<void> {
  await nextTick()
  const ids = chapters.value.map((chapter) => chapter.id)
  const previous = course.value?.chapters.map((chapter) => chapter.id) ?? []
  if (
    ids.length === previous.length &&
    ids.every((id, index) => id === previous[index])
  ) {
    return
  }
  await runMutation(async () => {
    applyCourse(await reorderAdminChapters(courseId.value, ids))
  }, 'No se pudo reordenar los capítulos.')
}

function startEdit(chapter: AdminChapter): void {
  editingId.value = chapter.id
  editTitle.value = chapter.title
  editUrl.value = chapter.url
}

function cancelEdit(): void {
  editingId.value = null
}

async function saveEdit(): Promise<void> {
  const chapterId = editingId.value
  const title = editTitle.value.trim()
  if (!chapterId || !title) {
    return
  }
  const url = editUrl.value.trim()
  await runMutation(async () => {
    await patchAdminChapter(
      courseId.value,
      chapterId,
      title,
      url === '' ? undefined : url,
    )
    applyCourse(await getAdminCourse(courseId.value))
    editingId.value = null
  }, 'No se pudo guardar el capítulo.')
}

async function removeChapter(chapterId: string): Promise<void> {
  await runMutation(async () => {
    await deleteAdminChapter(courseId.value, chapterId)
    applyCourse(await getAdminCourse(courseId.value))
  }, 'No se pudo eliminar el capítulo.')
}
</script>

<template>
  <div class="page">
    <n-button text class="back" @click="router.push({ name: 'admin-courses' })">
      ← Cursos
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
        <n-card class="hero-card">
          <div class="heading">
            <div>
              <n-text tag="h1" class="title">{{ course.title }}</n-text>
              <n-text v-if="hasOpenRevision" depth="3">
                Los alumnos siguen en la versión publicada hasta que envíes y
                publiques la revisión.
              </n-text>
            </div>
            <n-tag :type="statusTagType(course.status)">
              {{ statusLabel(course.status) }}
            </n-tag>
          </div>
          <n-space>
            <n-button
              v-if="legalTarget"
              type="primary"
              :loading="busy"
              :disabled="busy"
              @click="changeStatus"
            >
              {{ transitionButtonLabel(legalTarget) }}
            </n-button>
            <n-button
              v-if="hasOpenRevision && workingRevisionStatus === 'draft'"
              :loading="busy"
              :disabled="busy"
              @click="submitRevision"
            >
              Enviar revisión
            </n-button>
            <n-button
              v-if="hasOpenRevision && workingRevisionStatus === 'in_review'"
              type="primary"
              :loading="busy"
              :disabled="busy"
              @click="publishRevision"
            >
              Publicar revisión
            </n-button>
          </n-space>
        </n-card>

        <n-card title="Añadir capítulo" class="block">
          <form class="add" @submit.prevent="addChapter">
            <n-input
              v-model:value="newTitle"
              placeholder="Título"
              :disabled="busy"
            />
            <n-input
              v-model:value="newUrl"
              placeholder="URL de archive.org"
              :disabled="busy"
            />
            <n-button
              type="primary"
              attr-type="submit"
              :loading="busy"
              :disabled="busy || !newTitle.trim() || !newUrl.trim()"
            >
              Añadir
            </n-button>
          </form>
        </n-card>

        <n-card title="Capítulos · arrastra para reordenar" class="block">
          <VueDraggable
            v-if="chapters.length"
            v-model="chapters"
            handle=".handle"
            :animation="200"
            :disabled="busy || editingId !== null"
            :onUpdate="onReorder"
          >
            <div v-for="chapter in chapters" :key="chapter.id" class="chapter">
              <button
                class="handle"
                type="button"
                aria-label="Reordenar"
                :disabled="busy"
              >
                ⋮⋮
              </button>
              <div v-if="editingId === chapter.id" class="chapter-edit">
                <n-input v-model:value="editTitle" :disabled="busy" />
                <n-input v-model:value="editUrl" :disabled="busy" />
                <n-space>
                  <n-button
                    size="small"
                    type="primary"
                    :disabled="busy || !editTitle.trim()"
                    @click="saveEdit"
                  >
                    Guardar
                  </n-button>
                  <n-button size="small" :disabled="busy" @click="cancelEdit">
                    Cancelar
                  </n-button>
                </n-space>
              </div>
              <div v-else class="chapter-body">
                <div>
                  <n-text class="chapter-title">{{ chapter.title }}</n-text>
                  <n-text depth="3" class="chapter-url">{{ chapter.url }}</n-text>
                </div>
                <n-space>
                  <n-button
                    size="small"
                    :disabled="busy"
                    @click="startEdit(chapter)"
                  >
                    Editar
                  </n-button>
                  <n-popconfirm @positive-click="removeChapter(chapter.id)">
                    <template #trigger>
                      <n-button size="small" :disabled="busy">Eliminar</n-button>
                    </template>
                    ¿Eliminar este capítulo?
                  </n-popconfirm>
                </n-space>
              </div>
            </div>
          </VueDraggable>
          <n-text v-else depth="3">Este curso no tiene capítulos.</n-text>
        </n-card>
      </template>
    </n-spin>
  </div>
</template>

<style scoped>
.page {
  width: min(920px, 100%);
  margin: 0 auto;
}

.back {
  margin-bottom: 16px;
}

.title {
  display: block;
  margin: 0 0 6px;
  font-size: 1.8rem;
  font-weight: 700;
}

.alert {
  margin-bottom: 16px;
}

.hero-card,
.block {
  margin-bottom: 16px;
}

.heading {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
  margin-bottom: 16px;
}

.add {
  display: grid;
  grid-template-columns: 1fr 2fr auto;
  gap: 12px;
}

.chapter {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  padding: 12px 0;
  border-bottom: 1px solid rgba(148, 163, 184, 0.12);
}

.handle {
  flex: none;
  margin-top: 4px;
  padding: 4px 8px;
  border: 0;
  border-radius: 8px;
  background: rgba(34, 211, 238, 0.1);
  cursor: grab;
  color: #67e8f9;
}

.handle:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.chapter-body,
.chapter-edit {
  display: flex;
  flex: 1;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}

.chapter-edit {
  flex-direction: column;
}

.chapter-title,
.chapter-url {
  display: block;
}

.chapter-url {
  margin-top: 4px;
  word-break: break-all;
}
</style>
