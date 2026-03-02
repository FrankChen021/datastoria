# AGENTS.md

This file defines repository-wide instructions for AI coding agents working in this project.

## Repository Overview

DataStoria is a Next.js 16 + React 19 application for ClickHouse query authoring, AI-assisted analysis, visualization, and cluster diagnostics.

Primary areas:
- `src/app`: App routes and API handlers
- `src/components`: UI and feature components
- `src/lib/ai`: agent, skills, tools, and model integration
- `docs`: VitePress documentation
- `external`: vendored or forked third-party packages
- `worktrees`: local worktrees for parallel feature branches; not part of the main app surface

## Scope Rules

- Apply these instructions for any change inside this repository unless a deeper `AGENTS.md` overrides them for a subdirectory.
- Prefer the smallest change that solves the problem; preserve existing patterns unless there is a clear defect or explicit request to refactor.
- Do not treat `external/` as ordinary application code. Only modify vendored dependencies when the task explicitly requires it.
- Do not modify `worktrees/` unless the user explicitly asks to work in a specific worktree.
- Do not commit generated build artifacts unless the repository already tracks them or the task explicitly requires them.

## Workflow Expectations

- Always work on a git worktree for any fix/features
- Before editing, inspect nearby files to match the local style, naming, and data flow.
- When behavior changes, update or add tests where practical instead of relying on explanation alone.
- After code changes, run the narrowest relevant validation first, then broaden only if needed.
- Mention any validation you could not run and any assumptions that remain unverified.

## Commands

Use the existing root scripts unless there is a documented reason not to:

- `npm run dev`: main development workflow
- `npm run build`: production build
- `npm run typecheck`: TypeScript validation
- `npm run lint`: ESLint
- `npm run test`: Vitest
- `npm run docs:build`: documentation build

Prefer targeted checks when possible, but do not invent alternate toolchains if the repository already provides a script.

## Code Change Rules

- Follow the existing TypeScript, React, and Next.js conventions already present in the touched area.
- Keep components and helpers focused; avoid mixing UI concerns, network logic, and ClickHouse-specific transformation logic in one place.
- Preserve public interfaces unless the task requires an API change. If you change an interface, update all local call sites in the same change.
- Avoid adding new dependencies unless they are clearly justified by the task and existing dependencies cannot reasonably solve it.
- Prefer explicit error handling and user-visible fallback states over silent failure.

## Frontend Rules

- Preserve the established UI patterns in `src/components` and existing Radix/MUI/Tailwind usage in the touched area.
- Ensure new UI works on both desktop and common narrow layouts.
- Avoid unnecessary client-side state duplication; prefer deriving view state from existing sources where practical.
- For changes in chat, query, or dashboard flows, verify loading, empty, error, and success states.

## API And Data Rules

- Keep server-only logic in server-capable locations; do not leak secrets or provider credentials into client code.
- Validate request inputs at route boundaries, especially in `src/app/api`.
- For ClickHouse-facing code, preserve correctness over convenience. Avoid changing query semantics unless the task explicitly calls for it.

## AI And Skills Rules

- Treat `src/lib/ai` and skill directories as instruction-sensitive code. Preserve prompt structure, tool contracts, and skill loading behavior unless the task is specifically about agent behavior.
- When changing skill files under `src/lib/ai/skills`, keep instructions concrete, minimal, and easy to load progressively.
- If a task involves ClickHouse schemas, queries, or configuration guidance, use the `clickhouse-best-practices` skill and follow its required review rules.

## Testing Guidance

- Minimum preferred validation for TypeScript code changes: `npm run typecheck`.
- For lint-sensitive edits, run `npm run lint`.
- For behavior changes with test coverage, run `npm run test` or the narrowest Vitest target available.
- For docs changes that affect the manual, run `npm run docs:build` when practical.
- For build-sensitive framework changes, run `npm run build` if the change could affect bundling, routing, or server/client boundaries.

## Documentation Rules

- Keep README and docs aligned with actual scripts, paths, and product behavior.
- Do not document features as complete unless the code path exists and is wired into the product.

## Change Review Checklist

Before finishing, verify:

- The change matches local patterns in the touched area.
- Imports, types, and call sites are consistent.
- Error and empty states are still coherent.
- Relevant validation has been run, or the gap is called out clearly.

## Commit Rules
- Only commit what you change
- Before creating a PR at GitHub, list all changed files on the branch and wait for user confirmation.
