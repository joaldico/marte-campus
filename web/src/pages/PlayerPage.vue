<script setup lang="ts">
import { NAlert, NList, NListItem, NSpin, NText } from 'naive-ui'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import {
  flushPlaybackEventKeepalive,
  postPlaybackEvent,
} from '../api/playback'
import {
  getPlayerChapter,
  playerVideoSrc,
  type PlayerChapter,
  type PlayerRange,
} from '../api/player'
import { ApiError } from '../api/client'

const HEARTBEAT_MS = 5000

const route = useRoute()
const chapterId = computed(() => String(route.params.chapterId ?? ''))
const chapter = ref<PlayerChapter | null>(null)
const ranges = ref<PlayerRange[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const videoEl = ref<HTMLVideoElement | null>(null)
const videoDuration = ref(0)

const videoSrc = computed(() =>
  chapter.value ? playerVideoSrc(chapter.value.url) : '',
)

let openFrom: number | null = null
let heardTime: number | null = null
let seekOrigin: number | null = null
let isSeeking = false
let heartbeatTimer: ReturnType<typeof setInterval> | null = null
let disposed = false

function playbackRate(): number {
  const rate = videoEl.value?.playbackRate
  return typeof rate === 'number' && rate > 0 ? rate : 1
}

function stopHeartbeat(): void {
  if (heartbeatTimer != null) {
    clearInterval(heartbeatTimer)
    heartbeatTimer = null
  }
}

function startHeartbeat(): void {
  if (heartbeatTimer != null) {
    return
  }
  heartbeatTimer = setInterval(() => {
    if (isSeeking) {
      return
    }
    void flushJson()
  }, HEARTBEAT_MS)
}

function takeOpenInterval(): { from: number; to: number } | null {
  if (
    isSeeking ||
    openFrom == null ||
    heardTime == null ||
    heardTime <= openFrom
  ) {
    return null
  }
  const interval = { from: openFrom, to: heardTime }
  openFrom = heardTime
  return interval
}

function eventBody(interval: { from: number; to: number }) {
  return {
    videoId: chapter.value?.videoId ?? '',
    from: interval.from,
    to: interval.to,
    rate: playbackRate(),
  }
}

async function postInterval(interval: {
  from: number
  to: number
}): Promise<void> {
  if (!chapter.value?.videoId) {
    return
  }
  try {
    const response = await postPlaybackEvent(eventBody(interval))
    if (!disposed) {
      ranges.value = response.ranges
    }
  } catch {
    /* ignore failed posts so the happy path stays quiet */
  }
}

async function flushJson(): Promise<void> {
  const interval = takeOpenInterval()
  if (!interval) {
    return
  }
  await postInterval(interval)
}

function flushKeepalive(): void {
  const interval = takeOpenInterval()
  if (!interval || !chapter.value?.videoId) {
    return
  }
  flushPlaybackEventKeepalive(eventBody(interval))
}

function resetOpenInterval(): void {
  stopHeartbeat()
  openFrom = null
  heardTime = null
  seekOrigin = null
  isSeeking = false
}

function onTimeUpdate(): void {
  const video = videoEl.value
  if (!video || isSeeking) {
    return
  }
  heardTime = video.currentTime
  if (openFrom == null && !video.paused && !video.ended) {
    openFrom = heardTime
  }
}

function onPlay(): void {
  const video = videoEl.value
  if (!video) {
    return
  }
  heardTime = video.currentTime
  if (openFrom == null) {
    openFrom = heardTime
  }
  startHeartbeat()
}

function onPause(): void {
  stopHeartbeat()
  if (isSeeking) {
    return
  }
  void flushJson()
  openFrom = null
}

function onEnded(): void {
  stopHeartbeat()
  void flushJson()
  openFrom = null
}

function onSeeking(): void {
  isSeeking = true
  seekOrigin = heardTime
  stopHeartbeat()
}

function onSeeked(): void {
  const origin = seekOrigin
  const closed =
    openFrom != null && origin != null && origin > openFrom
      ? { from: openFrom, to: origin }
      : null
  isSeeking = false
  seekOrigin = null
  const video = videoEl.value
  heardTime = video?.currentTime ?? origin
  if (video && !video.paused && !video.ended) {
    openFrom = video.currentTime
    startHeartbeat()
  } else {
    openFrom = null
    stopHeartbeat()
  }
  if (closed) {
    void postInterval(closed)
  }
}

function onLoadedMetadata(): void {
  const duration = videoEl.value?.duration
  videoDuration.value =
    typeof duration === 'number' && Number.isFinite(duration) && duration > 0
      ? duration
      : 0
}

function segmentStyle(range: PlayerRange): Record<string, string> {
  const duration = videoDuration.value
  if (!(duration > 0)) {
    return { display: 'none' }
  }
  const left = (range.from / duration) * 100
  const width = ((range.to - range.from) / duration) * 100
  return {
    left: `${left}%`,
    width: `${width}%`,
  }
}

function onPageHide(): void {
  flushKeepalive()
}

function onVisibilityChange(): void {
  if (document.visibilityState === 'hidden') {
    flushKeepalive()
  }
}

async function loadChapter(): Promise<void> {
  if (disposed) {
    return
  }
  resetOpenInterval()
  videoDuration.value = 0
  loading.value = true
  error.value = null
  chapter.value = null
  ranges.value = []
  try {
    const data = await getPlayerChapter(chapterId.value)
    chapter.value = data
    ranges.value = data.ranges
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) {
      error.value = 'Debes apuntarte a este curso para ver los capítulos.'
    } else if (err instanceof ApiError && err.status === 404) {
      error.value = 'Este capítulo no está disponible.'
    } else {
      error.value = 'No se pudo cargar el reproductor.'
    }
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  window.addEventListener('pagehide', onPageHide)
  document.addEventListener('visibilitychange', onVisibilityChange)
  void loadChapter()
})

onUnmounted(() => {
  disposed = true
  window.removeEventListener('pagehide', onPageHide)
  document.removeEventListener('visibilitychange', onVisibilityChange)
  stopHeartbeat()
  void flushJson()
})

watch(chapterId, () => {
  stopHeartbeat()
  void flushJson().then(() => {
    void loadChapter()
  })
})
</script>

<template>
  <div class="player">
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
      <template v-if="chapter">
        <n-text tag="h1" class="title">{{ chapter.title }}</n-text>

        <video
          ref="videoEl"
          class="video"
          :src="videoSrc"
          controls
          @timeupdate="onTimeUpdate"
          @play="onPlay"
          @pause="onPause"
          @ended="onEnded"
          @seeking="onSeeking"
          @seeked="onSeeked"
          @loadedmetadata="onLoadedMetadata"
        />

        <div class="range-bar" aria-hidden="true">
          <div
            v-for="range in ranges"
            :key="`${range.from}-${range.to}`"
            class="range-bar__seg"
            :style="segmentStyle(range)"
          />
        </div>

        <n-list class="siblings" bordered>
          <n-list-item v-if="chapter.siblings.previousId">
            <router-link
              :to="{
                name: 'player',
                params: { chapterId: chapter.siblings.previousId },
              }"
            >
              Capítulo anterior
            </router-link>
          </n-list-item>
          <n-list-item>
            <n-text>{{ chapter.title }}</n-text>
          </n-list-item>
          <n-list-item v-if="chapter.siblings.nextId">
            <router-link
              :to="{
                name: 'player',
                params: { chapterId: chapter.siblings.nextId },
              }"
            >
              Capítulo siguiente
            </router-link>
          </n-list-item>
        </n-list>
      </template>
    </n-spin>
  </div>
</template>

<style scoped>
.player {
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
  margin: 0 0 16px;
  font-size: 1.5rem;
}

.alert {
  margin-bottom: 16px;
}

.video {
  display: block;
  width: 100%;
  background: #000;
}

.range-bar {
  position: relative;
  height: 8px;
  margin: 8px 0 24px;
  overflow: hidden;
  background: #e8e8e8;
}

.range-bar__seg {
  position: absolute;
  top: 0;
  bottom: 0;
  background: #18a058;
}

.siblings a {
  color: inherit;
}
</style>
