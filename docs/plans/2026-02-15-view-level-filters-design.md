# View-Level Filters for Custom Dashboard

## Summary

Add view-level filters to custom dashboards, allowing each view to have its own filter configuration (select filters, time range, text input) with persisted filter state.

## Requirements

- **Filter types:** Select dropdowns, time range picker, and free-form text input
- **Scope:** View-specific - each view has its own filter configuration AND filter values
- **Configuration:** Edit mode UI with "Add Filter" button
- **Data source:** SQL query or static values (user chooses per filter)
- **SQL integration:** Template placeholder (`{filterExpression}`) in widget queries

## Data Model

### Updated `DashboardView` interface

```typescript
export interface DashboardView {
  id: string;
  name: string;
  description?: string;
  dashboard: Dashboard;
  // NEW: Filter configuration for this view
  filterSpecs?: FilterSpec[];
  // NEW: Persisted filter state (selected values)
  filterState?: {
    timeSpan?: { label: string; from: string; to: string };
    selectors?: Record<string, { comparator: string; values: string[] }>;
  };
  createdAt: string;
  updatedAt: string;
}
```

- `filterSpecs` defines what filters appear (select filters, date/time filters)
- `filterState` persists user's current filter selections, restored when switching views
- Both optional for backward compatibility

## UI Components

### Edit Mode Filter Bar

- "Add Filter" button next to "Add Widget" in edit mode header
- Opens Filter Configuration Dialog

### Filter Configuration Dialog

```
┌─────────────────────────────────────────────────┐
│ Add Filter                                      │
├─────────────────────────────────────────────────┤
│ Filter Type:  ○ Select  ○ Date/Time             │
│                                                 │
│ Display Name: [________________]                │
│                                                 │
│ Column Name:  [________________]                │
│                                                 │
│ Data Source:  ○ SQL Query  ○ Static Values      │
│                                                 │
│ SQL Query:    [SELECT DISTINCT db FROM...]      │
│   - or -                                        │
│ Static Values: [value1, value2, value3]         │
│                                                 │
│              [Cancel]  [Add Filter]             │
└─────────────────────────────────────────────────┘
```

### Filter Management in Edit Mode

- Existing filters shown as removable chips/tags in filter bar
- Click filter chip to edit, X button to remove

### View Mode

- Render standard `DashboardFilterComponent` with view's `filterSpecs`
- Filter changes update `filterState` and refresh all widgets

## Data Flow

### Filter → Widget Integration

1. User selects filter values in filter bar
2. `DashboardFilterComponent` produces `filterExpression` string (e.g., `database = 'default' AND table = 'users'`)
3. Widget SQL queries use `{filterExpression}` placeholder in WHERE clause
4. `DashboardPanelContainer` replaces placeholder and executes queries

### Example Widget SQL

```sql
SELECT count(*) FROM system.tables
WHERE {filterExpression}
```

### Filter State Persistence

1. Filter values change → update `view.filterState` in memory
2. On view switch or save → persist to localStorage via `saveDashboard()`
3. When view loads → restore `filterState` and apply to filter component

### View Switch Flow

```
User clicks different view tab
  → Save current view's filterState
  → Load new view's filterSpecs into DashboardFilterComponent
  → Restore new view's filterState (selected values)
  → Refresh widgets with new filter expression
```

## File Changes

| File | Changes |
|------|---------|
| `dashboard-types.ts` | Add `filterSpecs` and `filterState` to `DashboardView` interface |
| `dashboard-tab.tsx` | Pass `filterSpecs` to `DashboardPage`, handle filter state persistence on view switch |
| `dashboard-filter-config-dialog.tsx` (NEW) | Dialog for adding/editing filters with form fields |
| `dashboard-layout-editor.tsx` | Add "Add Filter" button, render filter chips for editing/removing |

## Estimated Scope

~300-400 lines of new code, mostly in the new dialog component.
