# Snippet Management Implementation Plan

This document outlines the implementation plan for the Snippet Management System in the ClickHouse Console.

## 1. Core Components & State

### A. `QuerySnippetManager` (Existing)
*   **Status:** Ready.
*   **Role:** Handles storage (localStorage), CRUD operations, and Ace Editor auto-completion integration.
*   **Action:** Ensure the `subscribe` method is working correctly to trigger UI updates across components.

### B. `SaveSnippetDialog` (New Component)
*   **Role:** A reusable dialog for creating and editing snippets.
*   **Props:** `open`, `onOpenChange`, `initialName`, `initialSql`, `onSaved`.
*   **Behavior:**
    *   Validates inputs (Name required, SQL required).
    *   Calls `QuerySnippetManager.addSnippet` (or update logic).
    *   Used by: Query Control Bar, Chat Blocks, and Snippet List (Edit mode).

## 2. Left Sidebar Restructuring

We will refactor the left panel in `MainPage` to support multiple views using a tabbed interface.

### A. `SidebarPanel` (New Wrapper)
*   **Role:** Replaces the direct usage of `SchemaTreeView` in `MainPage`.
*   **Structure:**
    *   Uses `Tabs` component.
    *   **Tab 1: "Database"** -> Renders existing `SchemaTreeView`.
    *   **Tab 2: "Snippets"** -> Renders new `SnippetListView`.

### B. `SnippetListView` (New Component)
*   **Role:** Displays the list of saved queries.
*   **Layout:**
    *   **Search Bar:** Filter snippets by name.
    *   **Sections:** "User Defined" and "Built-in".
*   **List Item Design:**
    *   **Icon:** `Code` (User) or `FileText` (Built-in).
    *   **Name:** Bold text.
    *   **Preview:** 1-line truncated SQL (gray text).
    *   **Tooltip:** Shows full SQL on hover for quick inspection.
*   **Actions (Hover/Context Menu):**
    *   **Run (`Play` icon):** Opens a new Query Tab with the SQL and executes it immediately via `TabManager.activateQueryTab({ query, execute: true })`.
    *   **Insert (`ArrowRight` icon):** Inserts SQL into the *currently active* Query Tab.
    *   **Edit (`Pencil` icon):**
        *   **User Defined:** Opens `SaveSnippetDialog` for direct editing.
        *   **Built-in:** Opens `SaveSnippetDialog` as a "Save As" / Clone operation (must save with new name).
    *   **Delete (`Trash` icon):** Deletes the snippet (User-defined only).

### C. Built-in vs User Snippet Policy
*   **Deletion:** Built-in snippets cannot be deleted (hidden action).
*   **Editing:** Built-in snippets are read-only templates. Editing them forces a "Save As" workflow to create a user-defined copy.

## 3. Integration Points

### A. Chat Integration (`MessageMarkdownSql`)
*   **Change:** Add a `Bookmark` icon button to the top-right action bar of SQL code blocks.
*   **Action:** Opens `SaveSnippetDialog` pre-filled with the AI-generated SQL.

### B. Query Control Bar (`QueryControl`)
*   **Change:** Add a `Save` button next to the "Run" button.
*   **Action:** Opens `SaveSnippetDialog` pre-filled with the current editor content (or selection).

## 4. The "Insert" Mechanism

To support "Insert into active editor" from the sidebar, we need a communication channel between the Sidebar and the active Query Tab.

*   **Event Bus:** Use a custom event `snippet-insert`.
*   **Implementation:**
    1.  `SnippetListView` dispatches: `window.dispatchEvent(new CustomEvent('snippet-insert', { detail: sql }))`.
    2.  `QueryTab` (specifically the active one) listens for this event.
    3.  **Logic:**
        *   If a Query Tab is active: Insert text at cursor position.
        *   If NO Query Tab is active: Open a new Query Tab with the text.

## 5. Implementation Order

1.  **`SaveSnippetDialog`**: Create the shared dialog component.
2.  **`SnippetListView`**: Build the list UI, search, and "Run/Delete" logic.
3.  **`SidebarPanel`**: Implement the tabs wrapper and integrate `SchemaTreeView` + `SnippetListView`.
4.  **`MainPage`**: Replace `SchemaTreeView` with `SidebarPanel`.
5.  **Events**: Implement the "Insert" event listener in `QueryTab`.
6.  **Entry Points**: Add buttons to `QueryControl` and `MessageMarkdownSql`.
