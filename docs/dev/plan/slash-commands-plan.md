# Slash Commands Plan (v1)

## Context

DataStoria already supports AI skills that are loaded on demand by the V2 orchestrator. Users interact
with the agent through free-text chat; there is no structured way to invoke a specific skill directly
from the input box.

This plan introduces a **slash command** system that lets users type `/command_name [args]` in the
chat input to explicitly trigger a skill-backed workflow — without relying on the orchestrator to
infer the right skill from unstructured text.

The immediate motivating example is `/explain_error`, which should reliably trigger the
`clickhouse-error-diagnosis` skill instead of hoping the orchestrator picks it up from a plain error
message.

### Inspiration

Claude Code defines custom commands as markdown files in `.claude/commands/`. Each file is one
command; the filename is the command name; the body is a prompt template. This plan follows the same
pattern but co-locates each command definition with the skill it invokes — keeping the skill folder
self-contained.

### Current Architecture

Relevant primitives already in place:


| Layer                                      | Location                                               | Responsibility                                         |
| ------------------------------------------ | ------------------------------------------------------ | ------------------------------------------------------ |
| `SkillManager`                             | `src/lib/ai/skills/skill-manager.ts`                   | Walks disk for `SKILL.md`, caches metadata and content |
| `SkillProvider` / `CompositeSkillProvider` | `src/lib/ai/skills/skill-provider.ts`                  | Storage-agnostic skill access                          |
| `skill` tool                               | `src/lib/ai/tools/server/skill-tool.ts`                | LLM-callable tool that loads a skill by name           |
| `ChatInputSuggestions`                     | `src/components/chat/input/chat-input-suggestions.tsx` | `@`-mention popover in the chat input                  |
| `chat-input.tsx`                           | `src/components/chat/input/chat-input.tsx`             | Textarea, `@` detection, submit handler                |


There are no slash commands anywhere today. The `@` mention system is the only structured input
trigger.

---

## Goal

1. Define a file-based convention for slash commands, co-located with skills.
2. Add a `CommandManager` that discovers and loads command definitions from disk.
3. Expose a `GET /api/ai/commands` endpoint so the frontend can list available commands.
4. Add `/` detection and a command suggestion popover to the chat input.
5. On submit, expand the matched command template before sending to the orchestrator.

---

## Non-Goals

- No per-command enable/disable controls in phase 1.
- No user-defined commands uploaded through the UI in phase 1.
- No sub-directories inside `command/` (flat only, no namespacing in phase 1).
- No backend changes to the orchestrator or skill-loading logic — the expansion happens entirely in
the frontend before `onSubmit` is called.
- No separate command palette UI outside the chat input.

---

## File System Convention

Each skill folder may optionally contain a `command/` subdirectory. Any `.md` file directly inside
that directory is a command definition. Subdirectories under `command/` are ignored in phase 1.

```
src/lib/ai/skills/
└── clickhouse-error-diagnosis/
    ├── SKILL.md
    ├── command/
    │   └── explain_error.md        ← defines /explain_error
    └── handbook/
        ├── 42-number-of-arguments-doesnt-match.md
        ├── 115-unknown-setting.md
        └── 241-memory-limit-exceeded.md
```

**Naming rules:**

- Command name = filename without `.md` extension (e.g. `explain_error.md` → `/explain_error`).
- Names must be valid identifiers: lowercase letters, digits, and underscores only. Names that do not
match this pattern are skipped with a warning.
- Names must be unique across all skills. If two skills define a command with the same name, the
first one discovered (alphabetical by skill folder name) wins, and a warning is logged.

**Excluded from skill loading:**

`SkillManager.walkDirsForSkillFiles()` collects files named exactly `SKILL.md`. The `command/`
subdirectory and its contents are already invisible to the skill loader — no change needed there.

---

## Command File Format

Each command file is a markdown document with optional YAML frontmatter.

```md
---
description: Diagnose a ClickHouse error code or DB::Exception message
---
Diagnose this ClickHouse error using the clickhouse-error-diagnosis skill: $ARGUMENTS
```

### Frontmatter fields


| Field         | Required    | Description                                                                                 |
| ------------- | ----------- | ------------------------------------------------------------------------------------------- |
| `description` | Recommended | One-line description shown in the suggestion popover. Falls back to empty string if absent. |


### Template body

The body of the file is the prompt template. `$ARGUMENTS` is replaced at submit time with
everything the user typed after the command name. Leading and trailing whitespace is trimmed before
substitution.

**Substitution rules:**

- If the user typed `/explain_error Code 42: ...`, `$ARGUMENTS` becomes `Code 42: ...`.
- If the user typed `/explain_error` with nothing after it, `$ARGUMENTS` becomes an empty string.
The expanded message is still sent; the orchestrator or skill can ask the user for the missing
information.
- If the template contains no `$ARGUMENTS` placeholder, the body is sent as-is regardless of
any trailing text.

---

## Information Model

### CommandCatalogItem

```ts
interface CommandCatalogItem {
  /** Slash command name derived from the filename (without .md). */
  name: string;
  /** One-line description from frontmatter `description` field. */
  description: string;
  /** Stable skill folder id this command belongs to. */
  skillId: string;
}
```

This is a compact shape — only what the popover and the API need. The full template is not included
in the list response; it is fetched on demand at submit time via a separate call (see API section).

### CommandDetail

```ts
interface CommandDetail extends CommandCatalogItem {
  /** Full prompt template (post-frontmatter body). */
  template: string;
}
```

---

## Backend

### CommandManager

New file: `src/lib/ai/commands/command-manager.ts`

Mirrors `SkillManager` in structure. Key responsibilities:

- **Root resolution**: Uses the same `SKILLS_ROOT_DIR` env variable and candidate paths as
`SkillManager` — no new environment variables.
- **Discovery**: Walks the skill root for `command/*.md` files (one level deep inside `command/`).
Skips dotfiles and non-`.md` files. Skips files in subdirectories of `command/`.
- **Parsing**: Uses `gray-matter` (already a dependency) to split frontmatter from body.
- **Validation**: Checks that the derived name matches `^[a-z][a-z0-9_]*$`. Logs and skips
non-conforming names. Logs a warning on duplicate names.
- **Caching**: In-memory cache, same `cache ??= buildCache()` pattern as `SkillManager`. Exposes
`clearCache()` for tests.
- **Size limit**: Reuses `MAX_SKILL_BYTES = 512KB` from `SkillManager`.
- **Safety**: `isSafeRelativePath` check on all resolved paths, same as `SkillManager`.

Public API:

```ts
class CommandManager {
  /** Return catalog metadata for all discovered commands, sorted by name. */
  static listCommands(): CommandCatalogItem[]

  /** Return full detail (including template) for a command by name. Returns null if not found. */
  static getCommand(name: string): CommandDetail | null

  /** Clear in-memory cache (tests and dev tooling). */
  static clearCache(): void
}
```

### API Endpoint

New file: `src/app/api/ai/commands/route.ts`

```
GET /api/ai/commands
```

Returns `CommandCatalogItem[]` — compact metadata only, no templates.

- `runtime = "nodejs"` (same as skills route — uses `fs`).
- `dynamic = "force-dynamic"`.
- Error response shape matches the skills route: `{ error: string }` with status 500.

A separate endpoint for fetching a single command's template is **not needed in phase 1**. The
frontend fetches the full command list on mount (it is small), and the template expansion can be
done client-side by calling a second endpoint lazily or by including the template in the list
response.

**Decision: include `template` in the list response.**

The total payload is small (a handful of commands, each with a short template). Avoiding a
round-trip on submit keeps the UX snappy and removes a failure mode. The list endpoint returns
`CommandDetail[]` (catalog + template) rather than `CommandCatalogItem[]`.

Updated response type:

```
GET /api/ai/commands  →  CommandDetail[]
```

---

## Frontend

### New component: `chat-input-commands.tsx`

`src/components/chat/input/chat-input-commands.tsx`

A slimmed-down command suggestion popover. Shares the same imperative handle interface as
`ChatInputSuggestions` so `chat-input.tsx` can delegate keyboard events to both refs uniformly:

```ts
interface ChatInputCommandsType {
  open: (searchQuery: string) => void
  close: () => void
  isOpen: () => boolean
  handleKeyDown: (e: React.KeyboardEvent) => boolean
}
```

Visual design:

- Single-column list (no grouped layout, no right-side description panel).
- Each row: `/command_name` in monospace, description in muted text beside it.
- Active row highlighted with `bg-accent`, same as `ChatInputSuggestions`.
- Keyboard: ArrowUp / ArrowDown to navigate, Enter to select, Escape to close.
- Commands are filtered by the text after `/` as the user types.
- Popover position: same anchor as `ChatInputSuggestions` — top of the input box, aligned left.

Data source: fetched once from `GET /api/ai/commands` on first open (lazy). Cached in component
state for the lifetime of the chat panel.

### Changes to `chat-input.tsx`

**State additions:**

```ts
const commandRef = React.useRef<ChatInputCommandsType>(null)
const [commands, setCommands] = React.useState<CommandDetail[]>([])
```

`**handleInputChange`:**

Add `/` detection alongside the existing `@` detection. The `/` trigger fires only when:

1. The text before the cursor starts with `/` (i.e. `/` is the first non-whitespace character of
  the entire input, not mid-message).
2. There are no spaces between `/` and the cursor (the user is still typing the command name).

```
/explain_er|        → open popover, filter = "explain_er"
/explain_error |    → close popover (space after name = done typing)
Hello /explain      → no popup (/ not at start)
```

When condition 1 passes and commands have not been fetched yet, fetch `GET /api/ai/commands` and
store in state.

When the user types a space after a complete command name, close the popover. The command name
portion is locked in; the user is now typing `$ARGUMENTS`.

`**handleKeyDown`:**

Delegate to `commandRef` before `suggestionRef`, since slash commands take precedence. The existing
`@`  delegation logic is unchanged.

`**handleSubmit`:**

Before calling `onSubmit(message)`, check whether the input starts with a recognized command:

```
1. Extract leading token: /([a-z][a-z0-9_]*)(.*)
2. Look up token in loaded commands list
3. If found: replace $ARGUMENTS in template with trimmed remainder, submit expanded string
4. If not found: submit raw input unchanged
```

This means unrecognized `/foo` inputs pass through silently — no error, no special treatment.

**Placeholder text update:**

```
Press Enter for new line, Cmd+Enter to send. Use @ to mention tables, / for commands.
```

---

## End-to-End Flow

```
User types:  /explain_error Code 42: ...

1. handleInputChange detects leading /
2. Popover opens, filters to "explain_error"
3. User hits Enter (or clicks the row)
4. Command name is confirmed; popover closes
5. User continues typing arguments (or already had them)
6. User presses Cmd+Enter to send
7. handleSubmit:
     template = "Diagnose this ClickHouse error using the
                 clickhouse-error-diagnosis skill: $ARGUMENTS"
     expanded = "Diagnose this ClickHouse error using the
                 clickhouse-error-diagnosis skill: Code 42: ..."
8. onSubmit(expanded) is called
9. Orchestrator receives the expanded message
10. Orchestrator calls skill(["clickhouse-error-diagnosis"])
11. Skill handbook for error 42 is followed
12. execute_sql fetches function signature
13. Diagnosis and fix are returned to the user
```

---

## File Changes Summary

### New Files


| File                                                                    | Purpose                                            |
| ----------------------------------------------------------------------- | -------------------------------------------------- |
| `src/lib/ai/skills/clickhouse-error-diagnosis/command/explain_error.md` | First command definition                           |
| `src/lib/ai/commands/command-manager.ts`                                | Discovers and caches command definitions from disk |
| `src/app/api/ai/commands/route.ts`                                      | `GET /api/ai/commands` — returns `CommandDetail[]` |
| `src/components/chat/input/chat-input-commands.tsx`                     | Slash command suggestion popover                   |


### Modified Files


| File                                       | Change                                                               |
| ------------------------------------------ | -------------------------------------------------------------------- |
| `src/components/chat/input/chat-input.tsx` | Add `/` detection, command ref, submit expansion, placeholder update |


---

## Open Questions


| Question                                                        | Notes                                                                                                                                                                                                                               |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Should the template be visible to the user before submit?**   | Could show a preview inline (e.g. ghost text) before Cmd+Enter. Adds complexity; skip for phase 1.                                                                                                                                  |
| **Should `/` mid-message be supported?**                        | No. Slash commands are a leading-character trigger only, consistent with Claude Code and opencode.                                                                                                                                  |
| **What if the user edits the expanded message before sending?** | The expansion happens on submit, not on selection. The raw `/command args` stays in the textarea; expansion is invisible. This is simpler and avoids confusion if the user edits the args after selecting a command.                |
| **How does this interact with `externalInput`?**                | External inputs (e.g. from query log) are plain strings; they never start with `/`. No conflict.                                                                                                                                    |
| **Phase 2: should commands appear in the Skills UI?**           | Yes — the Skills detail view could show the `command/` directory in its resource tree (it already walks all files in the skill folder). No extra work needed; `command/*.md` files will appear naturally once the tree is rendered. |


---

## Risks


| Risk                                                                   | Mitigation                                                                                                                                                                                              |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Name collision between skills from different folders                   | `CommandManager` logs a warning and keeps the first-discovered command. Phase 1 has only one skill with commands, so this is not a live risk.                                                           |
| Template produces a prompt that confuses the orchestrator              | Template author controls the wording. The `$ARGUMENTS` substitution is trivial string replacement with no sanitization concerns since both sides are user/author text.                                  |
| `GET /api/ai/commands` called on every keystroke                       | Fetched once on first `/` keystroke; cached in component state for the session.                                                                                                                         |
| `command/` directory confuses the skill resource tree in the Skills UI | The resource tree (`listSkillResources`) already lists all non-`SKILL.md` files. `command/explain_error.md` will appear as `command/explain_error.md` in the tree, which is informative, not confusing. |


