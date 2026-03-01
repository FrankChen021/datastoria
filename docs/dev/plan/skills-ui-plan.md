# Skills UI Plan (v4)

## Context

ClickHouse Console already runs a skill-based agent in V2 mode. Skills are discovered from disk, loaded at runtime, and used to improve SQL generation, optimization, visualization, and ClickHouse-specific guidance. However, users still cannot easily answer three basic questions:

- What skills exist?
- What does each skill do?
- When is the agent using them?

The immediate product gap is **discoverability and observability**, not user extensibility.

### Current Architecture

The backend already has the core primitives:

- `SkillManager.listSkills()` returns dynamic skill metadata discovered from disk via frontmatter parsing
- `SkillManager.getSkill(name)` loads the full `SKILL.md` markdown content
- `SkillManager.getSkillResource(skill, path)` loads additional files (rules, AGENTS.md)
- `SkillTool` and `SkillResourceTool` expose skills as LLM-callable tools
- `MessageToolSkill` already renders a collapsible "Load Skills" widget in chat for skill tool invocations

Bundled skills today:

| Skill | Folder | Description |
|---|---|---|
| `sql-expert` | `sql-expert/` | SQL generation, validation, and optimization |
| `optimization` | `optimization/` | Slow query analysis and optimization recommendations |
| `visualization` | `visualization/` | Chart and graph generation |
| `clickhouse-best-practices` | `clickhouse/skills/clickhouse-best-practices/` | 28 schema, query, and insert rules (v0.3.0, by ClickHouse Inc) |

Relevant source files:

- [skill-manager.ts](file:///Users/frank.chenling/source/shopee/clickhouse-console/src/lib/ai/skills/skill-manager.ts)
- [skill-tool.ts](file:///Users/frank.chenling/source/shopee/clickhouse-console/src/lib/ai/tools/server/skill-tool.ts)
- [agent-edit.tsx](file:///Users/frank.chenling/source/shopee/clickhouse-console/src/components/settings/agent/agent-edit.tsx)
- [settings-registry.tsx](file:///Users/frank.chenling/source/shopee/clickhouse-console/src/components/settings/settings-registry.tsx)
- [settings-dialog.tsx](file:///Users/frank.chenling/source/shopee/clickhouse-console/src/components/settings/settings-dialog.tsx)
- [message-tool-skill.tsx](file:///Users/frank.chenling/source/shopee/clickhouse-console/src/components/chat/message/message-tool-skill.tsx)

## Goal

Add a UI surface that makes bundled AI skills visible and understandable to users, while keeping the data model and API stable enough to support user-provided skills (stored in a database) in a later phase.

## Non-Goals

- No user skill upload or import in phase 1
- No per-skill prompt editing
- No per-skill enable/disable controls in phase 1
- No separate marketplace or plugin hub
- No requirement to build polished renderers for every skill resource file in phase 1

## Product Direction

Phase 1 ships as a generic skills catalog UI. Even if only bundled skills exist initially, the data model, API, and layout must assume that future skills may come from different sources (disk for built-in, database for user-provided). This avoids a later rewrite.

## Confirmed UX Design

### Skills List View (Settings → AI → Skills)

A dedicated `Skills` item under the existing `AI` settings group. The settings sidebar structure:

```text
Settings
├─ SQL
│  └─ Query Context
└─ AI
   ├─ Agent
   ├─ Models
   └─ Skills  ← NEW
```

The main content area shows a compact 2×2 card grid of all bundled skills. Each card displays: skill name, one-line description, `Built-in` source badge, and optional version badge.

### Skill Detail View (Split Panel)

When a skill card is clicked, the detail view fills the main content area with a split-panel layout:

- **Left panel (~60%)** — Rendered `SKILL.md` content with a **Rendered / Raw toggle** at the top
- **Right panel (~40%)** — Directory layout showing the skill's sub-directory tree (files and folders)

The header shows the skill name, `Built-in` badge, version badge, and provider attribution when available.

### SKILL.md Render Toggle

The left panel header includes a small segmented toggle:

**Rendered mode** (default) — Markdown rendered as formatted HTML:

```
┌─ SKILL.md ──────────────────────────── [Rendered ▪ | Raw] ─┐
│                                                             │
│  # ClickHouse Best Practices                                │
│                                                             │
│  Comprehensive guidance for ClickHouse covering schema      │
│  design, query optimization, and data ingestion...          │
│                                                             │
│  ## IMPORTANT: How to Apply This Skill                      │
│  Before answering ClickHouse questions, follow this         │
│  priority order:                                            │
│  1. Check for applicable rules in the rules/ directory      │
│  2. If rules exist: Apply them and cite...                  │
└─────────────────────────────────────────────────────────────┘
```

**Raw mode** — Shows the file content as-is in a monospace `<pre>` block, including YAML frontmatter:

```
┌─ SKILL.md ──────────────────────────── [Rendered | Raw ▪] ─┐
│                                                             │
│  ---                                                        │
│  name: clickhouse-best-practices                            │
│  description: MUST USE when reviewing ClickHouse schemas... │
│  license: Apache-2.0                                        │
│  metadata:                                                  │
│    author: ClickHouse Inc                                   │
│    version: "0.3.0"                                         │
│  ---                                                        │
│                                                             │
│  # ClickHouse Best Practices                                │
│  ...                                                        │
└─────────────────────────────────────────────────────────────┘
```

This is especially useful for user-created skills in phase 2, where users may want to inspect or debug the raw frontmatter and content.

## Information Model

### SkillCatalogItem

```ts
type SkillSource = "built-in" | "user";
type SkillStatus = "available" | "disabled" | "invalid";

interface SkillCatalogItem {
  /** Stable identifier. Derived from folder name for built-in, generated for user skills. */
  id: string;
  /** Human-readable name from frontmatter `name` field. */
  name: string;
  /** One-line description from frontmatter `description` field. */
  description: string;
  /** Origin of the skill. Always "built-in" in phase 1. */
  source: SkillSource;
  /** Runtime status. Always "available" in phase 1. */
  status: SkillStatus;
  /** Optional version string from metadata frontmatter. */
  version?: string;
  /** Optional author/provider from metadata frontmatter. */
  provider?: string;
  /** Short summary paragraph extracted from the SKILL.md body. */
  summary?: string;
  /** Whether this skill has sub-resources (rules/*.md, AGENTS.md, etc.). */
  hasResources?: boolean;
}
```

### SkillDetailResponse

```ts
interface SkillDetailResponse extends SkillCatalogItem {
  /** Full SKILL.md content (raw markdown, including frontmatter for raw toggle). */
  content: string;
  /** Sub-directory file listing relative to skill root. */
  resourcePaths?: string[];
}
```

### Design Decisions

- **`id` derivation**: For built-in skills, `id` = leaf folder name via `path.basename(path.dirname(skillFile))`. This gives `"clickhouse-best-practices"`, not the full relative path. For user skills in phase 2, `id` will be generated (UUID or similar).
- **`source`**: Always `"built-in"` in phase 1. Set by each `SkillProvider` implementation.
- **`status`**: Always `"available"` in phase 1. Future phases add validation states.
- **`summary`**: Derived conservatively from the first non-heading paragraph of SKILL.md body. If extraction is fragile, omit it — this is a nice-to-have.
- **`content`**: The detail endpoint returns the **full raw markdown** (including frontmatter). The frontend decides whether to render it or show raw based on the toggle state.
- **`resourcePaths`**: Flat list of relative paths (e.g. `["AGENTS.md", "README.md", "metadata.json", "rules/insert-batch-size.md", ...]`). The frontend builds the directory tree from these paths.

## Storage-Agnostic API Architecture

The API must serve the same response shape regardless of whether skills come from disk or database. This is achieved through a `SkillProvider` abstraction.

### SkillProvider Interface

```ts
interface SkillProvider {
  /** Return catalog metadata for all skills from this source. */
  listSkills(): Promise<SkillCatalogItem[]>;

  /** Return full detail for a single skill, or null if not found. */
  getSkillDetail(id: string): Promise<SkillDetailResponse | null>;

  /** Return raw content of a sub-resource file, or null if not found. */
  getSkillResource(id: string, resourcePath: string): Promise<string | null>;
}
```

### Phase 1: DiskSkillProvider

Wraps the existing `SkillManager`. Reads skills from the filesystem.

```ts
class DiskSkillProvider implements SkillProvider {
  async listSkills(): Promise<SkillCatalogItem[]> {
    // Wraps SkillManager.listSkillCatalog()
    // Sets source = "built-in" for all items
  }

  async getSkillDetail(id: string): Promise<SkillDetailResponse | null> {
    // Wraps SkillManager.getSkill(id) for content
    // Enumerates skill directory for resourcePaths
  }

  async getSkillResource(id: string, resourcePath: string): Promise<string | null> {
    // Wraps SkillManager.getSkillResource(id, resourcePath)
  }
}
```

### Phase 2: DatabaseSkillProvider

Reads user-provided skills from the database.

```ts
class DatabaseSkillProvider implements SkillProvider {
  async listSkills(): Promise<SkillCatalogItem[]> {
    // SELECT from skills table
    // Sets source = "user" for all items
  }

  async getSkillDetail(id: string): Promise<SkillDetailResponse | null> {
    // SELECT skill content and resource listing from database
  }

  async getSkillResource(id: string, resourcePath: string): Promise<string | null> {
    // SELECT resource content from database
  }
}
```

### CompositeSkillProvider

Merges results from all registered providers. This is what the API routes call.

```ts
class CompositeSkillProvider implements SkillProvider {
  constructor(private providers: SkillProvider[]) {}

  async listSkills(): Promise<SkillCatalogItem[]> {
    const results = await Promise.all(this.providers.map(p => p.listSkills()));
    return results.flat().sort((a, b) => a.name.localeCompare(b.name));
  }

  async getSkillDetail(id: string): Promise<SkillDetailResponse | null> {
    for (const provider of this.providers) {
      const result = await provider.getSkillDetail(id);
      if (result) return result;
    }
    return null;
  }

  async getSkillResource(id: string, resourcePath: string): Promise<string | null> {
    for (const provider of this.providers) {
      const result = await provider.getSkillResource(id, resourcePath);
      if (result) return result;
    }
    return null;
  }
}
```

### Provider Resolution

```ts
// Phase 1: only disk
const skillProvider = new CompositeSkillProvider([new DiskSkillProvider()]);

// Phase 2: disk + database
const skillProvider = new CompositeSkillProvider([
  new DiskSkillProvider(),
  new DatabaseSkillProvider(db),
]);
```

The API route code does not change between phases — only the provider registration does.

### Conflict Resolution

When both a built-in and user skill have the same `id`:

- Phase 1: not applicable (only built-in skills exist)
- Phase 2: built-in skills take precedence by default. User skills should use a namespace prefix or a generated `id` to avoid collisions.

## Phase 1 Implementation Plan

### Step 1: Extend SkillManager with Catalog Metadata

**Goal**: Produce `SkillCatalogItem[]` from existing skill discovery without changing tool behavior.

Add a new public method to `SkillManager`:

```ts
public static listSkillCatalog(): SkillCatalogItem[]
```

Responsibilities:

- derive stable `id` from the leaf folder name (`path.basename(path.dirname(skillFile))`)
- preserve `name` and `description` from frontmatter
- set `source = "built-in"`, `status = "available"`
- expose `version` and `provider` from `parsed.data.metadata` when present
- optionally derive a short `summary` from the first non-heading paragraph of SKILL.md body
- detect `hasResources` by probing for `rules/` directory or additional `.md` files

Also add a method for directory enumeration:

```ts
public static listSkillResources(id: string): string[]
```

Returns relative paths of all files in the skill directory (excluding `SKILL.md` itself).

The existing `SkillMetadata` interface and `SkillTool` remain **unchanged** — the catalog layer is additive.

**File**: `src/lib/ai/skills/skill-manager.ts`

### Step 2: Add SkillProvider Abstraction

**Goal**: Create a storage-agnostic provider layer that the API routes call.

**New files**:

- `src/lib/ai/skills/skill-provider.ts` — `SkillProvider` interface, `CompositeSkillProvider`
- `src/lib/ai/skills/disk-skill-provider.ts` — `DiskSkillProvider` wrapping `SkillManager`

In phase 1, the composite provider only contains `DiskSkillProvider`. Phase 2 adds `DatabaseSkillProvider` without changing the API routes.

### Step 3: Add Skills Catalog API

**Goal**: Expose REST endpoints that return catalog metadata for the UI.

**Endpoints**:

| Method | Path | Response | Notes |
|---|---|---|---|
| `GET` | `/api/ai/skills` | `SkillCatalogItem[]` | List all skills. Compact metadata only. |
| `GET` | `/api/ai/skills/[id]` | `SkillDetailResponse` | Full SKILL.md content + resource paths. |

**New files**:

- `src/app/api/ai/skills/route.ts` — list handler
- `src/app/api/ai/skills/[id]/route.ts` — detail handler

**Implementation notes**:

- Both endpoints call `CompositeSkillProvider` methods.
- List endpoint does not return full SKILL.md content (compact metadata only).
- Detail endpoint returns raw markdown content (including frontmatter) so the frontend toggle can show both rendered and raw views.
- Detail endpoint returns `resourcePaths` as a flat string array. The frontend builds the tree view from path segments.
- Both endpoints are server-side only (`runtime = "nodejs"`) like the existing chat routes.
- No authentication required in phase 1 (read-only catalog of bundled skills). Authentication is added in phase 2 when user skills involve write operations.

### Step 4: Add Skills Settings Page

**Goal**: Add a "Skills" section under the existing AI settings sidebar.

**Skills List View** (`skills-edit.tsx`):

- Fetch from `GET /api/ai/skills` on mount
- 2×2 card grid layout (see confirmed UI sketch above)
- Each card: skill name, description, `Built-in` badge, optional version badge
- Click → navigates to detail view
- Loading skeleton while fetching, graceful empty state
- No toggle switches or enable/disable controls

**Skills Detail View** (`skills-detail-view.tsx`):

- Split-panel layout (see confirmed UI sketch above)
- Left panel (~60%): SKILL.md content with **Rendered / Raw toggle**
  - Rendered mode: parse markdown (strip frontmatter via `gray-matter`) and render as HTML using `react-markdown` or the existing chat markdown renderer
  - Raw mode: show full file content in a monospace `<pre>` block, including YAML frontmatter
- Right panel (~40%): Directory layout tree built from `resourcePaths`
  - Sort files into folders based on path segments
  - Show folder/file icons
  - Clicking a resource file could show its content in a future iteration (browse-first, no deep rendering required in phase 1)
- Header: back arrow, skill name, metadata badges
- Bottom note: "This skill is loaded by the V2 agent on demand"

**New files**:

- `src/components/settings/skills/skills-edit.tsx` — list page component
- `src/components/settings/skills/skills-detail-view.tsx` — detail split-panel view
- `src/components/settings/skills/skills-card.tsx` — individual skill card component

**Modified files**:

- `src/components/settings/settings-registry.tsx` — add `"skills"` section to union type and registry
- `src/components/settings/settings-dialog.tsx` — add "Skills" sidebar menu item under AI group

### Step 5: Documentation

Document:

- What bundled skills are and how they work
- Where users can see them (Settings → AI → Skills)
- That phase 1 is read-only
- That skills are agent-loaded capabilities, not user-managed toggles

## Phase 1 Acceptance Criteria

> **Status: Implemented** — Branch `feature/skills-ui-v4` in worktree `worktrees/skills-ui-v4` (2026-03-01)

- [x] Users can navigate to Settings → AI → Skills
- [x] Skills list shows all 4 bundled skills with name, description, and source badge
- [x] Users can click a skill to see the detail split-panel view
- [x] Detail left panel shows SKILL.md with a Rendered / Raw toggle
- [x] Detail right panel shows the skill's directory layout tree
- [x] API uses `SkillProvider` abstraction (not direct `SkillManager` calls from routes)
- [x] `SkillCatalogItem` model includes stable `id`, `source`, and `status`
- [x] List endpoint is compact; detail endpoint carries full content
- [x] No controls imply unsupported runtime behavior

## Phase 1 Nice-to-Haves

These are useful but should not block the first release:

- [x] Summary extraction for list cards
- [x] Version/provider display where metadata exists
- [x] Clicking a resource file in the directory tree to view its content — `GET /api/ai/skills/[id]/resource?path=` endpoint; `.md` files rendered with toggle, other files shown as raw `<pre>`
- [x] Lightweight loading/error states polish

Additional improvements shipped beyond the original spec:

- [x] Drag-to-resize splitter between the SKILL.md and Files panels (20–80% range)

## Phase 2: User-Provided Skills

Phase 2 extends the same catalog and API surface, not replaces them.

### Scope

Support user-provided skills with controlled ingestion, validation, and activation. Skills are stored in the database.

### Capabilities

- Import a skill package or folder
- Validate required structure and metadata (must have `SKILL.md` with valid frontmatter)
- Preview before activation
- Show invalid or incomplete skills with clear error messages
- Scope skills to user or workspace
- Enable/disable without deletion
- Show `User` and `Built-in` skills in the same catalog

### Backend Impact

Phase 2 requires:

- `DatabaseSkillProvider` implementing `SkillProvider` — reads from a `skills` database table
- Database schema for skill storage (id, name, description, content, resource files, status, user_id, etc.)
- Validation pipeline (frontmatter parsing, structure checks, size limits)
- Write API endpoints (`POST /api/ai/skills`, `PATCH /api/ai/skills/[id]`, `DELETE /api/ai/skills/[id]`)
- Authentication and permission model for write operations
- Conflict resolution for duplicate ids between built-in and user skills

The only change to the API routes is registering `DatabaseSkillProvider` alongside `DiskSkillProvider` in the `CompositeSkillProvider`. The frontend does not change.

### Guardrails

- Reject files exceeding size limits (reuse existing `MAX_SKILL_BYTES = 512KB`)
- Validate frontmatter schema (require `name` and `description`)
- Separate user content from bundled content in storage
- Clear execution trace when a user-provided skill is loaded
- Log which custom skill was loaded in each chat session

### Phase 2 Acceptance Criteria

- [ ] Users can import a custom skill through a file upload flow
- [ ] The system validates structure and metadata before activation
- [ ] Custom skills appear in the same catalog as built-in skills
- [ ] Each skill clearly shows source (`Built-in` vs `User`) and status
- [ ] Invalid skills show clear UI errors
- [ ] Chat traces identify when a custom skill was used
- [ ] Raw toggle in detail view shows the raw user-authored SKILL.md content for debugging

## Technical Design Principles

### 1. Storage-agnostic API

The `SkillProvider` interface abstracts over disk and database storage. API routes call the `CompositeSkillProvider`, never a storage backend directly. Adding a new storage backend means adding a new provider class, not changing any route or UI code.

### 2. Separate catalog metadata from manual content

The list endpoint returns compact metadata. Full SKILL.md content loads only in the detail view. This keeps the list page fast.

### 3. Use stable ids, not display names

`id` is the leaf folder name for built-in skills, generated UUID for user skills. API contracts, URL params, and selection state use `id`. Display uses `name`.

### 4. No fake controls

Phase 1 is browseable and explanatory, not configurable at the per-skill level. No toggles unless the backend enforces the behavior.

### 5. Resource enumeration is browse-first

The directory tree in the detail view shows structure. Rich rendering of each resource file can be incremental.

## File Changes Summary

### New Files

| File | Purpose |
|---|---|
| `src/lib/ai/skills/skill-provider.ts` | `SkillProvider` interface, `CompositeSkillProvider` |
| `src/lib/ai/skills/disk-skill-provider.ts` | `DiskSkillProvider` wrapping `SkillManager` |
| `src/app/api/ai/skills/route.ts` | Skills list API endpoint |
| `src/app/api/ai/skills/[id]/route.ts` | Skill detail API endpoint |
| `src/components/settings/skills/skills-edit.tsx` | Skills list page in Settings |
| `src/components/settings/skills/skills-detail-view.tsx` | Skill detail split-panel view |
| `src/components/settings/skills/skills-card.tsx` | Individual skill card component |

### Modified Files

| File | Change |
|---|---|
| `src/lib/ai/skills/skill-manager.ts` | Add `SkillCatalogItem` interface, `listSkillCatalog()`, `listSkillResources()` |
| `src/components/settings/settings-registry.tsx` | Add `"skills"` section to union type and registry |
| `src/components/settings/settings-dialog.tsx` | Add "Skills" sidebar menu item under AI group |

## Risks

### Phase 1 Risks

| Risk | Mitigation |
|---|---|
| Over-designing for custom skills, delaying the visibility win | Phase 1 scope is strictly read-only. `SkillProvider` abstraction adds minimal code. |
| Poor markdown rendering in detail view | Reuse existing chat renderer. Raw toggle provides a fallback. |
| Summary extraction is fragile across skill formats | Marked as nice-to-have. Omit gracefully if extraction is weak. |
| Settings page becomes cluttered | Compact card grid. Detail is behind a click. |

### Phase 2 Risks

| Risk | Mitigation |
|---|---|
| Malformed custom skills cause agent errors | Validation pipeline rejects non-conforming skills before activation |
| Prompt injection via custom skill content | Content review; mark user skills distinctly in telemetry |
| Naming collisions between built-in and user skills | Built-in wins by default; user skills use generated ids |
| Storage and permission complexity | Design permission model before implementing; start with single-user scope |

## Recommendation

Ship phase 1 as a read-only, generic skills catalog under Settings → AI → Skills with the split-panel detail view. Build the `SkillProvider` abstraction and `SkillCatalogItem` model from day one so that phase 2 user skills (database-backed) integrate by adding a new provider class — no API or UI rewrite needed.
