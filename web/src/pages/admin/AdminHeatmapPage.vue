<script setup lang="ts">
import {
  NAlert,
  NButton,
  NCard,
  NSpin,
  NText,
  NUpload,
  type UploadFileInfo,
} from 'naive-ui'
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

function maxWatched(heatmap: VideoHeatmap): number {
  return Math.max(1, ...heatmap.buckets.map((bucket) => bucket.watchedWeight))
}

function bucketStyle(
  bucket: HeatmapBucket,
  peak: number,
): Record<string, string> {
  if (bucket.skipWeight > 0) {
    return { background: 'rgba(251, 113, 133, 0.88)' }
  }
  const t = bucket.watchedWeight / peak
  if (t <= 0) {
    return { background: 'rgba(148, 163, 184, 0.14)' }
  }
  return {
    background: `rgba(34, 211, 238, ${0.22 + 0.78 * t})`,
  }
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

function onCsvChange({ fileList }: { fileList: UploadFileInfo[] }): void {
  const last = fileList[fileList.length - 1]
  const raw = last?.file
  csvFile.value = raw instanceof File ? raw : null
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
  <div class="page">
    <n-text tag="h1" class="title">Mapa de calor</n-text>
    <n-text class="lead">
      Tras importar el CSV, cada segundo pinta lo más visto (cian, más intenso
      si se reproduce más) frente a lo más saltado (rosa).
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

    <n-card class="import-card">
      <div class="import">
        <n-upload
          accept=".csv,text/csv"
          :max="1"
          :default-upload="false"
          @change="onCsvChange"
        >
          <n-button>Elegir CSV</n-button>
        </n-upload>
        <n-button
          type="primary"
          :loading="importing"
          :disabled="!csvFile"
          @click="importCsv"
        >
          Importar eventos
        </n-button>
      </div>
    </n-card>

    <div class="legend">
      <span class="swatch watched" />
      <n-text>Visto</n-text>
      <span class="swatch skip" />
      <n-text>Saltado</n-text>
    </div>

    <n-spin :show="loading">
      <n-card
        v-for="row in rows"
        :key="row.videoId"
        class="video-card"
        :data-video="row.videoId"
      >
        <template #header>
          <strong>{{ row.videoId }}</strong>
        </template>
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
            :class="{
              'is-skip': bucket.skipWeight > 0,
              'is-watched': bucket.skipWeight === 0 && bucket.watchedWeight > 0,
            }"
            :data-t="bucket.t"
            :data-skip-weight="bucket.skipWeight"
            :data-watched-weight="bucket.watchedWeight"
            :style="bucketStyle(bucket, maxWatched(row.heatmap))"
            :title="`${bucket.t}s — visto ${bucket.watchedWeight}, saltado ${bucket.skipWeight}`"
          />
        </div>
      </n-card>
    </n-spin>
  </div>
</template>

<style scoped>
.page {
  width: min(1040px, 100%);
  margin: 0 auto;
}

.title {
  display: block;
  margin: 0 0 8px;
  font-size: 2rem;
  font-weight: 700;
}

.lead {
  display: block;
  margin-bottom: 20px;
  color: rgba(148, 163, 184, 0.95);
}

.alert,
.import-card,
.video-card {
  margin-bottom: 16px;
}

.import {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}

.legend {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
}

.swatch {
  width: 16px;
  height: 12px;
  border-radius: 4px;
}

.swatch.watched {
  background: #22d3ee;
}

.swatch.skip {
  background: #fb7185;
}

.heatmap-bar {
  display: flex;
  height: 28px;
  overflow: hidden;
  border-radius: 8px;
  background: rgba(148, 163, 184, 0.12);
}

.heatmap-bar__bucket {
  flex: 1 1 0;
  min-width: 0;
}
</style>
