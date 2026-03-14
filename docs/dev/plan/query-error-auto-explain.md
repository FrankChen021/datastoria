# Query Error Auto Explain Plan

## Goal

Automatically explain eligible ClickHouse query errors inline in the query response view, while keeping the existing manual `Ask AI for Help` button available.

## Scope

- Add a persisted AI setting to enable or disable automatic explanation of ClickHouse errors.
- Keep a hardcoded blacklist of ClickHouse error codes that should not auto-trigger explanation.
- Reuse the existing AI chat streaming endpoint instead of opening the chat panel.
- Reuse the existing chat message rendering components to display the inline AI response.

## Non-Goals

- No user-configurable blacklist in this iteration.
- No changes to the existing manual `Ask AI for Help` chat-panel behavior.
- No new dedicated server endpoint unless reuse of `chat/v2` proves unworkable.

## Design

### Settings

- Extend the AI agent configuration with `autoExplainClickHouseErrors: boolean`.
- Surface the toggle under `AI > Agent`.
- Default to disabled to avoid surprising behavior changes.

### Blacklist

- Define a hardcoded array of ClickHouse error codes in query-response-related code.
- Blacklisted codes still show the manual `Ask AI for Help` button.
- Auto-explain is skipped when the current error code matches a blacklisted code.

### Inline Explain Flow

- In the query error view, detect when:
  - the error has a ClickHouse exception code
  - auto-explain is enabled
  - the code is not blacklisted
- Trigger the explain request once per query/error combination.
- Send the same `/explain_error_code ...` prompt shape already used by the manual button.
- Stream the assistant response from the existing `/api/ai/chat/v2` endpoint.
- Render the streamed result inline using the existing chat message component stack.

### State Handling

- Keep inline AI response state local to the query error view or a dedicated child component.
- Track `idle`, `streaming`, `done`, and `error` states.
- Abort in-flight requests when the component unmounts or the error context changes.

## Implementation Steps

1. Add a shared helper to build the explain-error prompt from SQL, error code, and error message.
2. Extend the AI agent configuration manager and settings UI with the auto-explain toggle.
3. Add a hardcoded blacklist constant and matching helper.
4. Create an inline query-error AI explanation component that:
   - starts a streamed request against `/api/ai/chat/v2`
   - converts the streamed response into a local assistant message
   - renders it with existing chat message components
5. Integrate the inline explanation component into the query error view.
6. Keep the existing manual `Ask AI for Help` button wired to the chat panel.
7. Run format and focused validation.

## Validation

- `npm run format`
- `npm run typecheck`
- Add or update focused tests if the touched area already has practical test coverage.
