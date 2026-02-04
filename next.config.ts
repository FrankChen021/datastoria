import path from 'node:path'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: false,
  transpilePackages: ['@number-flow/react', 'number-flow'],
  // Enable standalone output for Docker deployment
  output: 'standalone',
  // Increase body size limit for API routes to handle large tool results
  // (e.g., get_table_columns with 1500+ columns from system.metric_log)
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
    // Optimize barrel file imports for better performance
    // This transforms barrel imports to direct imports at build time
    optimizePackageImports: ['lucide-react'],
  },
  webpack: (config) => {
    // Bundle SKILL.md files as raw strings (build-time import, no runtime fs)
    const skillsDir = path.join(process.cwd(), 'src', 'lib', 'ai', 'skills')
    config.module.rules.push({
      test: /\/SKILL\.md$/,
      include: skillsDir,
      type: 'asset/source',
    })
    return config
  },
  turbopack: {
    rules: {
      '**/skills/**/SKILL.md': {
        loaders: ['raw-loader'],
        as: '*.js',
      },
    },
  },
}

export default nextConfig

