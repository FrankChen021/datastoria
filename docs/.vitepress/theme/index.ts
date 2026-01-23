import 'viewerjs/dist/viewer.min.css'
import type { Theme } from 'vitepress'
import { useRoute } from 'vitepress'
import imageViewer from 'vitepress-plugin-image-viewer'
import vImageViewer from 'vitepress-plugin-image-viewer/lib/vImageViewer.vue'
import DefaultTheme from 'vitepress/theme'
import './custom.css'

export default {
  extends: DefaultTheme,
  enhanceApp({ app, router }) {
    // Register image viewer component
    app.component('vImageViewer', vImageViewer)
    
    // Add zoom indicators to images
    if (typeof window !== 'undefined') {
      const addImageIndicators = () => {
        const images = document.querySelectorAll('.vp-doc img:not([data-wrapped])')
        images.forEach((img) => {
          // Skip if already wrapped
          if ((img as HTMLElement).closest('.image-wrapper')) {
            return
          }
          
          // Create wrapper
          const wrapper = document.createElement('span')
          wrapper.className = 'image-wrapper'
          
          // Insert wrapper before image
          img.parentNode?.insertBefore(wrapper, img)
          // Move image into wrapper
          wrapper.appendChild(img)
          
          // Mark as processed
          img.setAttribute('data-wrapped', 'true')
        })
      }
      
      // Run on initial load
      setTimeout(addImageIndicators, 100)
      
      // Run on route changes
      router.onAfterRouteChanged = () => {
        setTimeout(() => {
          addImageIndicators()
          
          // Initialize Mermaid after route change
          if (typeof (window as any).mermaid !== 'undefined') {
            const mermaid = (window as any).mermaid
            if (mermaid.run) {
              mermaid.run()
            }
          }
        }, 100)
      }
      
      // Watch for new images added dynamically
      const observer = new MutationObserver(() => {
        setTimeout(addImageIndicators, 100)
      })
      
      setTimeout(() => {
        const docContent = document.querySelector('.vp-doc')
        if (docContent) {
          observer.observe(docContent, {
            childList: true,
            subtree: true
          })
        }
      }, 500)
    }
  },
  setup() {
    const route = useRoute()
    imageViewer(route)
  }
} satisfies Theme
