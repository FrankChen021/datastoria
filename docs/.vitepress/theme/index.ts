import { h } from 'vue'
import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'

export default {
  extends: DefaultTheme,
  enhanceApp({ app, router }) {
    // Initialize Mermaid after Vue app is ready
    if (typeof window !== 'undefined') {
      router.onAfterRouteChanged = () => {
        setTimeout(() => {
          if (typeof (window as any).mermaid !== 'undefined') {
            const mermaid = (window as any).mermaid
            if (mermaid.run) {
              mermaid.run()
            }
          }
        }, 100)
      }
    }
  }
} satisfies Theme
