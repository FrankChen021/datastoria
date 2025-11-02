import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { ThemeProvider } from './components/theme-provider'
import { ToastProvider } from './components/toast-provider'
import { ConnectionProvider } from './lib/connection/ConnectionContext'
import './index.css'

// Import the generated route tree
import { routeTree } from './routeTree.gen'

// Create a new router instance
const router = createRouter({ routeTree })

// Register the router instance for type safety
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider defaultTheme="dark" storageKey="app-ui-theme">
      <ConnectionProvider>
        <ToastProvider />
        <RouterProvider router={router} />
      </ConnectionProvider>
    </ThemeProvider>
  </StrictMode>,
)
