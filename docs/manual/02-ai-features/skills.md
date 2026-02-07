---
title: ClickHouse Skills for AI Agents
description: Understand what Skills are in DataStoria, their benefits, and how ClickHouse official skills improve AI-driven ClickHouse workflows.
head:
  - - meta
    - name: keywords
      content: ClickHouse skills, agent skills, AI skills, DataStoria skills, ClickHouse AI, reusable workflows, token efficiency, ClickHouse agent skills
---

# Skill based Agent architecture

Skills are reusable, task-focused building blocks that guide AI behavior in DataStoria. They help the assistant follow consistent workflows, apply ClickHouse-specific knowledge, and deliver reliable results for common tasks.

## Benefits of Skills

- **Token efficiency**: Skills compress repeated instructions into a single, reusable unit.
- **Consistent outcomes**: Standardized steps reduce variability across similar tasks.
- **Domain accuracy**: ClickHouse-specific guidance improves query and diagnostic quality.
- **Faster onboarding**: Teams can share proven workflows without rewriting prompts.
- **Safer automation**: Skills can enforce guardrails and best-practice constraints.

## ClickHouse Official Skills Supported

ClickHouse maintains an official Skills collection designed for AI assistants working with ClickHouse. These Skills provide high-level, domain-aware workflows for tasks like query exploration, performance tuning, and operational guidance, without requiring users to craft detailed prompts each time.

You can review the official catalog at:

- **ClickHouse Agent Skills**: https://github.com/ClickHouse/agent-skills

## Use Skills in DataStoria

The agent automatically applies skills based on users' requests.

For example, if you ask such question:

```text
Visualize the number of commits in 2021 Feb by day in line chart
```

The agent will automatically loads the `Visualization` skill while other skills like `Optimization` will not be loaded.

If you want to apply the official SKILLs, you can add 'best practice' keyword in your question to activate such skill. For example:

```text
Apply the best practice to review the table: default.sampel_table
```

## Next Step

To enable AI features, complete your model setup:

- [AI Model Configuration](./ai-model-configuration.md)
