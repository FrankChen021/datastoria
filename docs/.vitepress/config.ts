import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'DataStoria Documentation',
  description: 'AI-powered ClickHouse management console',
  base: '/', // or '/docs/' if deploying to a subpath
  
  // SEO: Global meta tags
  head: [
    ['meta', { name: 'theme-color', content: '#3b82f6' }],
    ['link', { rel: 'icon', href: '/favicon.ico' }],
    // Open Graph tags for social sharing
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:site_name', content: 'DataStoria' }],
    // Twitter Card
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    // Mermaid for diagrams
    ['script', { src: 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js' }],
    ['script', {}, `
      (function() {
        let mermaidInitialized = false;
        
        function initMermaid() {
          if (typeof window.mermaid === 'undefined') {
            setTimeout(initMermaid, 50);
            return;
          }
          
          if (!mermaidInitialized) {
            window.mermaid.initialize({ 
              startOnLoad: false,
              theme: 'default',
              securityLevel: 'loose'
            });
            mermaidInitialized = true;
          }
          
          // Render all mermaid diagrams
          renderMermaidDiagrams();
        }
        
        function renderMermaidDiagrams() {
          if (typeof window.mermaid === 'undefined' || !mermaidInitialized) {
            return;
          }
          
          const mermaidElements = document.querySelectorAll('.mermaid:not([data-processed])');
          mermaidElements.forEach((element, index) => {
            const id = 'mermaid-' + Date.now() + '-' + index + '-' + Math.random().toString(36).substr(2, 9);
            const code = (element.textContent || element.innerText || '').trim();
            
            if (code) {
              element.setAttribute('data-processed', 'true');
              
              try {
                // Use the async render API
                window.mermaid.render(id, code).then((result) => {
                  element.innerHTML = result.svg;
                }).catch((error) => {
                  console.error('Mermaid render error:', error);
                  element.innerHTML = '<pre style="color: red;">Error rendering diagram:\\n' + code + '</pre>';
                });
              } catch (error) {
                // Fallback for older API
                try {
                  window.mermaid.render(id, code, (svgCode) => {
                    element.innerHTML = svgCode;
                  });
                } catch (e) {
                  console.error('Mermaid render error:', e);
                  element.innerHTML = '<pre style="color: red;">Error rendering diagram:\\n' + code + '</pre>';
                }
              }
            }
          });
        }
        
        // Initialize when script loads
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', initMermaid);
        } else {
          setTimeout(initMermaid, 100);
        }
        
        // Re-render on VitePress client-side navigation
        if (typeof window !== 'undefined') {
          // Watch for new content (VitePress uses client-side routing)
          const observer = new MutationObserver(() => {
            setTimeout(renderMermaidDiagrams, 200);
          });
          
          setTimeout(() => {
            if (document.body) {
              observer.observe(document.body, { 
                childList: true, 
                subtree: true 
              });
            }
          }, 500);
          
          // Also render on route changes
          window.addEventListener('load', () => {
            setTimeout(renderMermaidDiagrams, 300);
          });
        }
      })();
    `],
  ],
  
  // SEO: Automatic sitemap generation
  sitemap: {
    hostname: 'https://docs.datastoria.app', // Your docs domain - update this!
    lastmodDateOnly: false, // Include time in lastmod
  },
  
  // SEO: Last updated dates (helps search engines)
  lastUpdated: true,
  
  // Markdown configuration for Mermaid
  markdown: {
    config: (md) => {
      // Custom plugin to handle mermaid code blocks
      const defaultFence = md.renderer.rules.fence
      if (defaultFence) {
        md.renderer.rules.fence = (tokens, idx, options, env, self) => {
          const token = tokens[idx]
          const info = token.info ? token.info.trim() : ''
          if (info === 'mermaid') {
            // Preserve the original content with line breaks
            const content = token.content
            // Return a div with mermaid class - the script will render it
            // Don't escape HTML, just preserve the content as-is
            return `<div class="mermaid">${content}</div>`
          }
          return defaultFence(tokens, idx, options, env, self)
        }
      }
    }
  },
  
  themeConfig: {
    logo: '/logo.png', // Add your logo to docs/public/
    
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Manual', link: '/manual/' },
    ],
    
    // Left sidebar navigation (document tree)
    // Only '/manual/' is included - docs/dev/ and docs/plan/ are excluded
    sidebar: {
      '/manual/': [
        {
          text: 'Getting Started',
          collapsed: false,
          items: [
            { text: 'Introduction', link: '/manual/01-getting-started/introduction' },
            { text: 'Installation & Setup', link: '/manual/01-getting-started/installation' },
            { text: 'First Connection', link: '/manual/01-getting-started/first-connection' },
          ]
        },
        {
          text: 'AI Features',
          collapsed: false,
          items: [
            { text: 'AI Model Configuration', link: '/manual/02-ai-features/ai-model-configuration' },
            { text: 'Natural Language to SQL', link: '/manual/02-ai-features/natural-language-sql' },
            { text: 'Query Optimization', link: '/manual/02-ai-features/query-optimization' },
            { text: 'Intelligent Visualization', link: '/manual/02-ai-features/intelligent-visualization' },
          ]
        },
        {
          text: 'Query Experience',
          collapsed: false,
          items: [
            { text: 'SQL Editor', link: '/manual/03-query-experience/sql-editor' },
            { text: 'Error Diagnostics', link: '/manual/03-query-experience/error-diagnostics' },
            { text: 'Query Execution', link: '/manual/03-query-experience/query-execution' },
            { text: 'Query Log Inspector', link: '/manual/03-query-experience/query-log-inspector' },
            { text: 'Query Explain', link: '/manual/03-query-experience/query-explain' },
            { text: 'Dependency Graph', link: '/manual/03-query-experience/dependency-graph' },
          ]
        },
        {
          text: 'Cluster Management',
          collapsed: false,
          items: [
            { text: 'Multi-Cluster Setup', link: '/manual/04-cluster-management/multi-cluster-setup' },
            { text: 'Multi-Node Dashboard', link: '/manual/04-cluster-management/multi-node-dashboard' },
            { text: 'Built-in Dashboards', link: '/manual/04-cluster-management/built-in-dashboards' },
            { text: 'Schema Explorer', link: '/manual/04-cluster-management/schema-explorer' },
          ]
        },
        {
          text: 'Security & Privacy',
          collapsed: false,
          items: [
            { text: 'Privacy Features', link: '/manual/05-security-privacy/privacy-features' },
            { text: 'Authentication', link: '/manual/05-security-privacy/authentication' },
            { text: 'API Key Management', link: '/manual/05-security-privacy/api-key-management' },
          ]
        },
        {
          text: 'Advanced Features',
          collapsed: false,
          items: [
            { text: 'Query Templates', link: '/manual/06-advanced-features/query-templates' },
            { text: 'Data Export', link: '/manual/06-advanced-features/data-export' },
            { text: 'Performance Tuning', link: '/manual/06-advanced-features/performance-tuning' },
          ]
        },
        {
          text: 'Troubleshooting',
          collapsed: false,
          items: [
            { text: 'Common Issues', link: '/manual/07-troubleshooting/common-issues' },
            { text: 'Error Messages', link: '/manual/07-troubleshooting/error-messages' },
            { text: 'Debugging Queries', link: '/manual/07-troubleshooting/debugging-queries' },
          ]
        },
        {
          text: 'Best Practices',
          collapsed: false,
          items: [
            { text: 'Query Writing', link: '/manual/08-best-practices/query-writing' },
            { text: 'AI Feature Usage', link: '/manual/08-best-practices/ai-feature-usage' },
            { text: 'Cluster Management', link: '/manual/08-best-practices/cluster-management' },
          ]
        },
        {
          text: 'Appendix',
          collapsed: false,
          items: [
            { text: 'Keyboard Shortcuts', link: '/manual/09-appendix/keyboard-shortcuts' },
            { text: 'Configuration Reference', link: '/manual/09-appendix/configuration-reference' },
            { text: 'FAQ', link: '/manual/09-appendix/faq' },
            { text: 'Glossary', link: '/manual/09-appendix/glossary' },
          ]
        },
      ]
    },
    
    socialLinks: [
      { icon: 'github', link: 'https://github.com/FrankChen021/datastoria' }
    ],
    
    search: {
      provider: 'local'
    },
    
    // Right sidebar: Table of Contents (TOC) / Outline
    // Automatically generated from h2, h3, etc. in your markdown
    outline: {
      level: [2, 3], // Show h2 and h3 headings in TOC
      label: 'On this page' // Customize the TOC title
    },
    
    footer: {
      message: 'Released under the Apache License 2.0',
      copyright: 'Copyright © 2024 DataStoria'
    },
  },
})
