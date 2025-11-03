import { defineConfig, Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { TanStackRouterVite } from '@tanstack/router-vite-plugin'
import path from 'path'

// Plugin to handle ace-builds webpack-resolver issues
function aceBuildsPlugin(): Plugin {
  return {
    name: 'ace-builds-fix',
    enforce: 'pre',
    resolveId(id, importer) {
      // Handle file-loader requires (webpack-specific, not needed in Vite)
      if (id.includes('file-loader')) {
        // Extract the actual file path from the loader syntax
        const match = id.match(/file-loader[^!]*!(.+)$/);
        if (match) {
          // Return the actual file path instead of the loader
          return match[1];
        }
        // For plain file-loader references, return empty module
        return '\0file-loader-stub';
      }
      // Ignore webpack-resolver imports
      if (id.includes('webpack-resolver') && importer?.includes('ace-builds')) {
        return '\0webpack-resolver-stub';
      }
      return null;
    },
    load(id) {
      // Provide stubs for webpack loaders
      if (id === '\0file-loader-stub' || id === '\0webpack-resolver-stub') {
        return 'export default {};';
      }
      return null;
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), TanStackRouterVite(), aceBuildsPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  optimizeDeps: {
    include: ['@mui/material', '@emotion/react', '@emotion/styled', 'sql-formatter'],
  },
  build: {
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
  test: {
    globals: true,
    environment: 'node',
  },
})
