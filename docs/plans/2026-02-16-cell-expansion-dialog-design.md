# Cell Expansion Dialog Design

## Problem

Table cells in the AI chat use `whitespace-nowrap`, truncating long strings visually. Users need a way to view full cell content.

## Solution

Add a click-to-open dialog feature to DataTable. Clicking any cell opens a modal showing the complete value.

## Design

### DataTable Changes

- New prop: `enableCellExpansion?: boolean` (default: false)
- New state: `expandedCellContent: { column: string; value: unknown } | null`
- On cell click: set state with column name and value
- Render Dialog when content is set

Cell click is separate from `onRowClick` - both coexist. The existing `enableShowRowDetail` feature remains unchanged.

### Dialog UI

- **Header:** Column name (e.g., "Column: query")
- **Body:** Plain text with `whitespace-pre-wrap`, `font-mono`, max height with scroll
- **Footer:** Copy button
- **Close:** Click outside, Escape key, or X button

Objects/arrays display as JSON stringified.

### Integration

Enable in `QueryResponseTableView`:

```tsx
<DataTable
  enableCellExpansion={true}
  // ...existing props
/>
```

Other DataTable usages remain unchanged (opt-in later if needed).

## Files to Modify

1. `src/components/shared/dashboard/data-table.tsx` - Add dialog and prop
2. `src/components/query-tab/query-response/query-response-table-view.tsx` - Enable feature
