<template>
  <div ref="mermaidContainer" class="mermaid-container" v-html="renderedSvg"></div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'

const props = defineProps<{
  code: string
}>()

const mermaidContainer = ref<HTMLElement | null>(null)
const renderedSvg = ref<string>('')

onMounted(async () => {
  if (!props.code) return

  try {
    // Load mermaid from CDN if not available
    if (typeof window !== 'undefined' && (window as any).mermaid) {
      const mermaid = (window as any).mermaid
      mermaid.initialize({
        startOnLoad: false,
        theme: 'default',
        securityLevel: 'loose',
      })

      const id = 'mermaid-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9)
      const code = props.code.trim()
      
      mermaid.render(id, code, (svgCode: string) => {
        renderedSvg.value = svgCode
      })
    } else {
      // Fallback: try to load from CDN
      await loadMermaidFromCDN()
      if ((window as any).mermaid) {
        const mermaid = (window as any).mermaid
        mermaid.initialize({
          startOnLoad: false,
          theme: 'default',
          securityLevel: 'loose',
        })
        const id = 'mermaid-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9)
        mermaid.render(id, props.code.trim(), (svgCode: string) => {
          renderedSvg.value = svgCode
        })
      }
    }
  } catch (error) {
    console.error('Error rendering Mermaid diagram:', error)
    renderedSvg.value = `<pre>${props.code}</pre>`
  }
})

function loadMermaidFromCDN(): Promise<void> {
  return new Promise((resolve) => {
    if ((window as any).mermaid) {
      resolve()
      return
    }
    const script = document.createElement('script')
    script.src = 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js'
    script.onload = () => resolve()
    script.onerror = () => resolve()
    document.head.appendChild(script)
  })
}
</script>

<style scoped>
.mermaid-container {
  display: flex;
  justify-content: center;
  margin: 1.5rem 0;
}
.mermaid-container :deep(svg) {
  max-width: 100%;
  height: auto;
}
</style>
