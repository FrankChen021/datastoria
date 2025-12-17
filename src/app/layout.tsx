import "@/index.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Data Scopic",
  description: "AI-powered ClickHouse database management console",
  icons: {
    icon: "/logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Avoid Theme inconsistancy under SSR which causes the screen splash */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                const storageKey = 'app-ui-theme';
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
