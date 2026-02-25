import { Dialog } from "@/components/shared/use-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  SqlUtils,
  type SqlCustomSplitterOptions,
  type SqlStatementSplitter,
} from "@/lib/sql-utils";
import { Check } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

export interface ShowMultipleStatementsConfirmDialogOptions {
  source: "all" | "selection";
  sqlText: string;
  defaultFailureMode?: "abort" | "continue";
  defaultSplitter?: SqlStatementSplitter;
  defaultCustomSplitter?: SqlCustomSplitterOptions;
  onConfirm: (selectedStatements: string[], failureMode: "abort" | "continue") => void;
  onCancel?: () => void;
}

interface RunScriptConfirmDialogContentProps {
  sqlText: string;
  defaultFailureMode: "abort" | "continue";
  defaultSplitter: SqlStatementSplitter;
  defaultCustomSplitter: SqlCustomSplitterOptions;
  onSelectionChange: (selectedIndexes: number[]) => void;
  onFailureModeChange: (failureMode: "abort" | "continue") => void;
  onStatementsChange: (statements: string[]) => void;
}

function RunScriptConfirmDialogContent({
  sqlText,
  defaultFailureMode,
  defaultSplitter,
  defaultCustomSplitter,
  onSelectionChange,
  onFailureModeChange,
  onStatementsChange,
}: RunScriptConfirmDialogContentProps) {
  const [splitter, setSplitter] = useState<SqlStatementSplitter>(defaultSplitter);
  const [customSplitter, setCustomSplitter] =
    useState<SqlCustomSplitterOptions>(defaultCustomSplitter);
  const [selectedIndexes, setSelectedIndexes] = useState<number[]>([]);
  const [failureMode, setFailureMode] = useState<"abort" | "continue">(defaultFailureMode);

  const statements = useMemo(
    () => SqlUtils.splitSqlStatements(sqlText, splitter, customSplitter),
    [sqlText, splitter, customSplitter]
  );

  useEffect(() => {
    setSelectedIndexes(statements.map((_, index) => index));
  }, [statements]);

  useEffect(() => {
    onStatementsChange(statements);
  }, [onStatementsChange, statements]);

  useEffect(() => {
    onSelectionChange(selectedIndexes);
  }, [onSelectionChange, selectedIndexes]);

  useEffect(() => {
    onFailureModeChange(failureMode);
  }, [failureMode, onFailureModeChange]);

  const allSelected = selectedIndexes.length === statements.length && statements.length > 0;

  const toggleSelection = (index: number) => {
    setSelectedIndexes((prev) =>
      prev.includes(index)
        ? prev.filter((item) => item !== index)
        : [...prev, index].sort((a, b) => a - b)
    );
  };

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIndexes([]);
      return;
    }
    setSelectedIndexes(statements.map((_, index) => index));
  };

  return (
    <div className="grid gap-2 pt-2">
      <div className="flex items-center gap-4">
        <Label className="mb-0">Splitter</Label>
        <label className="inline-flex items-center gap-2 text-sm whitespace-nowrap">
          <input
            type="radio"
            name="statement-splitter"
            value="semicolon"
            checked={splitter === "semicolon"}
            onChange={() => setSplitter("semicolon")}
          />
          Semicolon (;)
        </label>
        <label className="inline-flex items-center gap-2 text-sm whitespace-nowrap">
          <input
            type="radio"
            name="statement-splitter"
            value="newline"
            checked={splitter === "newline"}
            onChange={() => setSplitter("newline")}
          />
          Newline
        </label>
        <label className="inline-flex items-center gap-2 text-sm whitespace-nowrap">
          <input
            type="radio"
            name="statement-splitter"
            value="custom"
            checked={splitter === "custom"}
            onChange={() => setSplitter("custom")}
          />
          Custom
        </label>
        <div className="relative w-full">
          <Input
            value={customSplitter.value}
            onChange={(event) =>
              setCustomSplitter((prev) => ({
                ...prev,
                value: event.target.value,
              }))
            }
            placeholder="Custom splitter"
            disabled={splitter !== "custom"}
            className="h-7 pr-12 pl-2 text-left text-sm [direction:ltr]"
          />
          <Button
            type="button"
            disabled={splitter !== "custom"}
            variant={customSplitter.isRegex ? "secondary" : "ghost"}
            className="absolute right-1 top-1/2 h-5 -translate-y-1/2 px-1.5 text-[10px] gap-1"
            onClick={() =>
              setCustomSplitter((prev) => ({
                ...prev,
                isRegex: !prev.isRegex,
              }))
            }
            title="Toggle regular expression mode"
          >
            {customSplitter.isRegex && <Check className="!h-2 !w-2" />}
            RE
          </Button>
        </div>
      </div>

      <div className="max-h-[360px] overflow-auto rounded-md border">
        <table className="min-w-[760px] w-full caption-bottom text-sm">
          <thead className="sticky top-0 z-10 bg-background [&_tr]:border-b">
            <tr className="border-b transition-colors hover:bg-muted/50">
              <th className="w-14 bg-background px-3 py-2 text-center align-middle font-medium text-muted-foreground">
                <input
                  type="checkbox"
                  checked={allSelected}
                  aria-label="Select all statements"
                  onChange={toggleSelectAll}
                />
              </th>
              <th className="w-16 bg-background px-3 py-2 text-left align-middle font-medium text-muted-foreground">
                #
              </th>
              <th className="bg-background px-3 py-2 text-left align-middle font-medium text-muted-foreground">
                SQL
              </th>
            </tr>
          </thead>
          <tbody className="[&_tr:last-child]:border-0">
            {statements.map((statement, index) => (
              <tr
                key={`stmt-${index}`}
                className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted"
              >
                <td className="px-3 py-2 text-center align-middle">
                  <input
                    type="checkbox"
                    checked={selectedIndexes.includes(index)}
                    aria-label={`Select statement ${index + 1}`}
                    onChange={() => toggleSelection(index)}
                  />
                </td>
                <td className="px-3 py-2 align-middle">{index + 1}</td>
                <td className="px-3 py-2 align-middle">
                  <pre className="text-xs leading-5 whitespace-pre-wrap break-all">{statement}</pre>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-4">
        <Label className="mb-0">Failure Mode</Label>
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="failure-mode"
            value="abort"
            checked={failureMode === "abort"}
            onChange={() => setFailureMode("abort")}
          />
          Abort on first failure
        </label>
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="failure-mode"
            value="continue"
            checked={failureMode === "continue"}
            onChange={() => setFailureMode("continue")}
          />
          Continue on failure
        </label>
      </div>
    </div>
  );
}

export function showMultipleStatementsConfirmDialog({
  source,
  sqlText,
  defaultFailureMode = "abort",
  defaultSplitter = "semicolon",
  defaultCustomSplitter = { value: ";", isRegex: false },
  onConfirm,
  onCancel,
}: ShowMultipleStatementsConfirmDialogOptions) {
  let currentStatements = SqlUtils.splitSqlStatements(
    sqlText,
    defaultSplitter,
    defaultCustomSplitter
  );
  let selectedIndexes = currentStatements.map((_, index) => index);
  let failureMode: "abort" | "continue" = defaultFailureMode;

  const getSelectedStatements = () =>
    selectedIndexes
      .map((index) => currentStatements[index])
      .filter((statement): statement is string => statement !== undefined);

  Dialog.showDialog({
    title: "SQL Execution Confirmation",
    description: `${source === "selection" ? "Selected text" : "Editor content"} will be executed as batch SQLs. Confirm statements and options before execution.`,
    className: "sm:max-w-[900px]",
    mainContent: (
      <RunScriptConfirmDialogContent
        sqlText={sqlText}
        defaultFailureMode={defaultFailureMode}
        defaultSplitter={defaultSplitter}
        defaultCustomSplitter={defaultCustomSplitter}
        onStatementsChange={(nextStatements) => {
          currentStatements = nextStatements;
          selectedIndexes = nextStatements.map((_, index) => index);
        }}
        onSelectionChange={(nextSelectedIndexes) => {
          selectedIndexes = nextSelectedIndexes;
        }}
        onFailureModeChange={(nextFailureMode) => {
          failureMode = nextFailureMode;
        }}
      />
    ),
    dialogButtons: [
      {
        text: "Cancel",
        default: false,
        variant: "outline",
        onClick: async () => {
          onCancel?.();
          return true;
        },
      },
      {
        text: "Execute",
        default: true,
        onClick: async () => {
          const selectedStatements = getSelectedStatements();
          if (selectedStatements.length === 0) {
            Dialog.alert({
              title: "No statements selected",
              description: "Select at least one statement to execute.",
            });
            return false;
          }
          onConfirm(selectedStatements, failureMode);
          return true;
        },
      },
    ],
  });
}
