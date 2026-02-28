<template>
  <section class="feature-carousel" aria-label="Key feature screenshots">
    <div class="feature-carousel__header">
      <div class="feature-carousel__meta">
        <p class="feature-carousel__eyebrow">Key Screenshots</p>
        <h2 class="feature-carousel__title">
          <a
            v-if="currentItem.href"
            class="feature-carousel__title-link"
            :href="currentItem.href"
          >
            {{ currentItem.title }}
          </a>
          <span v-else>{{ currentItem.title }}</span>
        </h2>
        <p class="feature-carousel__description">{{ currentItem.description }}</p>
      </div>
    </div>

    <div class="feature-carousel__frame">
      <button
        type="button"
        class="feature-carousel__nav feature-carousel__nav--prev"
        @click="prev"
        aria-label="Show previous screenshot"
      >
        <span aria-hidden="true">‹</span>
      </button>

      <button
        v-if="currentItem.kind !== 'video'"
        type="button"
        class="feature-carousel__image-button"
        @click="openLightbox"
        aria-label="Open screenshot in popup"
      >
        <img class="feature-carousel__media" :src="currentItem.src" :alt="currentItem.alt" />
      </button>
      <video
        v-else
        class="feature-carousel__video feature-carousel__media"
        :src="currentItem.src"
        autoplay
        loop
        muted
        playsinline
      >
        <p>{{ currentItem.alt }}</p>
      </video>

      <button
        type="button"
        class="feature-carousel__nav feature-carousel__nav--next"
        @click="next"
        aria-label="Show next screenshot"
      >
        <span aria-hidden="true">›</span>
      </button>
    </div>

    <div
      v-if="isLightboxOpen"
      class="feature-carousel__lightbox"
      role="dialog"
      aria-modal="true"
      :aria-label="currentItem.alt"
      @click.self="closeLightbox"
    >
      <button
        type="button"
        class="feature-carousel__lightbox-close"
        @click="closeLightbox"
        aria-label="Close image popup"
      >
        Close
      </button>
      <img
        class="feature-carousel__lightbox-image"
        :src="currentItem.src"
        :alt="currentItem.alt"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useData } from 'vitepress'

interface CarouselItem {
  title: string
  description: string
  src: string
  alt: string
  href?: string
  kind?: 'image' | 'video'
}

const props = defineProps<{
  items: CarouselItem[]
}>()

const currentIndex = ref(0)
const isLightboxOpen = ref(false)
const { site } = useData()

const resolvedItems = computed(() => {
  const base = site.value.base.replace(/\/$/, '')
  return props.items.map((item) => ({
    ...item,
    src: item.src.startsWith('http') ? item.src : `${base}${item.src}`,
    href: item.href ? (item.href.startsWith('http') ? item.href : `${base}${item.href}`) : undefined,
    kind: item.kind ?? 'image',
  }))
})

const currentItem = computed(() => resolvedItems.value[currentIndex.value])

function prev() {
  currentIndex.value =
    currentIndex.value === 0 ? resolvedItems.value.length - 1 : currentIndex.value - 1
}

function next() {
  currentIndex.value =
    currentIndex.value === resolvedItems.value.length - 1 ? 0 : currentIndex.value + 1
}

function openLightbox() {
  isLightboxOpen.value = true
}

function closeLightbox() {
  isLightboxOpen.value = false
}

onMounted(() => {
  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', onKeydown)
  }
})

onBeforeUnmount(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('keydown', onKeydown)
  }
})

function onKeydown(event: KeyboardEvent) {
  if (!isLightboxOpen.value) {
    return
  }

  if (event.key === 'Escape') {
    closeLightbox()
  }
}
</script>

<style scoped>
.feature-carousel {
  margin: 2rem 0;
  display: grid;
  gap: 1rem;
}

.feature-carousel__header {
  display: block;
}

.feature-carousel__meta {
  min-width: 0;
}

.feature-carousel__eyebrow {
  margin: 0 0 0.25rem;
  font-size: 0.85rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--vp-c-brand-1);
}

.feature-carousel__title {
  margin: 0;
  font-size: 1.5rem;
  line-height: 1.2;
}

.feature-carousel__title-link {
  color: inherit;
  text-decoration: none;
}

.feature-carousel__title-link:hover {
  color: var(--vp-c-brand-1);
  text-decoration: underline;
}

.feature-carousel__description {
  margin: 0.5rem 0 0;
  color: var(--vp-c-text-2);
}

.feature-carousel__nav {
  position: absolute;
  top: 50%;
  z-index: 2;
  width: 52px;
  height: 52px;
  display: grid;
  place-items: center;
  transform: translateY(-50%);
  border: 1px solid color-mix(in srgb, var(--vp-c-text-1) 10%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--vp-c-bg) 86%, transparent);
  color: var(--vp-c-text-1);
  font-size: 2rem;
  line-height: 1;
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.10);
  backdrop-filter: blur(12px);
  transition:
    transform 0.2s ease,
    background-color 0.2s ease,
    border-color 0.2s ease,
    color 0.2s ease,
    box-shadow 0.2s ease;
}

.feature-carousel__nav--prev {
  left: 0.5rem;
}

.feature-carousel__nav--next {
  right: 0.5rem;
}

.feature-carousel__nav:hover {
  background: color-mix(in srgb, var(--vp-c-brand-soft) 78%, var(--vp-c-bg));
  border-color: color-mix(in srgb, var(--vp-c-brand-1) 28%, transparent);
  color: var(--vp-c-brand-1);
  box-shadow: 0 16px 34px rgba(15, 23, 42, 0.16);
}

.feature-carousel__nav:active {
  transform: translateY(-50%) scale(0.96);
}

.feature-carousel__frame {
  position: relative;
  overflow: hidden;
  border-radius: 18px;
  min-height: clamp(320px, 52vw, 720px);
  display: grid;
  place-items: center;
}

.feature-carousel__image-button {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  padding: 1rem;
  border: 0;
  background: transparent;
  cursor: zoom-in;
}

.feature-carousel__frame img {
  display: block;
  max-width: 100%;
  max-height: min(68vh, 680px);
  width: auto;
  height: auto;
  margin: 0;
  object-fit: contain;
}

.feature-carousel__video {
  display: block;
  max-width: 100%;
  max-height: min(68vh, 680px);
  width: auto;
  height: auto;
  margin: 0;
  object-fit: contain;
}

.feature-carousel__lightbox {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: grid;
  place-items: center;
  background: rgba(15, 23, 42, 0.82);
  padding: 2rem;
}

.feature-carousel__lightbox-close {
  position: absolute;
  top: 1rem;
  right: 1rem;
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.85);
  color: white;
  padding: 0.6rem 0.9rem;
  font-weight: 600;
}

.feature-carousel__lightbox-image {
  max-width: min(1200px, 100%);
  max-height: calc(100vh - 4rem);
  border-radius: 14px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.35);
}

@media (max-width: 768px) {
  .feature-carousel__nav {
    width: 44px;
    height: 44px;
    font-size: 1.7rem;
  }

  .feature-carousel__nav--prev {
    left: 0.25rem;
  }

  .feature-carousel__nav--next {
    right: 0.25rem;
  }

  .feature-carousel__lightbox {
    padding: 1rem;
  }

  .feature-carousel__frame {
    min-height: 240px;
  }

  .feature-carousel__image-button {
    padding: 0.75rem;
  }

  .feature-carousel__frame img,
  .feature-carousel__video {
    max-height: min(56vh, 420px);
  }
}
</style>
