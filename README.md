# ClickHouse Console

An AI-powered ClickHouse database management console built with Next.js, React, and TypeScript.

## Features

- 🔐 **Optional Authentication** - Support for Google, GitHub, and Microsoft OAuth providers
- 🎨 **Modern UI** - Built with shadcn/ui components and Tailwind CSS
- 🌓 **Dark Mode** - Seamless theme switching
- 📊 **Database Management** - Query execution, schema browsing, and more
- 🔄 **Real-time Updates** - Live query results and monitoring
- 🐳 **Docker Support** - Easy deployment with Docker

## Prerequisites

- Node.js 20.9 or later
- npm or pnpm
- Git

## Quick Start

### Local Development

1. **Clone the repository with submodules:**

```bash
# Clone with submodules
git clone --recurse-submodules https://github.com/your-org/clickhouse-console.git

# Or if already cloned, initialize submodules
git submodule update --init --recursive
```

> **Note**: This project uses git submodules for external dependencies (`cmdk` and `number-flow`). Make sure to fetch them before building.

2. **Install dependencies:**

```bash
npm install
```

3. **Run the development server:**

```bash
npm run dev
```

4. **Open your browser:**

Navigate to [http://localhost:3000](http://localhost:3000)

### Docker Deployment

> **Important**: Make sure git submodules are initialized before building the Docker image.

#### Build and Run with Docker

```bash
# Initialize submodules (if not already done)
git submodule update --init --recursive

# Build the Docker image
docker build -t clickhouse-console -f docker/Dockerfile .

# Run the container
docker run -p 3000:3000 clickhouse-console
```

#### Using Docker Compose

```bash
# Start the application
docker-compose -f docker/docker-compose.yml up -d

# Stop the application
docker-compose -f docker/docker-compose.yml down
```

#### Build for Production

```bash
# Ensure submodules are initialized
git submodule update --init --recursive

# Build for production
npm run build

# Start production server
npm start
```

## Troubleshooting

### Submodule Issues

If you encounter build errors related to missing dependencies:

```bash
# Update submodules to latest
git submodule update --remote --recursive

# Or reset submodules
git submodule deinit -f --all
git submodule update --init --recursive
```

### External Dependencies

This project includes these external dependencies as git submodules:
- `external/cmdk` - Command palette component
- `external/number-flow` - Number animation library

If you're missing these directories, run:
```bash
git submodule update --init --recursive
```

## Authentication Setup (Optional)

ClickHouse Console supports optional authentication with OAuth providers. See [doc/dev/authentication.md](./doc/dev/authentication.md) for detailed setup instructions.

**Quick setup:**

1. Copy the environment template:
```bash
cp .env.example .env
```

2. Configure your OAuth providers in `.env`

3. Restart the development server

If no authentication is configured, the app will run without requiring login.

## Environment Variables

See `.env.example` for all available configuration options including:
- OAuth provider credentials (Google, GitHub, Microsoft)
- NextAuth secret key
- Custom application settings

## Documentation

- [Authentication Guide](./doc/dev/authentication.md) - Detailed OAuth setup instructions
- [Quick Start Guide](./doc/dev/authentication-quickstart.md) - Fast authentication setup

