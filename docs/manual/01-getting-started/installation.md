---
title: Installation & Setup
description: Install DataStoria ClickHouse console - hosted web app, Docker, or build from source. Quick setup guide for AI-powered database management with multiple deployment options.
head:
  - - meta
    - name: keywords
      content: DataStoria installation, ClickHouse console setup, install database GUI, Docker ClickHouse, ClickHouse management tool setup, build from source, hosted ClickHouse console
---

# Installation & Setup

This guide will help you install and set up DataStoria on your local machine or server.

## Use the Hosted Web Application

**No installation required!** You can start using DataStoria immediately by visiting [datastoria.app](https://datastoria.app), where a fully hosted web application is available.

### Sign In with Your Account

The hosted version supports easy authentication with:
- **Google** account sign-in
- **Microsoft** account sign-in
- **GitHub** account sign-in

Simply visit [datastoria.app](https://datastoria.app), click "Sign In", and choose your preferred authentication provider. Once signed in, you can immediately connect to your ClickHouse instance and start using all features without any local installation.

This is the fastest way to get started and is perfect for:
- Quick evaluation and testing
- Teams that prefer cloud-hosted solutions
- Users who don't want to manage local installations
- Accessing DataStoria from any device with a web browser


## Local Installation Options

If you prefer to run DataStoria locally or need more control over your deployment, choose from the installation options below.

## Prerequisites

Before installing DataStoria, ensure you have:

- **Node.js** v22 or later ([Download](https://nodejs.org/))
- **pnpm** package manager (install via `npm install -g pnpm`)
- Access to a ClickHouse instance (local or remote)
  - If you don't have ClickHouse instance, you can use the [ClickHouse Playground](https://play.clickhouse.com)

> **Tip**: After installation, you'll want to [configure AI features](../02-ai-features/ai-model-configuration.md) to unlock natural language querying and intelligent optimization.


## Installation Options

DataStoria offers multiple ways to get started:

### Option 1: Build from Source (Recommended for Development)

This option is ideal if you want to customize DataStoria or contribute to the project.

#### Step 1: Clone the Repository

```bash
# Clone the repository with submodules
git clone --recurse-submodules https://github.com/FrankChen021/datastoria.git
cd datastoria
```

If you've already cloned without submodules, initialize them:

```bash
git submodule update --init --recursive
```

#### Step 2: Install Dependencies

```bash
# Install all dependencies (this will also build required submodules)
npm install --force
```

This command will:
- Install all npm dependencies
- Build the `number-flow` core and React packages
- Build the `cmdk` command palette component

#### Step 3: Start the Development Server

```bash
# Start all development servers
npm run dev
```

This will start:
- The Next.js development server on `http://localhost:3000`
- Watch mode for number-flow core
- Watch mode for number-flow React
- Watch mode for cmdk

#### Step 4: Access DataStoria

Open your browser and navigate to `http://localhost:3000`.

### Option 2: Running with Docker

The easiest way to run DataStoria is using the pre-built Docker image. This is perfect for production deployments or quick testing.

#### Quick Start

```bash
# Run DataStoria using Docker
docker run -d -p 3000:3000 frankchen021/datastoria:latest
```

Then open `http://localhost:3000` in your browser.

#### Platform Support

The Docker image supports both `linux/amd64` and `linux/arm64` platforms, so it runs natively on:
- Intel/AMD machines
- Apple Silicon Macs (M1, M2, M3, etc.)
- ARM-based servers

#### Docker Compose (Optional)

For a more production-ready setup, you can use Docker Compose:

```yaml
version: '3.8'
services:
  datastoria:
    image: frankchen021/datastoria:latest
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
    restart: unless-stopped
```

Save this as `docker-compose.yml` and run:

```bash
docker-compose up -d
```

## Building for Production

If you've built from source and want to create a production build:

```bash
# Build the application
npm run build

# Start the production server
npm start
```

The production server will run on `http://localhost:3000` by default.

## Troubleshooting

### Common Issues

#### Port Already in Use

If port 3000 is already in use, you can change it:

```bash
# For Next.js
PORT=3001 npm run dev
```

#### Submodule Build Errors

If you encounter errors building submodules:

```bash
# Clean and rebuild
rm -rf node_modules
rm -rf external/number-flow/packages/*/node_modules
rm -rf external/cmdk/cmdk/node_modules
npm install --force
```

#### Docker Permission Issues

If you get permission errors with Docker:

```bash
# On Linux, add your user to the docker group
sudo usermod -aG docker $USER
# Then log out and log back in
```

## Next Steps

Once DataStoria is installed and running:

1. **[First Connection](./first-connection.md)** — Learn how to connect to your ClickHouse instance
2. **[AI Model Configuration](../02-ai-features/ai-model-configuration.md)** — Set up AI features with your API keys

## Additional Resources

- [GitHub Repository](https://github.com/FrankChen021/datastoria)
- [Docker Hub](https://hub.docker.com/r/frankchen021/datastoria)
- [Online Version](https://datastoria.app)

