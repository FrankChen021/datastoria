# Cell Expansion Dialog Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add click-to-expand feature for table cells so users can view full content of truncated strings.

**Architecture:** Add `enableCellExpansion` prop to DataTable. When enabled, clicking any cell opens a Dialog showing the full value with a copy button.

**Tech Stack:** React, Radix Dialog, existing CopyButton component

---

### Task 1: Add Cell Expansion State and Props to DataTable

**Files:**
- Modify: `src/components/shared/dashboard/data-table.tsx:210-269` (props interface)
- Modify: `src/components/shared/dashboard/data-table.tsx:271-296` (component signature)

**Step 1: Add the new prop to DataTableProps interface**

In `DataTableProps` interface (around line 210), add after `enableCompactMode`:

```typescript
  /**
   * Enable cell expansion dialog (default: false)
   * When enabled, clicking any cell opens a dialog showing the full cell content
   */
  enableCellExpansion?: boolean;
```

**Step 2: Add the prop to component destructuring**

In the component function (around line 271), add to the destructured props after `enableCompactMode = false`:

```typescript
    enableCellExpansion = false,
```

**Step 3: Add state for expanded cell content**

After the `columnVisibility` state (around line 327), add:

```typescript
  // Cell expansion dialog state
  const [expandedCell, setExpandedCell] = useState<{ column: string; value: unknown } | null>(null);
```

**Step 4: Commit**

```bash
git add src/components/shared/dashboard/data-table.tsx
git commit -m "feat(data-table): add enableCellExpansion prop and state"
```

---

### Task 2: Add Cell Click Handler

**Files:**
- Modify: `src/components/shared/dashboard/data-table.tsx`

**Step 1: Add the cell click handler function**

After the `toggleRowExpansion` callback (around line 340), add:

```typescript
  // Handle cell click for expansion
  const handleCellClick = useCallback(
    (e: React.MouseEvent, column: string, value: unknown) => {
      if (!enableCellExpansion) return;
      e.stopPropagation(); // Don't trigger row click
      setExpandedCell({ column, value });
    },
    [enableCellExpansion]
  );
```

**Step 2: Commit**

```bash
git add src/components/shared/dashboard/data-table.tsx
git commit -m "feat(data-table): add cell click handler for expansion"
```

---

### Task 3: Update DataTableRow to Accept Cell Click Handler

**Files:**
- Modify: `src/components/shared/dashboard/data-table.tsx:27-45` (DataTableRowProps interface)
- Modify: `src/components/shared/dashboard/data-table.tsx:48-62` (component params)

**Step 1: Add props to DataTableRowProps interface**

Add after `getCellAlignmentClass` (around line 43):

```typescript
  onCellClick?: (e: React.MouseEvent, column: string, value: unknown) => void;
  enableCellExpansion: boolean;
```

**Step 2: Add to component destructuring**

In the DataTableRow component (around line 62), add after `additionalProps`:

```typescript
  onCellClick,
  enableCellExpansion,
```

**Step 3: Update the TableCell rendering to be clickable**

Replace the cell rendering block (around lines 131-142) with:

```typescript
          return (
            <TableCell
              key={fieldOption.name}
              className={cn(
                getCellAlignmentClass(fieldOption),
                "whitespace-nowrap",
                cellPaddingClass,
                enableCellExpansion && "cursor-pointer hover:bg-muted/30"
              )}
              onClick={(e) => onCellClick?.(e, fieldOption.name!, row[fieldOption.name])}
            >
              {formatCellValue(row[fieldOption.name], fieldOption, row)}
            </TableCell>
          );
```

**Step 4: Commit**

```bash
git add src/components/shared/dashboard/data-table.tsx
git commit -m "feat(data-table): make cells clickable when expansion enabled"
```

---

### Task 4: Pass Props to DataTableRow in renderData

**Files:**
- Modify: `src/components/shared/dashboard/data-table.tsx:928-996` (renderData function)

**Step 1: Update DataTableRow usage**

In the `renderData` function where `DataTableRow` is rendered (around line 956), add the new props:

```typescript
            <DataTableRow
              key={virtualRow.key}
              row={row}
              rowIndex={rowIndex}
              isExpanded={expandedRows.has(rowIndex)}
              isSelected={
                selectedRowId !== undefined &&
                selectedRowId !== null &&
                row[idField] === selectedRowId
              }
              enableShowRowDetail={enableShowRowDetail}
              enableIndexColumn={enableIndexColumn}
              enableCompactMode={enableCompactMode}
              visibleColumns={visibleColumns}
              onRowClick={onRowClick}
              onToggleExpansion={toggleRowExpansion}
              formatCellValue={formatCellValue}
              getCellAlignmentClass={getCellAlignmentClass}
              onCellClick={handleCellClick}
              enableCellExpansion={enableCellExpansion}
              additionalProps={{
                "data-index": virtualRow.index,
                style: {
                  contain: "layout style paint",
                  contentVisibility: "auto",
                },
              }}
            />
```

**Step 2: Commit**

```bash
git add src/components/shared/dashboard/data-table.tsx
git commit -m "feat(data-table): wire cell click handler to row component"
```

---

### Task 5: Add Dialog Import and Render

**Files:**
- Modify: `src/components/shared/dashboard/data-table.tsx:1-6` (imports)
- Modify: `src/components/shared/dashboard/data-table.tsx` (end of component, before final closing tags)

**Step 1: Add imports at top of file**

Add to the imports section:

```typescript
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { CopyButton } from "@/components/ui/copy-button";
```

**Step 2: Add helper function to format cell value for display**

After the `formatCellValue` callback (around line 808), add:

```typescript
  // Format cell value as string for the expansion dialog
  const formatCellValueAsString = useCallback((value: unknown): string => {
    if (value === null || value === undefined) {
      return "";
    }
    if (typeof value === "object") {
      return JSON.stringify(value, null, 2);
    }
    return String(value);
  }, []);
```

**Step 3: Add Dialog rendering before the final closing div**

Find the final return statement's closing `</div>` (around line 1088) and add the Dialog just before it:

```typescript
      {/* Cell Expansion Dialog */}
      {enableCellExpansion && (
        <Dialog open={expandedCell !== null} onOpenChange={(open) => !open && setExpandedCell(null)}>
          <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
            <DialogHeader>
              <DialogTitle className="text-sm font-medium">
                {expandedCell?.column}
              </DialogTitle>
            </DialogHeader>
            <div className="relative flex-1 min-h-0">
              <div className="overflow-auto max-h-[60vh] p-4 bg-muted/30 rounded-md">
                <pre className="whitespace-pre-wrap break-words font-mono text-sm">
                  {expandedCell ? formatCellValueAsString(expandedCell.value) : ""}
                </pre>
              </div>
              <CopyButton
                value={expandedCell ? formatCellValueAsString(expandedCell.value) : ""}
                className="top-2 right-2"
              />
            </div>
          </DialogContent>
        </Dialog>
      )}
```

**Step 4: Commit**

```bash
git add src/components/shared/dashboard/data-table.tsx
git commit -m "feat(data-table): add cell expansion dialog"
```

---

### Task 6: Enable Feature in QueryResponseTableView

**Files:**
- Modify: `src/components/query-tab/query-response/query-response-table-view.tsx:57-66`

**Step 1: Add enableCellExpansion prop to DataTable**

Update the DataTable usage:

```typescript
  return (
    <div className="h-full w-full border-b">
      <DataTable
        data={parsedTableData.data}
        meta={parsedTableData.meta}
        fieldOptions={[]}
        enableIndexColumn={true}
        enableCompactMode={enableCompactMode}
        enableCellExpansion={true}
      />
    </div>
  );
```

**Step 2: Commit**

```bash
git add src/components/query-tab/query-response/query-response-table-view.tsx
git commit -m "feat(query-response): enable cell expansion in table view"
```

---

### Task 7: Manual Testing

**Step 1: Start the dev server**

Run: `npm run dev` or `pnpm dev`

**Step 2: Test in AI chat**

1. Open the AI chat
2. Run a query that returns data with long string values
3. Click on any cell in the results table
4. Verify the dialog opens showing the full content
5. Verify the column name is shown in the header
6. Click the copy button and verify content is copied
7. Press Escape or click outside to close
8. Verify row expansion (chevron) still works independently

**Step 3: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address issues found during testing"
```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Add prop and state | data-table.tsx |
| 2 | Add click handler | data-table.tsx |
| 3 | Update DataTableRow props | data-table.tsx |
| 4 | Wire handler to row | data-table.tsx |
| 5 | Add Dialog rendering | data-table.tsx |
| 6 | Enable in QueryResponseTableView | query-response-table-view.tsx |
| 7 | Manual testing | - |
