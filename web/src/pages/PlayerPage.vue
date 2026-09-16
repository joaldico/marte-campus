<script setup lang="ts">
import { NAlert, NButton, NCard, NSpin, NText } from 'naive-ui'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
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
import WatchedBar from '../components/WatchedBar.vue'

const HEARTBEAT_MS = 5000

const route = useRoute()
const router = useRouter()
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
let chapterEpoch = 0
let nextPostSeq = 0
let appliedPostSeq = 0
let resumeAppliedEpoch = -1
let ignoreResumeSeek = false

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

function takeSeekCloseInterval(): { from: number; to: number } | null {
  const origin = seekOrigin
  if (openFrom == null || origin == null || origin <= openFrom) {
    return null
  }
  const closed = { from: openFrom, to: origin }
  openFrom = origin
  return closed
}

function eventBody(interval: { from: number; to: number }) {
  return {
    videoId: chapter.value?.videoId ?? '',
    from: interval.from,
    to: interval.to,
    rate: playbackRate(),
  }
}

function isCurrentPlayback(
  epoch: number,
  chapterTag: string,
  videoTag: string,
): boolean {
  const current = chapter.value
  return (
    !disposed &&
    epoch === chapterEpoch &&
    chapterId.value === chapterTag &&
    current != null &&
    current.id === chapterTag &&
    current.videoId === videoTag
  )
}

async function postInterval(interval: {
  from: number
  to: number
}): Promise<void> {
  const videoTag = chapter.value?.videoId
  if (!videoTag) {
    return
  }
  const epoch = chapterEpoch
  const chapterTag = chapterId.value
  const seq = (nextPostSeq += 1)
  try {
    const response = await postPlaybackEvent({
      videoId: videoTag,
      from: interval.from,
      to: interval.to,
      rate: playbackRate(),
    })
    if (!isCurrentPlayback(epoch, chapterTag, videoTag)) {
      return
    }
    if (seq < appliedPostSeq) {
      return
    }
    appliedPostSeq = seq
    ranges.value = response.ranges
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
  const interval = isSeeking ? takeSeekCloseInterval() : takeOpenInterval()
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
  ignoreResumeSeek = false
}

function applyResumeCursor(): void {
  const video = videoEl.value
  const data = chapter.value
  if (!video || !data || disposed) {
    return
  }
  if (resumeAppliedEpoch === chapterEpoch) {
    return
  }
  if (video.readyState < HTMLMediaElement.HAVE_METADATA) {
    return
  }
  resumeAppliedEpoch = chapterEpoch
  const cursor = data.cursor
  if (typeof cursor !== 'number' || !Number.isFinite(cursor) || cursor < 0) {
    return
  }
  if (video.currentTime === cursor) {
    return
  }
  ignoreResumeSeek = true
  isSeeking = true
  seekOrigin = null
  video.currentTime = cursor
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
  if (ignoreResumeSeek) {
    isSeeking = true
    seekOrigin = null
    stopHeartbeat()
    return
  }
  isSeeking = true
  seekOrigin = heardTime
  stopHeartbeat()
}

function onSeeked(): void {
  if (ignoreResumeSeek) {
    ignoreResumeSeek = false
    isSeeking = false
    seekOrigin = null
    const video = videoEl.value
    heardTime = video?.currentTime ?? null
    if (video && !video.paused && !video.ended) {
      openFrom = video.currentTime
      startHeartbeat()
    } else {
      openFrom = null
      stopHeartbeat()
    }
    return
  }
  const origin = seekOrigin
  const closed = takeSeekCloseInterval()
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
  applyResumeCursor()
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
  const requestedId = chapterId.value
  chapterEpoch += 1
  const epoch = chapterEpoch
  nextPostSeq = 0
  appliedPostSeq = 0
  resumeAppliedEpoch = -1
  resetOpenInterval()
  videoDuration.value = 0
  loading.value = true
  error.value = null
  chapter.value = null
  ranges.value = []
  try {
    const data = await getPlayerChapter(requestedId)
    if (
      disposed ||
      epoch !== chapterEpoch ||
      chapterId.value !== requestedId
    ) {
      return
    }
    chapter.value = data
    ranges.value = data.ranges
    await nextTick()
    if (
      disposed ||
      epoch !== chapterEpoch ||
      chapterId.value !== requestedId
    ) {
      return
    }
    applyResumeCursor()
  } catch (err) {
    if (
      disposed ||
      epoch !== chapterEpoch ||
      chapterId.value !== requestedId
    ) {
      return
    }
    if (err instanceof ApiError && err.status === 403) {
      error.value = 'Debes apuntarte a este curso para ver los capítulos.'
    } else if (err instanceof ApiError && err.status === 404) {
      error.value = 'Este capítulo no está disponible.'
    } else {
      error.value = 'No se pudo cargar el reproductor.'
    }
  } finally {
    if (epoch === chapterEpoch) {
      loading.value = false
    }
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
  <div class="page">
    <n-button
      v-if="chapter"
      text
      class="back"
      @click="router.push({ name: 'course', params: { id: chapter.courseId } })"
    >
      ← {{ chapter.courseTitle }}
    </n-button>
    <n-button v-else text class="back" @click="router.push({ name: 'catalog' })">
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
      <div v-if="chapter" class="stage">
        <n-card class="cinema" :bordered="false">
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
          <WatchedBar :ranges="ranges" :duration="videoDuration" />
          <n-text depth="3" class="hint">
            La barra pinta tramos únicos. Seek adelante no cuenta. x2 no dilata
            el intervalo.
          </n-text>
        </n-card>

        <n-card title="Capítulos del curso" class="playlist">
          <button
            v-for="item in chapter.playlist"
            :key="item.id"
            type="button"
            class="track"
            :class="{ current: item.id === chapter.id }"
            @click="router.push({ name: 'player', params: { chapterId: item.id } })"
          >
            <span>{{ String(item.position).padStart(2, '0') }}</span>
            <strong>{{ item.title }}</strong>
          </button>
        </n-card>
      </div>
    </n-spin>
  </div>
</template>

<style scoped>
.page {
  width: min(1180px, 100%);
  margin: 0 auto;
}

.back {
  margin-bottom: 16px;
}

.alert {
  margin-bottom: 16px;
}

.stage {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 300px;
  gap: 18px;
  align-items: start;
}

.title {
  display: block;
  margin: 0 0 12px;
  font-size: 1.45rem;
  font-weight: 700;
}

.video {
  display: block;
  width: 100%;
  border-radius: 12px;
  background: #000;
  margin-bottom: 12px;
}

.hint {
  display: block;
  margin-top: 10px;
}

.playlist :deep(.n-card__content) {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 8px;
}

.track {
  display: grid;
  grid-template-columns: 32px 1fr;
  gap: 10px;
  align-items: center;
  width: 100%;
  padding: 10px 12px;
  border: 1px solid transparent;
  border-radius: 10px;
  background: rgba(148, 163, 184, 0.08);
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.track span {
  color: #22d3ee;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
}

.track.current {
  border-color: rgba(34, 211, 238, 0.45);
  background: rgba(34, 211, 238, 0.12);
}

@media (max-width: 900px) {
  .stage {
    grid-template-columns: 1fr;
  }
}
</style>
