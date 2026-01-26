# DataStoria

A modern, AI-powered ClickHouse management console that transforms how you interact with your data and manage your clusters.

![AI-Powered Features in Action](./docs/public/demo.webp)

---

## 🚀 Key Features

### 🤖 AI-Powered Intelligence
- **Natural Language Data Exploration** — Describe your data needs in plain English and receive optimized ClickHouse queries instantly.
- **Smart Query Optimization** — AI analyzes your queries based on evidence and provides actionable performance improvements.
- **Intelligent Visualization** — Generate stunning visualizations like time series, pie charts, and data tables with simple prompts.

### ⚡ Powerful Query Experience
- **Advanced SQL Editor** — Enjoy syntax highlighting, auto-completion, and query formatting for a seamless coding experience.
- **Smart Error Diagnostics** — Pinpoint syntax errors instantly with precise line and column highlighting, and get AI-powered fix suggestions with one click.
- **Query Log Inspector** — Dive deep into query execution with timeline views, topology graphs, and performance analysis.
- **One-Click Explain** — Instantly understand query execution plans with visual AST and pipeline views.
- **Dependency Graph** — Visualize table relationships and trace data flows through Materialized Views, Distributed tables, and external systems.

### 📊 Cluster Monitoring & Management
- **Multi-Cluster Support** — Manage multiple ClickHouse clusters effortlessly from a single interface.
- **Multi-Node Dashboard** — Monitor all nodes with real-time metrics, merge operations, and replication status.
- **Built-in Dashboards** — Access pre-configured panels for query performance, ZooKeeper status, and more.
- **Schema Explorer** — Navigate databases, tables, and columns with an intuitive tree view.

### 🔒 Privacy & Security
- **100% Local Execution** — All SQL queries run directly from your browser to your ClickHouse server, ensuring complete privacy.
- **No Data Collection** — Your credentials and query results never leave your machine.
- **Bring Your Own API Key** — Use your own LLM API keys for AI features, keeping your data under your control.

---

## 🌐 Experience the app

Visiting [dataStoria.app](https://datastoria.app) to experience all features without any installation.

---

## 🛠️ Build from Source

**Prerequisites:**
- [Node.js](https://nodejs.org/) v22 or later
- [pnpm](https://pnpm.io/) (install via `npm install -g pnpm`)

Follow these steps to build and run locally:

```bash
# Clone the repository
git clone --recurse-submodules https://github.com/FrankChen021/datastoria.git
cd datastoria

# Install dependencies
npm install --force

# Start the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser and connect to your ClickHouse instance.

---

## 🐳 Running with Docker

The easiest way to run DataStoria is using the pre-built Docker image:

```bash
docker run -d -p 3000:3000 frankchen021/datastoria:latest
```

Then open [http://localhost:3000](http://localhost:3000) in your browser.

The Docker image supports both `linux/amd64` and `linux/arm64` platforms, so it runs natively on Intel/AMD machines as well as Apple Silicon Macs and ARM-based servers.

---

## 📖 Documentation

### User Manual

- [User Manual](https://docs.datastoria.app)

### Development
- [Docker Deployment](./docker/README.md) — Build and run with Docker
- [LLM Provider API Key Configuration](./doc/dev/llm-provider-api-key.md) — Configure API keys for your LLM provider
- [Authentication Guide](./doc/dev/authentication.md) — OAuth setup for Google, GitHub, and Microsoft

---

## 🧰 Tech Stack

- **Framework:** [Next.js](https://nextjs.org/) 16 with React 19
- **AI Integration:** [Vercel AI SDK](https://sdk.vercel.ai/) with support for OpenAI, Anthropic, Google, Groq, and more
- **Authentication:** [NextAuth.js](https://next-auth.js.org/)

---

## 📜 License

This project is licensed under the **Apache License 2.0**. See the [LICENSE](./LICENSE) file for details.

---

Elevate your ClickHouse experience with **DataStoria** — where data meets intelligence.
