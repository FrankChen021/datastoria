# Memory System Plan (v3)

## Context

ClickHouse Console already persists chat transcripts in browser storage, but that is not the same as durable agent memory. A transcript stores everything; memory should store only the small set of facts that matter later.

This plan designs a full memory system for the AI agent with these requirements:

- Track user preferences as a first-class memory type
- Support both local storage and remote/backend storage
- Let users inspect, edit, pin, archive, and delete memories
- Retrieve only the relevant memories for the current task instead of replaying full chat history
- Preserve durable information before chat history is pruned or compacted

## Implementation Status

Status as of 2026-03-01:

- Phase 0: completed in the `codex/memory-phase01` worktree
- Phase 1: completed in the `codex/memory-phase01` worktree
- Phase 2: not started
- Phase 3: not started
- Phase 4: not started

Implementation note:

- The Phase 0 local memory store is implemented with a native IndexedDB adapter in this branch. The v3 plan recommends Dexie.js, but the shipped behavior remains the same local-first IndexedDB architecture described here.

## Design Principles

This design takes the following ideas from OpenClaw and adapts them to a browser/backend product:

- Durable memory must be explicit and inspectable, not hidden model state
- Memory should be separate from transient conversation history
- Retrieval should load a small relevant subset, not the full memory corpus
- The system should flush durable insights before compaction or pruning drops context
- Long-term memory should be editable by users

OpenClaw uses Markdown files plus retrieval tools such as `memory_search` and `memory_get`. ClickHouse Console should keep the same principles, but use typed memory records and a memory management UI instead of workspace files because this product runs as a web client with optional backend storage.

### OpenClaw References

- [OpenClaw Memory](https://docs.openclaw.ai/concepts/memory)
- [OpenClaw Context](https://docs.openclaw.ai/concepts/context)
- [OpenClaw Compaction](https://docs.openclaw.ai/concepts/compaction)
- [OpenClaw Session Pruning](https://docs.openclaw.ai/concepts/session-pruning)
- [OpenClaw Agent Workspace](https://docs.openclaw.ai/concepts/agent-workspace)

## Goals

- Persist user preferences across chats and sessions
- Support local-only and remote-only storage modes
- Keep memory understandable and controllable by the user
- Make memory retrieval cheap enough to run before response generation
- Avoid storing raw transcripts as "memory"
- Keep privacy boundaries explicit per user and connection

## Non-Goals

- Persisting every chat turn forever
- Storing raw query results as durable memory
- Building a full vector database in the first iteration
- Creating cross-user shared memory
- Replacing chat history storage
- Hybrid sync between local and remote storage (deferred indefinitely; see Appendix A)

## Memory Taxonomy

The system supports typed memory records. The first shipped type is `preference`.

### Memory Kinds

- `preference`
  - "Show SQL before execution"
  - "Prefer safer fixes over aggressive optimization"
  - "Use UTC in explanations"
- `connection_fact`
  - "This cluster keeps `system.query_log` for 3 days"
  - "Production workloads are in `events_*` tables"
- `workflow_note`
  - "User usually starts with `EXPLAIN indexes = 1`"
- `investigation_finding`
  - "Memory spikes were previously traced to a large hash join on `order_items`"

### Scope

Every memory record must have an explicit scope:

- `user`
- `user_connection`
- `user_connection_database`

Default rules:

- Preferences default to `user`
- Connection conventions default to `user_connection`
- Database-specific conventions default to `user_connection_database`

## Storage Modes

The memory layer exposes a single interface with two backends.

### 1. Local-Only

Use browser/device storage as the canonical memory store.

Implementation:

- `IndexedDBMemoryStore` as the primary local backend using [Dexie.js](https://dexie.org/) as the IndexedDB wrapper
- `localStorage` only for tiny settings and feature flags

Rationale:

- Memory records need filtering, editing, pagination, and search
- `localStorage` is already used for chats, but it is quota-limited and poor for queryable state
- IndexedDB is a better fit for user-editable structured data
- Dexie.js provides transactions and query helpers without forcing the app to hand-roll IndexedDB boilerplate

### 2. Remote

Use backend storage as the canonical memory store.

Implementation:

- `RemoteMemoryStore` backed by application storage
- Postgres is the preferred long-term backend
- SQLite is acceptable for self-hosted or single-node deployments

## High-Level Architecture

```text
UI Memory Panel
    |
MemoryService
    |
MemoryStore (local or remote)
    |
Shared MemoryRetriever + MemoryFormatter + RetrievalSpec
    |
Sub-Agent Prompt Builder
```

### Retrieval Ownership

Retrieval ownership depends on the storage mode:

| Storage Mode | Retrieval Owner | Rationale |
|---|---|---|
| **Local** | Client (`chat-factory.ts`) | Server has no access to IndexedDB |
| **Remote** | Server (API route / sub-agent) | Server has the DB; avoids round-tripping records |

In **local mode**, the client retrieves and formats memories into a compact text block, then sends it as `body.memoryBlock` in the chat request. The server passes this block through to the sub-agent prompt builder.

In **remote mode**, the server retrieves memories directly from the database and injects them into the sub-agent prompt. The client sends connection and scope context plus the raw `queryText` used for retrieval matching, but not the memory records themselves.

### Shared Retrieval Contract

Retrieval ownership changes by mode, but retrieval behavior must not drift by mode.

The following logic must be shared and deterministic across local and remote implementations:

- scope chain resolution
- candidate ranking
- pinned-budget rules
- token-budget enforcement
- prompt formatting template

Implementation rule:

- `memory-retriever.ts`, `memory-formatter.ts`, and `memory-retrieval-spec.ts` must be pure runtime-agnostic modules that can run in both client and server contexts
- store adapters only load candidate records; they do not implement custom ranking or formatting logic
- parity tests must run the same fixtures through local-mode and remote-mode retrieval and assert identical output blocks

### Core Modules

- `MemoryService`
  - Extract memory candidates
  - Validate policy
  - Deduplicate
  - Save and update
  - Retrieve relevant memories
- `MemoryStore`
  - Abstract persistence interface
- `MemoryRetriever`
  - Scope filtering
  - Ranking
  - Pinned-budget enforcement
  - Token-budget enforcement
  - Result trimming
- `MemoryFormatter`
  - Convert typed records into compact prompt blocks
- `MemoryEventStore`
  - Append provenance and audit events

## Data Model

```ts
type MemoryKind =
  | "preference"
  | "connection_fact"
  | "workflow_note"
  | "investigation_finding";

type MemoryScopeType =
  | "user"
  | "user_connection"
  | "user_connection_database";

type MemoryStatus = "active" | "archived" | "deleted";

type MemoryWriteMode = "manual" | "confirmed" | "auto";

type PinPriority = 1 | 2 | 3;

interface MemoryRecord {
  id: string;
  userId: string;
  scopeType: MemoryScopeType;
  connectionId?: string;
  databaseId?: string;
  kind: MemoryKind;
  title: string;
  content: string;
  normalizedContent: string;
  tags: string[];
  confidence: number;
  pinned: boolean;
  pinPriority?: PinPriority;
  writeMode: MemoryWriteMode;
  sourceChatId?: string;
  sourceMessageId?: string;
  sourceType: "user" | "assistant" | "tool" | "manual";
  status: MemoryStatus;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

interface MemoryEvent {
  id: string;
  memoryId: string;
  eventType: "created" | "updated" | "confirmed" | "pinned" | "archived" | "deleted";
  sourceChatId?: string;
  sourceMessageId?: string;
  sourceType: "user" | "assistant" | "tool" | "manual";
  createdAt: string;
}
```

### Design Notes

- `title` gives the user a short readable label
- `content` stores the durable fact in its original form
- `normalizedContent` supports dedupe and local search
- `confidence` lets the system distinguish hard facts from tentative findings
- `writeMode` defines merge precedence between manual, confirmed, and automatic writes
- `pinned` means the memory should be favored for prompt inclusion
- `pinPriority` defaults to `2` for new pins and is used only when pinned memories compete for limited prompt budget
- `tags` remain semantic labels for user filtering and search
- provenance belongs in `MemoryEvent`, not in `tags`

### Local Event Retention

`MemoryEvent` records are useful for provenance and auditability, but they must not grow without bound in local IndexedDB.

Initial rule:

- keep all events in Phases 0-3

Phase 4 must define event retention and purge rules, for example:

- keep only the latest N events per memory
- compact older event chains into summary metadata on the memory record
- purge deleted-memory events after a retention window

### Scope Identity

Deduplication and retrieval must use the full resolved scope identity, not only the scope type.

Resolved scope keys:

- `user`: `(userId)`
- `user_connection`: `(userId, connectionId)`
- `user_connection_database`: `(userId, connectionId, databaseId)`

Writes for scoped memories are invalid if their required scope identifiers are missing.

### Normalization

The `normalizedContent` field is computed from `content` using the following function:

```ts
function normalizeMemoryContent(content: string): string {
  return content
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}
```

This is intentionally simple. Stemming and stop-word removal are not needed for Phase 0-1 dedup where exact normalized match is sufficient.

## Persistence Policy

The memory system persists only durable, high-value information.

### Persist Automatically

- Explicit user preferences
- Repeatedly confirmed preferences
- Confirmed connection conventions
- Confirmed investigation findings with tool evidence
- User-approved suggested memories

### Do Not Persist Automatically

- Raw query results
- Full SQL text by default
- Secrets, credentials, tokens, or connection auth details
- Temporary metrics
- Tentative guesses
- Entire tool outputs

### Persistence Timing

Persist at these points:

1. After a completed assistant turn
2. When the user explicitly says "remember this"
3. Before chat history compaction or pruning
4. Before local cleanup removes older messages due to storage pressure
5. When the user manually creates or edits a memory in the UI

### Memory Flush Before Pruning

This is the OpenClaw-style preservation step adapted for this app.

Before any message compaction, pruning, or quota-driven cleanup:

- Inspect recent turns
- Extract candidate durable memories
- Save accepted records
- Then prune chat history

This prevents durable preferences from disappearing just because the transcript was trimmed.

## Extraction Pipeline

```text
Recent turn
  -> candidate extraction
  -> scope inference
  -> policy filter
  -> dedupe / merge
  -> optional user confirmation
  -> persist
```

### Candidate Extraction Rules

The first release uses deterministic extraction rules. Each level is tagged with the phase in which it ships.

| Level | Rule | Phase |
|---|---|---|
| 1 | **Explicit commands**: "remember this", "always do X", "from now on" | Phase 1 |
| 2 | **Pattern-based preference detection**: "prefer", "always", "never", "by default", "use UTC", "show SQL first" | Phase 1 |
| 3 | **Assistant-confirmed memory suggestions**: "I can remember that you prefer..." | Phase 2 |
| 4 | **LLM candidate extraction** over the final user + assistant turn | Phase 3+ |

## Deduplication and Merge Strategy

### Deduplication

Phase 0-1 dedup uses exact match on:

- full resolved scope identity
- same `kind`
- exact `normalizedContent`

Concrete dedup keys:

- `user`: `(userId, kind, normalizedContent)`
- `user_connection`: `(userId, connectionId, kind, normalizedContent)`
- `user_connection_database`: `(userId, connectionId, databaseId, kind, normalizedContent)`

This avoids merging equivalent text across different connections or databases.

Phase 3+ dedup may add fuzzy matching via embeddings or token-level similarity, but this is explicitly out of scope for the initial release.

### Merge Precedence

When a new memory matches an existing record, precedence is:

1. `manual`
2. `confirmed`
3. `auto`

Additional rule:

- a pinned memory is never overwritten by a lower-precedence write

### Merge Rules

When a new memory matches an existing record:

- preserve the original `createdAt`
- always update `updatedAt`
- append a `MemoryEvent`
- if incoming precedence is lower than the existing record, keep existing `title` and `content`
- if incoming precedence is equal or higher, replace `title` and `content` with the newer normalized user-facing version
- if both old and new records support the same fact, bump `confidence`
- never store provenance in `tags`

Examples:

- manual user edit beats a later auto-extracted rewrite
- a confirmed preference can update an older auto-saved preference
- a lower-precedence auto write can still increase confidence or add an event without changing text

## Retrieval and Loading

Do not load all memory rows into the prompt. Retrieve a small working set within a strict token budget.

### Token Budget

The memory block injected into the prompt must not exceed **500 tokens**.

The `MemoryRetriever` enforces this with two sub-budgets:

- up to **300 tokens** reserved for pinned memories
- up to **200 tokens** reserved for dynamically retrieved memories

Unused pinned budget can spill over to dynamic retrieval. Dynamic retrieval cannot evict higher-priority pinned memories.

Token counting can start with the approximation `text.length / 4`, but the shared retriever contract must keep the estimation rule identical in both local and remote modes.

### Pinned Budget Rules

Pinned memory should stay simple in the default UX.

- `pinPriority` is an advanced setting and should be hidden from most users
- new pinned memories default to priority `2`
- users who never open advanced settings still get normal pinned behavior

Pinned memories are ordered by:

1. `pinPriority` descending
2. `updatedAt` descending

Soft cap:

- warn when a user pins more than **10** memories in the active scope chain
- allow exceeding the cap, but surface a UI warning that too many pinned memories will reduce useful retrieval space

If pinned memories exceed the pinned budget:

- include the highest-priority pinned memories first
- omit lower-priority pinned memories
- return a budget warning so the UI can prompt the user to reduce or edit the pinned set

Do not silently truncate pinned memories by recency alone.

### Load Stages

1. Load pinned memories for the current scope chain
2. Retrieve relevant memories for the current user request
3. Optionally load recent investigation findings for the active connection
4. Dedupe and trim to token budget

### Scope Chain

For a request on a given connection and database, retrieve in this order:

1. `user`
2. `user_connection`
3. `user_connection_database`

### Ranking

MVP ranking:

- pinned first
- exact keyword matches
- kind weight, with preferences highest
- confidence
- recency

Future ranking:

- optional embeddings
- hybrid lexical and semantic ranking

### Prompt Injection

Memory is injected into the **sub-agent prompt** and not the planner prompt.

Rationale:

- the planner in this repo is responsible for intent classification and routing
- user preferences and prior findings should affect response generation and tool behavior, not intent routing

Injection shape:

```text
Known user preferences:
- Show SQL before execution
- Prefer safer fixes over risky rewrites

Known connection facts:
- system.query_log retention is 3 days

Relevant prior findings:
- Previous memory investigation linked spikes to a large hash join on order_items
```

Keep this block small and deterministic. Never exceed the 500-token budget.

## User Experience

### Memory Management UI

Add a memory panel reachable from chat settings or the chat sidebar.

Required capabilities:

- View memories with pagination
- Filter by kind, scope, connection, and status
- Search memory text
- Edit title, content, tags, pin state, and pin priority
- Archive or delete a memory
- Create a memory manually
- Jump to the source chat when available
- Surface budget warnings for over-pinned memory sets

### Suggested Memory UX

When the agent detects a strong preference, show a small confirmation action:

- "Remember this preference?"
- Accept
- Dismiss
- Edit before save

This keeps memory user-visible and avoids hidden writes.

### Settings

Add memory settings:

- Enable memory
- Storage mode: local or remote
- Auto-save preferences
- Auto-save findings
- Export memories as JSON
- Clear all memories

### Settings Decisions

- **Remote memory**: opt-in
- **First-write confirmation**: require confirmation on first write; after the user approves at least one memory of a given kind, auto-save can be enabled for that kind
- **Export format**: JSON only
- **Pin priority UI**: advanced-only; default new pins to priority `2`

## Privacy and Security

The system must assume memory can contain operationally sensitive information.

### Baseline Rules

- Never store connection credentials in memory
- Avoid persisting raw SQL unless explicitly user-authored and approved
- Redact obvious secrets and tokens before save
- Scope retrieval by authenticated user before ranking
- Let users inspect and delete their memories

### Remote Storage

For backend mode:

- encrypt at rest
- use strict row-level scoping by user and connection
- audit memory writes and deletes
- support retention and full deletion
- keep `memory_events` for provenance and auditability
- document that raw `queryText` is sent to the server for retrieval matching in remote mode

### Local Storage

For local mode:

- use Dexie.js over IndexedDB and not `localStorage`
- isolate memory per signed-in user profile
- support export and hard delete
- treat browser-native origin isolation as sufficient for the first release

## API and Repository Design

### Frontend Interfaces

```ts
interface MemoryQuery {
  scopeType?: MemoryScopeType;
  connectionId?: string;
  databaseId?: string;
  kind?: MemoryKind;
  status?: MemoryStatus;
  limit?: number;
  offset?: number;
}

interface MemorySearchQuery extends MemoryQuery {
  text: string;
}

interface MemoryListResult {
  records: MemoryRecord[];
  total: number;
}

interface MemoryRetrieveInput {
  userId: string;
  connectionId?: string;
  databaseId?: string;
  queryText: string;
}

interface MemoryCandidate {
  title: string;
  content: string;
  kind: MemoryKind;
  scopeType: MemoryScopeType;
  connectionId?: string;
  databaseId?: string;
  writeMode: MemoryWriteMode;
  sourceChatId?: string;
  sourceMessageId?: string;
  sourceType: "user" | "assistant" | "tool" | "manual";
}

interface MemoryPromptResult {
  memoryBlock: string;
  warnings: string[];
  recordIds: string[];
}

interface MemoryStore {
  list(query: MemoryQuery): Promise<MemoryListResult>;
  search(query: MemorySearchQuery): Promise<MemoryListResult>;
  get(id: string): Promise<MemoryRecord | null>;
  upsert(record: MemoryRecord): Promise<MemoryRecord>;
  delete(id: string): Promise<void>;
  archive(id: string): Promise<void>;
}

interface MemoryEventStore {
  append(event: MemoryEvent): Promise<void>;
}

interface MemoryRepository {
  retrieveForPrompt(input: MemoryRetrieveInput): Promise<MemoryPromptResult>;
  persistCandidates(input: MemoryCandidate[]): Promise<MemoryRecord[]>;
}
```

### Backend Endpoints

Initial remote API:

- `GET /api/memory` for list with query params and pagination
- `POST /api/memory/search` for full-text search
- `POST /api/memory` for create
- `PATCH /api/memory/:id` for update
- `DELETE /api/memory/:id` for soft delete

Optional later:

- `POST /api/memory/export`
- `POST /api/memory/import`

## Integration Points

### Chat Send Path

In `src/components/chat/chat-factory.ts`:

- in local mode, retrieve relevant memories, format into a compact text block, and send as `body.memoryBlock`
- in remote mode, send connection and scope context only; the server performs retrieval

### Sub-Agent Prompt Builders

In the sub-agent prompt builders such as `orchestrator-prompt.ts` and `sql-generation-agent.ts`:

- accept a `memoryBlock` string parameter
- inject the memory block before the user's request in the system prompt
- do not inject full memory into the planner prompt

### Message Pruning

In `src/lib/ai/message-pruner.ts`:

- invoke memory flush before pruning historical tool parts

### Chat Storage Cleanup

In `src/components/chat/storage/chat-storage-local.ts`:

- invoke memory flush before quota-driven message cleanup removes old turns

### Shared Retrieval Modules

Create under `src/lib/ai/memory/`:

- `memory-types.ts`
- `memory-service.ts`
- `memory-retrieval-spec.ts`
- `memory-retriever.ts`
- `memory-formatter.ts`
- `memory-normalizer.ts`
- `memory-event-store.ts`
- `stores/indexeddb-memory-store.ts`
- `stores/remote-memory-store.ts`

### UI

Add under `src/components/chat/memory/`:

- `memory-panel.tsx`
- `memory-list.tsx`
- `memory-editor-dialog.tsx`
- `memory-suggestion-banner.tsx`

Add under `src/components/settings/agent/`:

- `memory-settings.tsx`

## Rollout Plan

### Phase 0: Foundations

- define memory types and interfaces
- define the shared retrieval spec
- add settings and feature flags
- add Dexie.js-backed IndexedDB store
- add memory panel UI with manual CRUD and pagination
- add memory event persistence for provenance

### Phase 1: Preference Memory

- implement deterministic preference extraction: explicit commands and pattern-based detection
- add save confirmation UI
- retrieve pinned and relevant preferences for sub-agent prompts
- flush preferences before pruning
- enforce pinned and total token budgets

Success criteria:

- users can say "always show SQL first" in one chat and see the behavior in later chats
- users can inspect and edit the saved preference
- memory block never exceeds 500 tokens
- local and remote retrieval produce identical prompt blocks for the same fixtures

### Phase 2: Remote Storage

- add backend API and DB schema
- add remote memory store
- add storage mode selection in settings
- add server-side retrieval for remote mode
- add assistant-confirmed memory suggestions

Success criteria:

- memories survive across devices for signed-in users
- retrieval stays scoped and auditable
- provenance is preserved via `memory_events`

### Phase 3: Findings and Facts

- add `connection_fact` and `investigation_finding` memory kinds
- add evidence-aware save rules
- add recent-finding retrieval for incident workflows
- add LLM-based candidate extraction

### Phase 4: Lifecycle and Advanced Retrieval

- define memory eviction and auto-archival rules
- define `MemoryEvent` retention and purge rules for local IndexedDB
- add optional semantic retrieval
- add hybrid lexical and semantic ranking

## Testing Plan

- unit tests for extraction rules
- unit tests for normalization and exact-match dedup
- unit tests for merge precedence and merge rules
- unit tests for scope identity resolution
- unit tests for pinned-budget and token-budget enforcement
- integration tests for memory injection into sub-agent prompt builders
- integration tests asserting local and remote retrieval parity
- integration tests for memory flush before pruning
- UI tests for memory panel list, filter, search, edit, archive, delete, and create
- UI tests for suggested memory confirmation banner

## Appendix A: Hybrid Storage (Deferred)

Hybrid storage is explicitly deferred. If revisited in the future, the key requirements would be:

- backend remains canonical
- local store caches recently used memories
- sync uses `updated_at` and a per-record `version` field for optimistic concurrency
- conflict resolution requires either last-write-wins or user-facing merge UI
- the `MemoryRecord` data model would need a `version: number` field added via schema migration

This mode adds significant complexity with limited benefit until the product has a strong multi-device user base.
