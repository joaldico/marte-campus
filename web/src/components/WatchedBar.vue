<script setup lang="ts">
type Range = { from: number; to: number }

const props = defineProps<{
  ranges: Range[]
  duration: number
}>()

function segmentStyle(range: Range): Record<string, string> {
  if (!(props.duration > 0)) {
    return { display: 'none' }
  }
  return {
    left: `${(range.from / props.duration) * 100}%`,
    width: `${((range.to - range.from) / props.duration) * 100}%`,
  }
}
</script>

<template>
  <div class="watched-bar" aria-hidden="true">
    <div
      v-for="range in ranges"
      :key="`${range.from}-${range.to}`"
      class="watched-bar__seg"
      :style="segmentStyle(range)"
    />
  </div>
</template>

<style scoped>
.watched-bar {
  position: relative;
  height: 10px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.16);
}

.watched-bar__seg {
  position: absolute;
  top: 0;
  bottom: 0;
  border-radius: 999px;
  background: linear-gradient(90deg, #22d3ee, #8b5cf6);
}
</style>
