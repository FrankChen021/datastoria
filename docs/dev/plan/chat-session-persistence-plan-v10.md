# Chat Session Persistence Plan v10

## Revision Notes

v10 keeps v9 as the implementation baseline and updates the schema/storage details to match the new constraints:

- **MySQL is now the primary recommended backend** for the first implementation
- **PostgreSQL is the secondary SQL backend**
- **ClickHouse is documented as an optional first backend only under an alternate append-only design**, not under the main row-upsert design used by v8
- **No foreign keys in the schema**
- **No JSON columns in the schema** — structured payloads are stored as serialized text
- **Deployment requirements are generalized** from PostgreSQL-only wording to SQL-backend wording
- **The decisions table is updated** to reflect MySQL-first

The core remote persistence model from v8 remains correct and is still the recommended default:

- `replaceOrAppendMessageById()` as the single merge rule
- `connectionId` trusted only on session creation
- client continuation detection via the AI SDK helper
- server validation from durable state
- final assistant persistence via `toUIMessageStream({ onFinish })`

---

## Context

The current chat history implementation is fully client-side:

- `ChatFactory.create()` loads historical messages from `SessionManager.getMessages(chatId)`
- `ChatFactory` persists user messages in `onPrepareSendMessagesRequest`
- `ChatFactory` persists assistant messages in `onFinish`
- `SessionManager` delegates durable storage to `LocalSessionRepository`
- `LocalSessionRepository` stores compressed JSON in browser `localStorage`

This works for single-browser usage, but it has several limitations:

- chat history does not follow the user across devices
- local storage quota forces pruning behavior
- the client is the source of truth for durable chat history
- a naive HTTP replacement for `LocalSessionRepository` would make persistence client-directed and easy to misuse

We want to follow the Vercel AI SDK persistence model instead:

- the server is authoritative for persisted history
- the chat route persists the incoming message before generation
- the chat route persists the final AI response from the server-side stream completion hook
- ownership is derived from verified server-side identity, never from client input

Deployments without backend persistence must continue to work using the current local storage behavior.

## Goals

- Support both local-only and backend-persisted chat history
- Keep the current chat UI responsive with a client-side in-memory cache
- Make the server authoritative for persistence in remote mode
- Avoid generic browser-driven write APIs for messages
- Keep the migration from the current architecture incremental

## Non-Goals

- No browser-to-database access
- No public generic `saveMessage` or `saveMessages` endpoint
- No anonymous backend persistence
- No phase-1 persistence of UI-only state such as hidden tool action toggles

---

## Current Architecture

### Relevant Source Files

| File | Role |
|------|------|
| `src/components/chat/chat-factory.ts` | Orchestrates chat creation, transport, client persistence hooks, title generation |
| `src/components/chat/session/session-manager.ts` | In-memory cache, subscriptions, delegates to repository |
| `src/components/chat/session/local-session-repository.ts` | localStorage repository with compression and quota management |
| `src/components/chat/session/session-repository.ts` | session repository interface |
| `src/lib/ai/chat-types.ts` | `Chat`, `Message`, `MessageMetadata`, `MessageRole`, `MessagePart` types |
| `src/components/chat/session/chat-action-storage.ts` | UI-only hidden action state |
| `src/app/api/ai/chat/route.ts` | v1 planning-based route with manual stream orchestration |
| `src/app/api/ai/chat/v2/route.ts` | v2 skill-based route with `streamText()` + AI SDK UI stream |

### Field Name Clarification

The current code uses:

- `Chat.chatId` for the chat/session id
- `Chat.databaseId` for what is semantically a connection id
- `Connection.connectionId` as the runtime connection identifier

For backend persistence, the stored field should be named `connection_id`. Mapping from `Chat.databaseId` happens at the storage boundary.

### Server Tools vs Client Tools

This distinction drives the request model.

**Server tools** run entirely inside the server request. They do not trigger an extra browser request and are already covered by one remote request/response cycle.

**Client tools** run in the browser via `onToolCall`, emit results through `chat.addToolOutput(...)`, and trigger an AI SDK auto-resend via `sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls`.

That means a single user-visible turn can produce multiple POST requests:

1. initial user request
2. one or more continuation requests carrying updated assistant messages with tool results

---

## Core Design

### 1. Remote mode sends only the newest message payload

In remote mode, the browser does not send the full message array.

Instead:

- initial turn: send the new user message
- continuation turn: send the updated assistant message with tool results

This follows the AI SDK persistence guidance and reduces trust in client-supplied history.

### 2. Remote mode request shapes

The server determines whether it is in remote or local mode from its own configuration. The request body must not carry a `mode` field.

```ts
interface ChatRequestBase {
  chatId: string;
  connectionId: string;
  ephemeral?: boolean;
  context?: DatabaseContext;
  model?: { provider: string; modelId: string; apiKey?: string };
  agentContext?: AgentContext;
}

interface InitialTurnRequest extends ChatRequestBase {
  continuation?: false;
  message: AppUIMessage;
  generateTitle?: boolean;
}

interface ContinuationRequest extends ChatRequestBase {
  continuation: true;
  message: AppUIMessage;
}

type RemoteChatRequest = InitialTurnRequest | ContinuationRequest;
```

### 3. Every remote request rebuilds state from persistence

For every remote request, the server must:

1. resolve the verified user
2. load the chat session
3. load persisted messages for that chat
4. merge the incoming request message into that persisted history by `message.id`
5. generate from the merged history

### 4. Merge-by-id is the invariant

Use one merge rule for both initial and continuation requests:

```ts
function replaceOrAppendMessageById(
  persistedMessages: AppUIMessage[],
  incomingMessage: AppUIMessage
): AppUIMessage[] {
  const next = [...persistedMessages];
  const index = next.findIndex((message) => message.id === incomingMessage.id);
  if (index >= 0) {
    next[index] = incomingMessage;
  } else {
    next.push(incomingMessage);
  }
  return next;
}
```

This prevents duplicates on retries in both flows.

### 5. `connectionId` is trusted only on session creation

Rules:

- if the session does not exist, use `connectionId` to create it
- if the session exists, the persisted `connection_id` is authoritative
- if the client sends a different `connectionId` for an existing session, reject with `409`

### 6. Persist UI messages, not a reconstructed format

The durable record stores the AI SDK UI message shape:

- role
- parts
- metadata
- id
- timestamps
- sequence

### 7. Idempotent upsert by `(chat_id, message_id)`

Retries converge on the same durable row:

- user messages
- continuation assistant messages
- final assistant responses from `onFinish`

### 8. Final assistant persistence happens in server-side `onFinish`

`toUIMessageStream({ onFinish })` is the authoritative durable write point for final AI responses.

---

## Continuation Detection on the Client

Use the same AI SDK helper that governs auto-resend.

The client-side persistence mode should come from the shared `RuntimeConfigProvider`, not from a dedicated fetch helper:

- `lastAssistantMessageIsCompleteWithToolCalls`

This keeps client continuation detection aligned with the SDK’s own resend condition.

### Concrete `prepareSendMessagesRequest`

```ts
prepareSendMessagesRequest: async ({
  messages,
  id,
  body,
  headers,
  credentials,
}) => {
  const effectiveMode = chatPersistenceMode;

  if (effectiveMode === "local") {
    return {
      body: {
        ...body,
        chatId: id,
        connectionId: connection.connectionId,
        messages,
        ...(options.generateTitle !== undefined && { generateTitle: options.generateTitle }),
      },
      headers,
      credentials,
    };
  }

  const lastMessage = messages[messages.length - 1];
  const continuation = lastAssistantMessageIsCompleteWithToolCalls({ messages });

  return {
    body: {
      chatId: id,
      connectionId: connection.connectionId,
      message: lastMessage,
      continuation: continuation || undefined,
      ...(options.ephemeral && { ephemeral: true }),
      ...(options.context && { context: options.context }),
      ...(currentModel && { model: currentModel }),
      ...(options.agentContext && { agentContext: options.agentContext }),
      ...(!continuation && options.generateTitle !== undefined
        ? { generateTitle: options.generateTitle }
        : {}),
    },
    headers,
    credentials,
  };
};
```

---

## Server-Side Validation Rules

### Identity

```ts
export async function resolveVerifiedUserId(req: Request): Promise<string | null> {
  if (isAuthEnabled()) {
    const session = await auth();
    return session?.user?.id ?? null;
  }
  const email = getAuthenticatedUserEmail(req);
  return email ?? null;
}
```

### Initial request validation

- `message.role === "user"`
- `continuation !== true`
- `chatId` format is valid
- `connectionId` is present

### Continuation request validation

- `continuation === true`
- `message.role === "assistant"`
- the message contains completed tool output state
- a persisted assistant message with the same `message.id` already exists

### `messageId` derivation in remote mode

- initial turn: generate a new UUIDv7 for the assistant response
- continuation: the SDK reuses the existing assistant message id for `responseMessage.id`

That means continuation `onFinish` is always an update, not a new insert.

---

## Client Storage Abstractions

```ts
interface SessionRepository {
  getSession(chatId: string): Promise<Chat | null>;
  getSessionsForConnection(connectionId: string): Promise<Chat[]>;
  getMessages(chatId: string): Promise<Message[]>;
  saveSession(session: Chat): Promise<void>;
  saveMessages(chatId: string, messages: Message[]): Promise<void>;
  saveMessage(chatId: string, message: Message): Promise<void>;
  renameSession(chatId: string, title: string): Promise<void>;
  deleteSession(chatId: string): Promise<void>;
}
```

### `LocalSessionRepository`

- wraps the current localStorage logic
- preserves compression, pruning, and client-side sequence assignment

### `RemoteSessionRepository`

- reads from backend APIs
- does not durably persist messages
- uses narrow backend APIs for rename/delete
- leaves optimistic in-memory state to `SessionManager`

### `SessionManager`

Still owns:

- in-memory cache
- running-state tracking
- subscriptions
- optimistic updates

---

## Server Persistence Abstraction

```ts
interface ServerSessionRepository {
  getSession(userId: string, chatId: string): Promise<PersistedChatSession | null>;
  getSessionsForConnection(userId: string, connectionId: string): Promise<PersistedChatSession[]>;
  getMessages(userId: string, chatId: string): Promise<PersistedChatMessage[]>;

  createSession(input: CreateSessionInput): Promise<PersistedChatSession>;
  touchSession(input: TouchSessionInput): Promise<PersistedChatSession>;

  upsertMessage(input: UpsertMessageInput): Promise<void>;

  updateSessionTitle(userId: string, chatId: string, title: string): Promise<void>;
  renameSession(userId: string, chatId: string, title: string): Promise<void>;
  deleteSession(userId: string, chatId: string): Promise<void>;
}
```

### `NoopServerSessionRepository`

Used in local mode. All methods return null, empty arrays, or void.

---

## Remote Route Algorithms

### v2 Route: Initial User Turn

1. resolve verified user id
2. validate request shape as initial turn
3. if `ephemeral`, skip persistence and generate from request payload only
4. load session by `(userId, chatId)`
5. if missing, create with `connectionId`
6. if existing and `connectionId` mismatches stored `connection_id`, reject `409`
7. load persisted messages
8. merge incoming user message via `replaceOrAppendMessageById`
9. upsert incoming user message
10. build model input from merged history
11. call `streamText(...)`
12. persist `responseMessage` in `toUIMessageStream({ onFinish })`
13. update title if available

### v2 Route: Continuation Turn

1. resolve verified user id
2. validate request shape as continuation turn
3. load session and enforce ownership
4. validate `connectionId` against stored session
5. load persisted messages
6. verify assistant message already exists
7. merge incoming continuation assistant message via `replaceOrAppendMessageById`
8. upsert incoming continuation message
9. build model input from merged history
10. call `streamText(...)`
11. persist final `responseMessage` in `toUIMessageStream({ onFinish })`

### v1 Route Differences

For the current implementation scope, **v1 does not support chat session persistence**.

- remote persistence is implemented only for `/api/ai/chat/v2`
- `/api/ai/chat` keeps its existing non-persistent behavior
- if v1 persistence is needed later, it should be designed separately around the planning/sub-agent stream structure

---

## Narrow Backend APIs

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/chat/sessions?connectionId=...` | List sessions for a connection |
| `GET` | `/api/chat/sessions/:chatId` | Get one session |
| `GET` | `/api/chat/sessions/:chatId/messages` | Get session messages |
| `PATCH` | `/api/chat/sessions/:chatId` | Rename session |
| `DELETE` | `/api/chat/sessions/:chatId` | Delete session |

Rules:

- every endpoint derives identity from verified auth context
- every query enforces ownership
- no endpoint accepts `userId`
- no generic message-write endpoint exists

---

## Data Model

### Persisted session

```ts
interface PersistedChatSession {
  id: string;
  owner_user_id: string;
  connection_id: string;
  title: string | null;
  created_at: Date;
  updated_at: Date;
}
```

### Persisted message

```ts
interface PersistedChatMessage {
  id: string;
  chat_id: string;
  owner_user_id: string;
  role: MessageRole;
  parts_text: string;
  metadata_text: string | null;
  sequence: number;
  created_at: Date;
  updated_at: Date;
}
```

### MySQL DDL

```sql
CREATE TABLE chat_sessions (
  id            VARCHAR(64) PRIMARY KEY,
  owner_user_id VARCHAR(255) NOT NULL,
  connection_id VARCHAR(255) NOT NULL,
  title         TEXT NULL,
  created_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY idx_chat_sessions_owner_connection (owner_user_id, connection_id)
);

CREATE TABLE chat_messages (
  id            VARCHAR(64) PRIMARY KEY,
  chat_id       VARCHAR(64) NOT NULL,
  owner_user_id VARCHAR(255) NOT NULL,
  role          VARCHAR(32) NOT NULL,
  parts_text    LONGTEXT NOT NULL,
  metadata_text LONGTEXT NULL,
  sequence      INT NOT NULL,
  created_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY idx_chat_messages_chat_id (chat_id),
  KEY idx_chat_messages_chat_sequence (chat_id, sequence),
  UNIQUE KEY idx_chat_messages_chat_sequence_unique (chat_id, sequence)
);
```

### MySQL Upsert SQL

```sql
INSERT INTO chat_messages (id, chat_id, owner_user_id, role, parts_text, metadata_text, sequence, created_at)
VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(3))
ON DUPLICATE KEY UPDATE
  parts_text = VALUES(parts_text),
  metadata_text = VALUES(metadata_text),
  updated_at = CURRENT_TIMESTAMP(3);
```

### Sequence assignment

- on update: keep existing sequence
- on insert: assign `MAX(sequence) + 1` per chat
- local mode preserves current client-side assignment

### Integrity rules without foreign keys

Because this schema intentionally avoids foreign keys:

- application code must verify the session exists before inserting or updating message rows
- deleting a session must explicitly delete its message rows in the same workflow
- ownership checks must always include `owner_user_id`
- orphan cleanup should be handled by a maintenance task or admin script

### Serialization contract for structured payloads

The application still treats message parts and metadata as structured values, but the database stores serialized text:

- `parts_text = JSON.stringify(message.parts)`
- `metadata_text = JSON.stringify(message.metadata)` or `NULL`
- read paths must parse these fields back into `MessagePart[]` and `MessageMetadata`
- parse failures should be treated as corrupted persistence records and logged clearly

### DTO / Serialization Contract

```ts
interface ChatSessionDTO {
  chatId: string;
  databaseId: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ChatMessageDTO {
  id: string;
  role: MessageRole;
  parts: MessagePart[];
  metadata: MessageMetadata | null;
  sequence: number;
  createdAt: string;
  updatedAt: string;
}
```

---

## Database Recommendation

### Primary recommendation: MySQL first

Use MySQL first for the main implementation.

Why:

- the current remote design performs real upserts, not pure appends
- continuation requests update an existing assistant message
- final `onFinish` writes update the same assistant message id during continuations
- MySQL handles row-oriented mutable session data naturally
- storing serialized payloads in `LONGTEXT` is straightforward
- the schema stays simple without foreign keys
- Drizzle supports MySQL well and keeps the implementation aligned with TypeScript code

### Secondary recommendation: PostgreSQL

PostgreSQL remains an excellent fit and should be supported second.

Why:

- same transactional benefits as MySQL
- easy idempotent upsert semantics
- text-backed payload storage works fine there too if we keep the same schema constraints across engines

### ClickHouse as an optional first backend

ClickHouse is only a reasonable first backend **if we intentionally switch to a different persistence model**.

With the main v9 design, ClickHouse is not the best first choice because:

- continuation flow updates an existing assistant message
- final `onFinish` continuation writes are updates to that same message id
- rename/delete semantics are row-mutation-oriented

So ClickHouse-first is viable only under an alternate design such as:

- append-only message event log
- no in-place row updates
- latest-state reconstruction at read time or via materialized views
- relaxed expectations around delete/update immediacy
- text-serialized payload columns rather than row JSON updates

That is a different implementation plan from the main v9 design.

**Conclusion:**  
For the design in this document, use **MySQL first**.  
If the team wants **ClickHouse first**, we should spin a separate v9-CH plan based on append-only events rather than row upserts.

---

## Title Handling

1. create session with provisional title when appropriate
2. persist incoming message before generation
3. persist `responseMessage` in `onFinish`
4. if title is ready, persist it in the same server completion path
5. if title resolves later, update asynchronously with logging

Message persistence must not block on title readiness.

---

## Latency Considerations

Every remote request requires:

- load session
- load messages
- merge incoming payload

That is acceptable in phase 1 because:

- LLM latency dominates
- typical chat history is modest
- indexed MySQL queries are fast

Phase 2 mitigations if needed:

- load a bounded recent window plus anchoring context
- add a short-TTL cache for recent chat histories

---

## Rate Limiting

| Endpoint | Limit |
|----------|-------|
| `GET /api/chat/sessions` | 60 req/min per user |
| `GET /api/chat/sessions/:chatId/messages` | 60 req/min per user |
| `PATCH /api/chat/sessions/:chatId` | 20 req/min per user |
| `DELETE /api/chat/sessions/:chatId` | 20 req/min per user |
| `POST /api/ai/chat{,/v2}` | use existing chat-generation rate limit |

---

## Data Flow: Remote Mode (v2 Route)

```text
Browser                                  Server
  |                                         |
  | POST initial turn                       |
  | {chatId, connectionId, message:user}    |
  |---------------------------------------->|
  |                                         | verify user
  |                                         | load/create session
  |                                         | validate connectionId
  |                                         | load persisted messages
  |                                         | replaceOrAppendMessageById(user)
  |                                         | upsert user message
  |                                         | generate
  |<------------- stream -------------------|
  |                                         | onFinish -> upsert final assistant
  |                                         |
  | client tools run locally                |
  |                                         |
  | POST continuation                       |
  | {chatId, connectionId,                  |
  |  continuation:true,                     |
  |  message:assistantWithToolResults}      |
  |---------------------------------------->|
  |                                         | verify user
  |                                         | load session
  |                                         | validate connectionId
  |                                         | load persisted messages
  |                                         | verify assistant id exists
  |                                         | replaceOrAppendMessageById(assistant)
  |                                         | upsert continuation assistant
  |                                         | generate continuation
  |<------------- stream -------------------|
  |                                         | onFinish -> upsert final assistant
```

---

## Security Requirements

Remote mode must enforce:

- verified identity required
- client cannot choose `ownerUserId`
- client cannot control persistence mode
- client cannot persist arbitrary prior history via full-history posts
- server reloads persisted history on every remote request
- `connectionId` is trusted only on session creation
- continuation requests may only target an existing assistant message with the same id
- all durable writes are idempotent
- `ephemeral` requests never create durable records

### Deployment requirements

1. authentication required for remote mode
2. SQL backend connection configured
3. if proxy-header auth is used, the proxy must strip client-supplied identity headers and inject trusted ones
4. application code, not the database, is responsible for cascading deletes and referential cleanup

---

## File Locations

### Client-side

| File | Purpose |
|------|---------|
| `src/components/chat/session/session-repository.ts` | `SessionRepository` interface |
| `src/components/chat/session/local-session-repository.ts` | local repository implementation |
| `src/components/chat/session/remote-session-repository.ts` | HTTP-backed repository |
| `src/components/chat/session/session-repository-factory.ts` | chooses the active session repository |
| `src/components/runtime-config-provider.tsx` | shared runtime config source for client-side persistence mode |

### Server-side

| File | Purpose |
|------|---------|
| `src/lib/auth/resolve-user-identity.ts` | verified user resolution |
| `src/lib/ai/session/server-session-repository.ts` | server repository interface and persisted types |
| `src/lib/ai/session/server-session-repository-config.ts` | server-side repository mode and SQL config resolution |
| `src/lib/ai/session/server-session-repository-factory.ts` | chooses the active server repository |
| `src/lib/ai/session/impl/server-session-repository-noop.ts` | local-mode no-op implementation |
| `src/lib/ai/session/impl/server-session-repository-mysql.ts` | SQL-backed server repository implementation |
| `src/lib/ai/session/remote-chat-request.ts` | remote request parsing and validation helpers |
| `src/lib/ai/session/serialization.ts` | persisted message serialization helpers |
| `resources/database/mysql.sql` | MySQL schema for chat session persistence |
| `src/app/api/chat/sessions/route.ts` | list sessions |
| `src/app/api/chat/sessions/[chatId]/route.ts` | get/patch/delete session |
| `src/app/api/chat/sessions/[chatId]/messages/route.ts` | get session messages |
| `src/app/layout.tsx` + `src/components/runtime-config-provider.tsx` | inject runtime mode into shared client config |

---

## Decisions

| Question | Decision | Rationale |
|----------|----------|-----------|
| Primary DB recommendation | **MySQL first** | Best fit for the current row-upsert remote design |
| Secondary DB recommendation | **PostgreSQL second** | Also a strong fit; easy follow-on support |
| ClickHouse-first support | **Only with alternate append-only design** | Current continuation flow performs updates |
| Foreign keys | **Do not use** | Integrity and cleanup stay in application code |
| JSON columns | **Do not use** | Store structured payloads as serialized text for cross-engine consistency |
| Persistence mode source | **Server config only** | Avoids client-controlled trust decisions |
| Continuation client detection | **`lastAssistantMessageIsCompleteWithToolCalls`** | Same signal as AI SDK auto-resend |
| Continuation server validation | **Payload shape + existing assistant id** | Validate from durable state |
| History merge rule | **Replace-or-append by `message.id`** | Prevents duplicates on retries |
| `connectionId` handling | **Trust only on create; reject mismatch later** | Prevents spoofed rebinds |
| Durable final write point | **`toUIMessageStream({ onFinish })`** | Server-side authoritative completion hook |

---

## Implementation Order

### Phase 0: Prerequisites

1. add `chatId`, `connectionId`, `ephemeral` request support
2. add mode-aware request shaping in `ChatFactory`
3. add continuation detection helper
4. add verified identity helper

### Phase 1: Client Abstraction

5. add `SessionRepository`
6. refactor local repository into `LocalSessionRepository`
7. refactor `SessionManager` to use storage abstraction
8. add `RemoteSessionRepository`

### Phase 2: Server Persistence

9. add the SQL schema for MySQL in `resources/database/mysql.sql`
10. add `ServerSessionRepository`
11. implement shared remote merge/validation helpers and app-managed cascade delete
12. update v2 route
13. defer v1 route persistence
14. add narrow history APIs
15. defer rate limiting to follow-up work

### Phase 3: Validation

16. unit tests for local and remote client storage
17. unit tests for `SessionManager`
18. integration tests for:
   - initial remote turn
   - continuation remote turn
   - ephemeral flow
   - ownership enforcement
   - idempotent retries
19. run `npm run typecheck`
20. run `npm run format`
21. run `npm run lint`
22. run `npm run test`

---

## Summary

For the row-upsert persistence design in this document:

- local mode stays as-is
- remote mode is server-authoritative
- every remote request reloads persisted history
- all remote requests merge by `message.id`
- final AI persistence happens in server-side `onFinish`
- **MySQL is the first recommended backend**

If the team wants ClickHouse as the first storage engine, we should treat that as a different persistence architecture based on append-only events rather than in-place upserts.

## Current Implementation Notes

- The current worktree includes a MySQL schema file at `resources/database/mysql.sql`.
- PostgreSQL query support exists in the SQL-backed repository, but a dedicated PostgreSQL schema script is still follow-up work.
- The `GET /api/chat/sessions/:chatId/messages` endpoint currently returns the full message list for a session; pagination is deferred.
- Rate limiting is not yet implemented in this worktree.
