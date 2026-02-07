import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'DataStoria Documentation',
  description: 'AI-powered ClickHouse management console with natural language queries, intelligent optimization, and advanced cluster management. Modern web interface for ClickHouse database administration.',
  base: '/', // or '/docs/' if deploying to a subpath
  ignoreDeadLinks: true, // Allow links to planned sections that don't exist yet
  lang: 'en-US', // SEO: Language declaration

  // SEO: Clean URLs without .html extension
  cleanUrls: true,

  // SEO: Global meta tags
  head: [
    // Basic meta tags
    ['meta', { name: 'viewport', content: 'width=device-width, initial-scale=1.0' }],
    ['meta', { name: 'theme-color', content: '#3b82f6' }],
    ['meta', { charset: 'utf-8' }],

    // SEO meta tags
    ['meta', { name: 'keywords', content: 'ClickHouse, database management, AI SQL, natural language query, ClickHouse console, database admin, query optimization, ClickHouse GUI, ClickHouse web interface, SQL editor' }],
    ['meta', { name: 'author', content: 'DataStoria' }],
    ['meta', { name: 'robots', content: 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1' }],

    // Favicon and app icons
    ['link', { rel: 'icon', href: '/favicon.ico', sizes: 'any' }],
    ['link', { rel: 'icon', href: '/icon.svg', type: 'image/svg+xml' }],
    ['link', { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' }],
    ['link', { rel: 'manifest', href: '/site.webmanifest' }],

    // Canonical URL (prevents duplicate content issues)
    ['link', { rel: 'canonical', href: 'https://docs.datastoria.app/' }],

    // Open Graph tags for social sharing (Facebook, LinkedIn, etc.)
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:site_name', content: 'DataStoria Documentation' }],
    ['meta', { property: 'og:title', content: 'DataStoria - AI-Powered ClickHouse Management Console' }],
    ['meta', { property: 'og:description', content: 'Modern ClickHouse management console with AI-powered natural language queries, intelligent optimization, and advanced cluster management capabilities.' }],
    ['meta', { property: 'og:url', content: 'https://docs.datastoria.app/' }],
    ['meta', { property: 'og:image', content: 'https://docs.datastoria.app/og-image.png' }],
    ['meta', { property: 'og:image:width', content: '1200' }],
    ['meta', { property: 'og:image:height', content: '630' }],
    ['meta', { property: 'og:image:alt', content: 'DataStoria - AI-Powered ClickHouse Management Console' }],
    ['meta', { property: 'og:locale', content: 'en_US' }],

    // Twitter Card tags
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    ['meta', { name: 'twitter:site', content: '@datastoria' }],
    ['meta', { name: 'twitter:title', content: 'DataStoria - AI-Powered ClickHouse Management Console' }],
    ['meta', { name: 'twitter:description', content: 'Modern ClickHouse management console with AI-powered natural language queries, intelligent optimization, and advanced cluster management.' }],
    ['meta', { name: 'twitter:image', content: 'https://docs.datastoria.app/og-image.png' }],
    ['meta', { name: 'twitter:image:alt', content: 'DataStoria - AI-Powered ClickHouse Management Console' }],

    // Additional SEO enhancements
    ['meta', { name: 'format-detection', content: 'telephone=no' }],
    ['meta', { name: 'application-name', content: 'DataStoria' }],
    ['meta', { name: 'mobile-web-app-capable', content: 'yes' }],
    ['meta', { name: 'apple-mobile-web-app-capable', content: 'yes' }], // Keep for iOS compatibility
    ['meta', { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' }],
    ['meta', { name: 'apple-mobile-web-app-title', content: 'DataStoria' }],

    // Structured Data (JSON-LD) for rich search results
    ['script', { type: 'application/ld+json' }, JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'DataStoria',
      applicationCategory: 'DatabaseApplication',
      operatingSystem: 'Web Browser',
      description: 'AI-powered ClickHouse management console with natural language queries, intelligent optimization, and advanced cluster management capabilities.',
      url: 'https://datastoria.app',
      image: 'https://docs.datastoria.app/og-image.png',
      author: {
        '@type': 'Organization',
        name: 'DataStoria',
        url: 'https://datastoria.app'
      },
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD'
      },
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: '5',
        ratingCount: '1'
      },
      softwareVersion: '1.0',
      releaseNotes: 'https://docs.datastoria.app/manual/',
      screenshot: 'https://docs.datastoria.app/demo.webm',
      featureList: [
        'Natural Language to SQL conversion',
        'AI-powered query optimization',
        'Intelligent data visualization',
        'Multi-cluster management',
        'Real-time performance monitoring',
        'Advanced SQL editor with syntax highlighting',
        'Query explain visualization',
        'System log introspection',
        'Privacy-first architecture'
      ]
    })],

    // Breadcrumb structured data
    ['script', { type: 'application/ld+json' }, JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          name: 'Home',
          item: 'https://docs.datastoria.app/'
        },
        {
          '@type': 'ListItem',
          position: 2,
          name: 'Documentation',
          item: 'https://docs.datastoria.app/manual/'
        }
      ]
    })],

    // Organization structured data
    ['script', { type: 'application/ld+json' }, JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'DataStoria',
      url: 'https://datastoria.app',
      logo: 'https://docs.datastoria.app/logo.png',
      sameAs: [
        'https://github.com/FrankChen021/datastoria'
      ],
      contactPoint: {
        '@type': 'ContactPoint',
        contactType: 'Customer Support',
        url: 'https://github.com/FrankChen021/datastoria/issues'
      }
    })],

    // WebSite structured data for search box
    ['script', { type: 'application/ld+json' }, JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'DataStoria Documentation',
      url: 'https://docs.datastoria.app',
      potentialAction: {
        '@type': 'SearchAction',
        target: {
          '@type': 'EntryPoint',
          urlTemplate: 'https://docs.datastoria.app/?q={search_term_string}'
        },
        'query-input': 'required name=search_term_string'
      }
    })],

    // Preconnect to CDN for faster resource loading
    ['link', { rel: 'preconnect', href: 'https://cdn.jsdelivr.net', crossorigin: '' }],
    ['link', { rel: 'dns-prefetch', href: 'https://cdn.jsdelivr.net' }],

    // Mermaid for diagrams - Load asynchronously to avoid render blocking
    ['script', {
      src: 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js',
      async: '',
      defer: ''
    }],
    ['script', {}, `
      (function() {
        let mermaidInitialized = false;
        let mermaidLoaded = false;
        
        // Lazy load Mermaid only when needed (when mermaid diagrams are present)
        function checkAndLoadMermaid() {
          const hasMermaid = document.querySelector('.mermaid');
          if (hasMermaid && !mermaidLoaded) {
            mermaidLoaded = true;
            initMermaid();
          }
        }
        
        function initMermaid() {
          if (typeof window.mermaid === 'undefined') {
            // Wait for script to load
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
          if (mermaidElements.length === 0) return;
          
          mermaidElements.forEach((element, index) => {
            const id = 'mermaid-' + Date.now() + '-' + index + '-' + Math.random().toString(36).substr(2, 9);
            // Get the text content and unescape HTML entities
            let code = (element.textContent || element.innerText || '').trim();
            code = code
              .replace(/&amp;/g, '&')
              .replace(/&lt;/g, '<')
              .replace(/&gt;/g, '>')
              .replace(/&quot;/g, '"')
              .replace(/&#39;/g, "'");
            
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
        
        // Use Intersection Observer for lazy loading (better performance)
        if ('IntersectionObserver' in window) {
          const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
              if (entry.isIntersecting && entry.target.classList.contains('mermaid')) {
                checkAndLoadMermaid();
                observer.unobserve(entry.target);
              }
            });
          }, { rootMargin: '50px' });
          
          // Observe mermaid elements when DOM is ready
          function observeMermaidElements() {
            document.querySelectorAll('.mermaid:not([data-processed])').forEach((el) => {
              observer.observe(el);
            });
          }
          
          if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', observeMermaidElements);
          } else {
            observeMermaidElements();
          }
          
          // Re-observe on route changes (VitePress SPA navigation)
          if (typeof window !== 'undefined') {
            const mutationObserver = new MutationObserver(() => {
              observeMermaidElements();
            });
            
            setTimeout(() => {
              if (document.body) {
                mutationObserver.observe(document.body, { 
                  childList: true, 
                  subtree: true 
                });
              }
            }, 100);
          }
        } else {
          // Fallback for browsers without IntersectionObserver
          if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', checkAndLoadMermaid);
          } else {
            checkAndLoadMermaid();
          }
        }
      })();
    `],
  ],

  // SEO: Automatic sitemap generation
  sitemap: {
    hostname: 'https://docs.datastoria.app',
    lastmodDateOnly: false, // Include time in lastmod
    transformItems: (items) => {
      // Add priority and changefreq to sitemap items
      return items.map((item) => {
        // Homepage gets highest priority
        if (item.url === '/') {
          return { ...item, priority: 1.0, changefreq: 'weekly' }
        }
        // Manual pages get high priority
        if (item.url.startsWith('/manual/')) {
          return { ...item, priority: 0.8, changefreq: 'weekly' }
        }
        // Other pages get standard priority
        return { ...item, priority: 0.5, changefreq: 'monthly' }
      })
    }
  },

  // SEO: Last updated dates (helps search engines understand content freshness)
  lastUpdated: true,

  // SEO: Generate meta tags for each page
  transformPageData(pageData) {
    const canonicalUrl = `https://docs.datastoria.app/${pageData.relativePath}`
      .replace(/\/index\.md$/, '/')
      .replace(/\.md$/, '')

    pageData.frontmatter.head ??= []
    pageData.frontmatter.head.push([
      'link',
      { rel: 'canonical', href: canonicalUrl }
    ])

    // Add Open Graph URL for each page
    pageData.frontmatter.head.push([
      'meta',
      { property: 'og:url', content: canonicalUrl }
    ])

    // Add page-specific title and description to Open Graph
    if (pageData.title) {
      pageData.frontmatter.head.push([
        'meta',
        { property: 'og:title', content: `${pageData.title} | DataStoria Documentation` }
      ])
      pageData.frontmatter.head.push([
        'meta',
        { name: 'twitter:title', content: `${pageData.title} | DataStoria Documentation` }
      ])
    }

    if (pageData.description) {
      pageData.frontmatter.head.push([
        'meta',
        { property: 'og:description', content: pageData.description }
      ])
      pageData.frontmatter.head.push([
        'meta',
        { name: 'twitter:description', content: pageData.description }
      ])
    }
  },

  // SEO: Generate title template for better page titles
  titleTemplate: ':title | DataStoria Documentation',

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
            // Escape HTML entities in the content to prevent rendering issues
            const content = token.content
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#39;')
            // Return a pre tag with mermaid class - the script will process it
            return `<pre class="mermaid">${content}</pre>`
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
          text: 'AI-Powered Intelligence',
          collapsed: false,
          items: [
            { text: 'AI Model Configuration', link: '/manual/02-ai-features/ai-model-configuration' },
            { text: 'Natural Language Data Exploration', link: '/manual/02-ai-features/natural-language-sql' },
            { text: 'Query Optimization', link: '/manual/02-ai-features/query-optimization' },
            { text: 'Intelligent Visualization', link: '/manual/02-ai-features/intelligent-visualization' },
            { text: 'Ask AI for Help', link: '/manual/02-ai-features/ask-ai-for-help' },
            { text: 'Agent Skills', link: '/manual/02-ai-features/skills' },
            { text: 'GitHub Copilot Integration', link: '/manual/02-ai-features/github-copilot' },
          ]
        },
        {
          text: 'Query Experience',
          collapsed: false,
          items: [
            { text: 'SQL Editor', link: '/manual/03-query-experience/sql-editor' },
            { text: 'Query Execution', link: '/manual/03-query-experience/query-execution' },
            { text: 'Query Explain', link: '/manual/03-query-experience/query-explain' },
            { text: 'Query Log Inspector', link: '/manual/03-query-experience/query-log-inspector' },
            { text: 'Error Diagnostics', link: '/manual/03-query-experience/error-diagnostics' },
          ]
        },
        {
          text: 'Database Management',
          collapsed: false,
          items: [
            { text: 'Schema Explorer', link: '/manual/04-cluster-management/schema-explorer' },
            {
              text: 'Database & Table Views',
              collapsed: false,
              items: [
                { text: 'Database View', link: '/manual/04-cluster-management/database-view' },
                { text: 'Table View', link: '/manual/04-cluster-management/table-view' },
                { text: 'Dependency View', link: '/manual/04-cluster-management/dependency-view' },
              ]
            },
            {
              text: 'System Log Introspection',
              collapsed: false,
              items: [
                { text: 'Overview', link: '/manual/04-cluster-management/system-log-introspection' },
                { text: 'system.ddl_distribution_queue', link: '/manual/04-cluster-management/system-ddl-distributed-queue' },
                { text: 'system.part_log', link: '/manual/04-cluster-management/system-part-log' },
                { text: 'system.query_log', link: '/manual/04-cluster-management/system-query-log' },
                { text: 'system.query_views_log', link: '/manual/04-cluster-management/system-query-views-log' },
                { text: 'system.processes', link: '/manual/04-cluster-management/system-processes' },
              ]
            },
          ]
        },
        {
          text: 'Monitoring & Dashboards',
          collapsed: false,
          items: [
            { text: 'Node Dashboard', link: '/manual/05-monitoring-dashboards/node-dashboard' },
            { text: 'Cluster Dashboard', link: '/manual/05-monitoring-dashboards/cluster-dashboard' },
          ]
        },
        {
          text: 'Security & Privacy',
          collapsed: false,
          items: [
            { text: 'Privacy Features', link: '/manual/06-security-privacy/privacy-features' },
          ]
        }
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
      copyright: 'Copyright © 2025 DataStoria'
    },
  },

  // Performance optimizations
  vite: {
    build: {
      // Enable minification with esbuild (default, faster than terser)
      minify: 'esbuild',
      // Enable CSS code splitting
      cssCodeSplit: true,
      // Increase chunk size warning limit
      chunkSizeWarningLimit: 1000,
    },
    // Enable CSS preprocessing optimizations
    css: {
      devSourcemap: false,
    },
    // Drop console and debugger in production
    esbuild: {
      drop: ['console', 'debugger'],
    },
  },
})
