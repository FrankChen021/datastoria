# DataStoria

An AI-native ClickHouse console for query generation, evidence-based optimization, intelligent visualization, and cluster diagnostics.

![AI-Powered Features in Action](./docs/public/demo.webp)

---

## 🚀 Key Features

### 🤖 AI Features
- **[Natural Language Data Exploration](https://docs.datastoria.app/manual/02-ai-features/natural-language-sql)** — Describe your data needs in plain English and receive optimized ClickHouse queries instantly.
- **[Smart Query Optimization](https://docs.datastoria.app/manual/02-ai-features/query-optimization)** — AI inspects schema, validates SQL, collects evidence, and recommends concrete ClickHouse performance improvements.
- **[Intelligent Visualization](https://docs.datastoria.app/manual/02-ai-features/intelligent-visualization)** — Ask for a chart in plain language and DataStoria generates both the SQL and the visualization spec for time series, bar, pie, and table views.
- **[Agent SKILLs Supported](https://docs.datastoria.app/manual/02-ai-features/skills)** — Skill-based agent architecture that saves tokens across multi-turn conversations; apply the [Official ClickHouse Agent Skills](https://github.com/ClickHouse/agent-skills) to your ClickHouse
- **[Multiple Model Providers](https://docs.datastoria.app/manual/02-ai-features/ai-model-configuration)** — Use OpenAI, Anthropic Claude, Google Gemini, GitHub Copilot, OpenRouter, Groq, Cerebras, Nebius and more.
- **[GitHub Copilot Integration](https://docs.datastoria.app/manual/02-ai-features/github-copilot)** — Sign in with GitHub device flow and use your existing Copilot subscription for chat, query assistance, and other AI-powered workflows.


### ⚡ Powerful Query Experience
- **[Advanced SQL Editor](https://docs.datastoria.app/manual/03-query-experience/sql-editor)** — Enjoy syntax highlighting, auto-completion, and query formatting for a seamless coding experience.
- **[Smart Error Diagnostics](https://docs.datastoria.app/manual/03-query-experience/error-diagnostics)** — Pinpoint syntax errors instantly with precise line and column highlighting, and get AI-powered fix suggestions with one click.
- **[System Log Inspector](https://docs.datastoria.app/manual/04-cluster-management/system-log-introspection)** — Dive deep into query execution with timeline views, topology graphs, and performance analysis as well as Materialized Views, ZooKeeper states.
- **[One-Click Explain](https://docs.datastoria.app/manual/03-query-experience/query-explain)** — Instantly understand query execution plans with visual AST and pipeline views.
- **[Dependency Graph](https://docs.datastoria.app/manual/04-cluster-management/dependency-view)** — Visualize table relationships and trace data flows through Materialized Views, Distributed tables, and external systems.

### 📊 Cluster Monitoring & Management
- **[Multi-Cluster Support](https://docs.datastoria.app/manual/01-getting-started/introduction)** — Manage multiple ClickHouse clusters effortlessly from a single interface.
- **[Multi-Node Dashboard](https://docs.datastoria.app/manual/05-monitoring-dashboards/node-dashboard#dashboard-overview)** — Monitor all nodes with real-time metrics, merge operations, and replication status.
- **[Cluster wide Dashboards](https://docs.datastoria.app/manual/05-monitoring-dashboards/cluster-dashboard#cluster-dashboard-overview)** — Access pre-configured panels for query performance, ZooKeeper status, and more.
- **[Schema Explorer](https://docs.datastoria.app/manual/04-cluster-management/schema-explorer#examples)** — Navigate databases, tables, and columns with an intuitive tree view.

### 🔒 Privacy & Security
- **[100% Local Execution](https://docs.datastoria.app/manual/06-security-privacy/privacy-features)** — All SQL queries run directly from your browser to your ClickHouse server, ensuring complete privacy.
- **[No Data Collection](https://docs.datastoria.app/manual/06-security-privacy/privacy-features)** — Your credentials and query results never leave your machine.
- **[Bring Your Own API Key](https://docs.datastoria.app/manual/02-ai-features/ai-model-configuration)** — Use your own LLM API keys for AI features, keeping your data under your control.
- **Browser-Side Visualization Rendering** — For AI-generated visualizations, the model produces SQL and chart specs while your browser fetches and renders the data locally.

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

DataStoria is an AI-native ClickHouse console for modern query, visualization, and diagnostics workflows.
