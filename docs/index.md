---
layout: home
title: DataStoria - AI-native ClickHouse Console
titleTemplate: false
description: AI-native ClickHouse console with natural-language SQL, evidence-based optimization, intelligent visualization, bring-your-own model support, and advanced cluster management.

head:
  - - meta
    - name: keywords
      content: ClickHouse management, AI SQL queries, natural language database, ClickHouse console, database GUI, SQL optimization, ClickHouse web interface, cluster management, database admin tool
  - - meta
    - property: og:type
      content: website
  - - meta
    - property: og:title
      content: DataStoria - AI-native ClickHouse Console
  - - meta
    - property: og:description
      content: AI-native ClickHouse console with natural-language SQL, visualization, bring-your-own model support, and advanced cluster management.
  - - meta
    - property: og:image
      content: https://docs.datastoria.app/og-image.png
  - - meta
    - name: twitter:title
      content: DataStoria - AI-native ClickHouse Console
  - - meta
    - name: twitter:description
      content: AI-native ClickHouse console with natural-language SQL, visualization, bring-your-own model support, and advanced cluster management.

hero:
  name: DataStoria
  text: AI-native ClickHouse Console
  tagline: Natural-language SQL, evidence-based optimization, AI-generated visualizations, and bring-your-own model support for ClickHouse teams.
  actions:
    - theme: brand
      text: Experience the App
      link: https://datastoria.app
    - theme: alt
      text: Read Documentation
      link: /manual/
    - theme: alt
      text: View on GitHub
      link: https://github.com/FrankChen021/datastoria

features:
  - icon: 🤖
    title: AI Features
    details: Turn plain-language questions into ClickHouse SQL, optimization guidance, and cluster insights with your choice of models from OpenAI, Anthropic, Gemini, GitHub Copilot, OpenRouter, Groq, Cerebras, Nebius, Compass, and more.
  - icon: ⚡
    title: Powerful Query Experience
    details: Advanced SQL editor with syntax highlighting, auto-completion, smart error diagnostics, and query explain visualization for optimal performance.
  - icon: 🔍
    title: Advanced Cluster Management
    details: Monitor and manage multiple ClickHouse clusters from a unified interface. Real-time metrics, system log introspection, and comprehensive schema exploration.
  - icon: 🔒
    title: Privacy-First Architecture
    details: SQL executes directly from your browser to ClickHouse, and AI-generated visualizations render in the browser from generated SQL and chart specs. Your credentials and query results stay under your control.
  - icon: 📊
    title: Intelligent Visualization
    details: Ask for charts in plain language and DataStoria generates both the SQL and the visualization spec for time series, bar, pie, and table views in seconds.
  - icon: 🔑
    title: Bring Your Own Model
    details: Connect your own provider keys, choose the models that fit your workload, and avoid lock-in while keeping AI configuration under your control.
  - icon: 🚀
    title: Modern Web Interface
    details: Built with cutting-edge web technologies for a fast, responsive experience. Works seamlessly across desktop and mobile devices with no installation required.

---

<FeatureCarousel
  :items="[
    {
      title: 'Overview Demo',
      description: 'A quick walkthrough of the core AI-native workflow across querying, visualization, and diagnostics.',
      src: '/demo.webm',
      alt: 'DataStoria demo showing natural-language queries, intelligent visualizations, and cluster management',
      href: '/manual/01-getting-started/introduction',
      kind: 'video'
    },
    {
      title: 'Intelligent Visualization',
      description: 'Generate SQL and chart specifications together so the browser can render charts directly from ClickHouse results.',
      src: '/manual/02-ai-features/img/visualization-example-4.jpg',
      alt: 'DataStoria AI-generated visualization for ClickHouse metrics',
      href: '/manual/02-ai-features/intelligent-visualization'
    },
    {
      title: 'Query Analysis',
      description: 'Inspect execution behavior with rich query views, timelines, and topology-based analysis for production troubleshooting.',
      src: '/manual/03-query-experience/img/query-log-inspector-timeline.jpg',
      alt: 'DataStoria query log inspector timeline view',
      href: '/manual/03-query-experience/query-log-inspector'
    },
    {
      title: 'Dependency View',
      description: 'Visualize upstream and downstream relationships across tables, materialized views, and other database objects.',
      src: '/manual/04-cluster-management/img/dependency-view-database.jpg',
      alt: 'DataStoria dependency view showing database object relationships',
      href: '/manual/04-cluster-management/dependency-view'
    },
    {
      title: 'System Table Introspection',
      description: 'Explore ClickHouse system tables with dedicated views for query logs, part logs, process lists, ZooKeeper state, and other operational datasets.',
      src: '/manual/04-cluster-management/img/system-query-log-1.jpg',
      alt: 'DataStoria system table introspection view with charts and operational details',
      href: '/manual/04-cluster-management/system-log-introspection'
    },
    {
      title: 'Node Dashboard',
      description: 'Open prebuilt dashboards for node-level metrics to investigate performance and health quickly.',
      src: '/manual/05-monitoring-dashboards/img/dashboard-node-status.jpg',
      alt: 'DataStoria node dashboard with ClickHouse node metrics',
      href: '/manual/05-monitoring-dashboards/node-dashboard'
    },
    {
      title: 'Cluster Dashboard',
      description: 'Monitor cluster-wide metrics with dedicated dashboards for multi-node health and performance.',
      src: '/manual/05-monitoring-dashboards/img/dashboard-cluster-status.jpg',
      alt: 'DataStoria cluster dashboard with ClickHouse cluster metrics',
      href: '/manual/05-monitoring-dashboards/cluster-dashboard'
    }
  ]"
/>
