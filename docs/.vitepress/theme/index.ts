import 'viewerjs/dist/viewer.min.css'
import type { Theme } from 'vitepress'
import { useRoute } from 'vitepress'
import imageViewer from 'vitepress-plugin-image-viewer'
import vImageViewer from 'vitepress-plugin-image-viewer/lib/vImageViewer.vue'
import DefaultTheme from 'vitepress/theme'
import Video from '../components/Video.vue'
import './custom.css'

export default {
  extends: DefaultTheme,
  enhanceApp({ app, router }) {
    // Register image viewer component
    app.component('vImageViewer', vImageViewer)
    // Register video component
    app.component('Video', Video)
    
    // Add accessibility enhancements
    if (typeof window !== 'undefined') {
      // Add skip-to-content link
      const addSkipLink = () => {
        if (document.querySelector('.skip-to-content')) return
        
        const skipLink = document.createElement('a')
        skipLink.href = '#VPContent'
        skipLink.className = 'skip-to-content'
        skipLink.textContent = 'Skip to main content'
        skipLink.setAttribute('aria-label', 'Skip to main content')
        document.body.insertBefore(skipLink, document.body.firstChild)
      }
      
      // Add ARIA labels to navigation elements
      const enhanceAccessibility = () => {
        // Add main landmark if not present
        const content = document.querySelector('.VPContent')
        if (content && !content.getAttribute('role')) {
          content.setAttribute('role', 'main')
          content.setAttribute('id', 'VPContent')
          content.setAttribute('aria-label', 'Main content')
        }
        
        // Add navigation landmark
        const nav = document.querySelector('.VPNav')
        if (nav && !nav.getAttribute('role')) {
          nav.setAttribute('role', 'navigation')
          nav.setAttribute('aria-label', 'Main navigation')
        }
        
        // Add sidebar landmark
        const sidebar = document.querySelector('.VPSidebar')
        if (sidebar && !sidebar.getAttribute('role')) {
          sidebar.setAttribute('role', 'navigation')
          sidebar.setAttribute('aria-label', 'Documentation navigation')
        }
        
        // Enhance search accessibility
        const searchButton = document.querySelector('.DocSearch-Button')
        if (searchButton && !searchButton.getAttribute('aria-label')) {
          searchButton.setAttribute('aria-label', 'Search documentation')
        }
        
        // Add aria-current to active links
        const activeLinks = document.querySelectorAll('.VPSidebarItem.is-active > .item > .link')
        activeLinks.forEach(link => {
          link.setAttribute('aria-current', 'page')
        })
        
        // Ensure all images have alt text (fallback)
        const images = document.querySelectorAll('img:not([alt])')
        images.forEach(img => {
          const src = img.getAttribute('src') || ''
          const filename = src.split('/').pop()?.split('.')[0] || 'image'
          img.setAttribute('alt', filename.replace(/-/g, ' '))
        })
        
        // Add keyboard navigation hints
        const addKeyboardHints = () => {
          const nav = document.querySelector('.VPNav')
          if (nav && !document.querySelector('.keyboard-hint')) {
            const hint = document.createElement('div')
            hint.className = 'sr-only keyboard-hint'
            hint.setAttribute('role', 'status')
            hint.setAttribute('aria-live', 'polite')
            hint.textContent = 'Use Tab to navigate, Enter to select, Escape to close menus'
            nav.appendChild(hint)
          }
        }
        
        addKeyboardHints()
      }
      
      // Run on initial load
      setTimeout(() => {
        addSkipLink()
        enhanceAccessibility()
      }, 100)
      
      // Run on route changes
      const originalOnAfterRouteChanged = router.onAfterRouteChanged
      router.onAfterRouteChanged = () => {
        if (originalOnAfterRouteChanged) {
          originalOnAfterRouteChanged()
        }
        setTimeout(() => {
          addSkipLink()
          enhanceAccessibility()
        }, 100)
      }
    }
    
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
      
      // Add lazy loading to images
      const addLazyLoading = () => {
        const images = document.querySelectorAll('.vp-doc img:not([loading])')
        images.forEach((img) => {
          // Add loading="lazy" for images below the fold
          img.setAttribute('loading', 'lazy')
          // Add decoding="async" for better performance
          img.setAttribute('decoding', 'async')
        })
      }
      
      // Run on initial load
      setTimeout(addLazyLoading, 100)
      
      // Run on route changes
      const originalOnAfterRouteChanged2 = router.onAfterRouteChanged
      router.onAfterRouteChanged = () => {
        if (originalOnAfterRouteChanged2) {
          originalOnAfterRouteChanged2()
        }
        setTimeout(addLazyLoading, 100)
      }
    }
  },
  setup() {
    const route = useRoute()
    imageViewer(route)
  }
} satisfies Theme
