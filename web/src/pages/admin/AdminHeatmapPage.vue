<script setup lang="ts">
import { NAlert, NButton, NSpin, NText } from 'naive-ui'
import { onMounted, ref } from 'vue'
import {
  getAdminVideoHeatmap,
  importAdminEvents,
  type HeatmapBucket,
  type ImportEventsResult,
  type VideoHeatmap,
} from '../../api/admin'

const SEED_VIDEOS = [
  'playa',
  'cascada',
  'bosque',
  'atardecer',
  'auroras',
  'largo',
] as const

type HeatmapRow = {
  videoId: (typeof SEED_VIDEOS)[number]
  heatmap: VideoHeatmap | null
  error: string | null
}

const rows = ref<HeatmapRow[]>(
  SEED_VIDEOS.map((videoId) => ({
    videoId,
    heatmap: null,
    error: null,
  })),
)
const loading = ref(true)
const error = ref<string | null>(null)
const csvFile = ref<File | null>(null)
const importing = ref(false)
const importResult = ref<ImportEventsResult | null>(null)
const importError = ref<string | null>(null)

function bucketClass(bucket: HeatmapBucket): 'is-skip' | 'is-watched' {
  return bucket.skipWeight > 0 ? 'is-skip' : 'is-watched'
}

async function loadHeatmaps(): Promise<void> {
  loading.value = true
  error.value = null
  try {
    const results = await Promise.all(
      SEED_VIDEOS.map(async (videoId) => {
        try {
          const heatmap = await getAdminVideoHeatmap(videoId)
          return { videoId, heatmap, error: null } satisfies HeatmapRow
        } catch {
          return {
            videoId,
            heatmap: null,
            error: 'No se pudo cargar el mapa de calor.',
          } satisfies HeatmapRow
        }
      }),
    )
    rows.value = results
    if (results.every((row) => row.error)) {
      error.value = 'No se pudieron cargar los mapas de calor.'
    }
  } catch {
    error.value = 'No se pudieron cargar los mapas de calor.'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void loadHeatmaps()
})

function onCsvChange(event: Event): void {
  const input = event.target as HTMLInputElement
  csvFile.value = input.files?.[0] ?? null
}

async function importCsv(): Promise<void> {
  const file = csvFile.value
  if (!file || importing.value) {
    return
  }
  importing.value = true
  importError.value = null
  importResult.value = null
  try {
    importResult.value = await importAdminEvents(file)
    await loadHeatmaps()
  } catch {
    importError.value = 'No se pudo importar el CSV.'
  } finally {
    importing.value = false
  }
}

function rejectedSummary(result: ImportEventsResult): string {
  if (result.rejected.length === 0) {
    return 'ninguno'
  }
  return result.rejected
    .map((item) => `${item.reason} (${item.count})`)
    .join(', ')
}
</script>

<template>
  <div class="admin-heatmap">
    <n-text tag="h1" class="title">Mapa de calor</n-text>
    <n-text depth="3" class="lead">
      Una barra por vídeo. El color pinta watchedWeight; el hueco pinta
      skipWeight.
    </n-text>

    <n-alert
      v-if="error"
      type="error"
      class="alert"
      :title="error"
      :bordered="false"
    />
    <n-alert
      v-if="importError"
      type="error"
      class="alert"
      :title="importError"
      :bordered="false"
    />
    <n-alert
      v-if="importResult"
      type="success"
      class="alert"
      title="CSV importado"
      :bordered="false"
    >
      Aceptados: {{ importResult.accepted }}. Rechazados:
      {{ rejectedSummary(importResult) }}.
    </n-alert>

    <form class="import" @submit.prevent="importCsv">
      <input
        type="file"
        accept=".csv,text/csv"
        :disabled="importing"
        @change="onCsvChange"
      />
      <n-button
        type="primary"
        attr-type="submit"
        :loading="importing"
        :disabled="!csvFile"
      >
        Importar CSV
      </n-button>
    </form>

    <div class="legend">
      <span class="legend__swatch is-watched" />
      <n-text>Visto</n-text>
      <span class="legend__swatch is-skip" />
      <n-text>Saltado</n-text>
    </div>

    <n-spin :show="loading">
      <div class="videos">
        <div
          v-for="row in rows"
          :key="row.videoId"
          class="video-row"
          :data-video="row.videoId"
        >
          <n-text class="video-id">{{ row.videoId }}</n-text>
          <n-text v-if="row.error" depth="3">{{ row.error }}</n-text>
          <div
            v-else-if="row.heatmap"
            class="heatmap-bar"
            role="img"
            :aria-label="`Mapa de calor de ${row.videoId}`"
          >
            <span
              v-for="bucket in row.heatmap.buckets"
              :key="bucket.t"
              class="heatmap-bar__bucket"
              :class="bucketClass(bucket)"
              :data-t="bucket.t"
              :data-skip-weight="bucket.skipWeight"
              :data-watched-weight="bucket.watchedWeight"
              :title="`${bucket.t}s — visto ${bucket.watchedWeight}, saltado ${bucket.skipWeight}`"
            />
          </div>
        </div>
      </div>
    </n-spin>
  </div>
</template>

<style scoped>
.admin-heatmap {
  max-width: 960px;
  margin: 0 auto;
}

.title {
  display: block;
  margin: 0 0 8px;
  font-size: 1.5rem;
}

.lead {
  display: block;
  margin-bottom: 16px;
}

.alert {
  margin-bottom: 16px;
}

.import {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.legend {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
}

.legend__swatch {
  display: inline-block;
  width: 16px;
  height: 12px;
  border: 1px solid #d0d0d0;
}

.legend__swatch.is-watched,
.heatmap-bar__bucket.is-watched {
  background: #18a058;
}

.legend__swatch.is-skip,
.heatmap-bar__bucket.is-skip {
  background: transparent;
}

.videos {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.video-row {
  display: grid;
  grid-template-columns: 120px 1fr;
  gap: 12px;
  align-items: center;
}

.video-id {
  font-weight: 600;
}

.heatmap-bar {
  display: flex;
  height: 16px;
  overflow: hidden;
  background: #e8e8e8;
}

.heatmap-bar__bucket {
  flex: 1 1 0;
  min-width: 0;
}
</style>
