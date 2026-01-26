import "@/index.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'https://datastoria.app'),
  title: {
    default: "DataStoria - AI-Powered ClickHouse Management Console",
    template: "%s | DataStoria",
  },
  description: "Modern ClickHouse management console with AI-powered natural language queries, intelligent optimization, and advanced cluster management. Transform how you interact with ClickHouse databases.",
  keywords: [
    "ClickHouse",
    "database management",
    "AI SQL",
    "natural language query",
    "ClickHouse console",
    "database admin",
    "query optimization",
    "ClickHouse GUI",
    "ClickHouse web interface",
    "SQL editor",
    "data visualization",
    "cluster management",
  ],
  authors: [{ name: "DataStoria" }],
  creator: "DataStoria",
  publisher: "DataStoria",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  icons: {
    icon: "/logo.png",
    apple: "/logo.png",
  },
  manifest: "/site.webmanifest",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "/",
    siteName: "DataStoria",
    title: "DataStoria - AI-Powered ClickHouse Management Console",
    description: "Modern ClickHouse management console with AI-powered natural language queries, intelligent optimization, and advanced cluster management.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "DataStoria - AI-Powered ClickHouse Management Console",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: "@datastoria",
    creator: "@datastoria",
    title: "DataStoria - AI-Powered ClickHouse Management Console",
    description: "Modern ClickHouse management console with AI-powered natural language queries and intelligent optimization.",
    images: ["/og-image.png"],
  },
  alternates: {
    canonical: "/",
  },
  other: {
    "application-name": "DataStoria",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'DataStoria',
    applicationCategory: 'DatabaseApplication',
    operatingSystem: 'Web Browser',
    description: 'AI-powered ClickHouse management console with natural language queries, intelligent optimization, and advanced cluster management capabilities.',
    url: 'https://datastoria.app',
    author: {
      '@type': 'Organization',
      name: 'DataStoria',
      url: 'https://datastoria.app',
    },
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
    featureList: [
      'Natural Language to SQL conversion',
      'AI-powered query optimization',
      'Intelligent data visualization',
      'Multi-cluster management',
      'Real-time performance monitoring',
      'Advanced SQL editor with syntax highlighting',
      'Query explain visualization',
      'System log introspection',
      'Privacy-first architecture',
    ],
  };

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Structured Data for SEO */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        {/* Passive event listeners polyfill - must run before any libraries load
         * Eliminate such warning in the console: [Violation] Added non-passive event listener to a scroll-blocking <some> event. Consider marking event handler as 'passive' to make the page more responsive
         */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                if (typeof EventTarget === 'undefined') return;
                var PASSIVE_EVENTS = ['wheel', 'mousewheel', 'touchstart', 'touchmove', 'touchend', 'touchcancel'];
                var original = EventTarget.prototype.addEventListener;
                EventTarget.prototype.addEventListener = function(type, listener, options) {
                  if (PASSIVE_EVENTS.indexOf(type) !== -1) {
                    var newOptions;
                    if (options === undefined || options === null) {
                      newOptions = { passive: true };
                    } else if (typeof options === 'boolean') {
                      newOptions = { capture: options, passive: true };
                    } else if (options.passive === false) {
                      newOptions = options;
                    } else {
                      newOptions = Object.assign({}, options, { passive: true });
                    }
                    return original.call(this, type, listener, newOptions);
                  }
                  return original.call(this, type, listener, options);
                };
              })();
            `,
          }}
        />
        {/* Avoid Theme inconsistancy under SSR which causes the screen splash */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                const storageKey = 'datastoria:settings:ui:theme';
                const theme = localStorage.getItem(storageKey) || 'dark';
                const root = document.documentElement;
                root.classList.remove('light', 'dark');
                if (theme === 'system') {
                  const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
                  root.classList.add(systemTheme);
                } else {
                  root.classList.add(theme);
                }
              } catch (e) {
                // Ignore errors
              }
            `,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
