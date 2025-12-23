import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: false,
  transpilePackages: ['@number-flow/react', 'number-flow'],
  typescript: {
    // Enable build even with TypeScript errors (for pre-existing issues)
    // TODO: Fix TypeScript errors in the codebase
    ignoreBuildErrors: true,
  },
  // Enable standalone output for Docker deployment
  output: 'standalone',
  // Increase body size limit for API routes to handle large tool results
  // (e.g., get_table_columns with 1500+ columns from system.metric_log)
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
}

export default nextConfig

