<template>
  <video
    v-bind="$attrs"
    :autoplay="autoplay"
    :loop="loop"
    :muted="muted"
    :playsinline="playsinline"
    :controls="controls"
    :class="videoClass"
    :style="videoStyle"
  >
    <source v-if="webm" :src="webm" type="video/webm" />
    <source v-if="mp4" :src="mp4" type="video/mp4" />
    <p>{{ alt }}</p>
  </video>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  src: string
  alt?: string
  autoplay?: boolean
  loop?: boolean
  muted?: boolean
  playsinline?: boolean
  controls?: boolean
  width?: string | number
  height?: string | number
  rounded?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  alt: 'Video demonstration',
  autoplay: true,
  loop: true,
  muted: true,
  playsinline: true,
  controls: false,
  rounded: true,
})

// Automatically generate WebM and MP4 paths from src
const webm = computed(() => props.src.replace(/\.(gif|mp4|webm)$/, '.webm'))
const mp4 = computed(() => props.src.replace(/\.(gif|mp4|webm)$/, '.mp4'))

const videoClass = computed(() => ({
  'video-rounded': props.rounded,
}))

const videoStyle = computed(() => ({
  width: typeof props.width === 'number' ? `${props.width}px` : props.width,
  height: typeof props.height === 'number' ? `${props.height}px` : props.height,
}))
</script>

<style scoped>
video {
  max-width: 100%;
  height: auto;
  display: block;
  margin: 1rem 0;
}

.video-rounded {
  border-radius: 8px;
  box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
}

/* Dark mode adjustments */
.dark video {
  box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.3), 0 2px 4px -2px rgb(0 0 0 / 0.2);
}
</style>
