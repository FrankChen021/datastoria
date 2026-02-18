import { useConnection } from "@/components/connection/connection-context";
import { StatusPopover } from "@/components/connection/connection-edit-component";
import type { QueryContext } from "@/components/settings/query-context/query-context";
import { QueryContextManager } from "@/components/settings/query-context/query-context-manager";
import FloatingProgressBar from "@/components/shared/floating-progress-bar";
import { SuggestionList } from "@/components/shared/suggestion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { preprocessAdmonitions } from "@/lib/clickhouse/admonition-preprocessor";
import { transformMarkdownLink } from "@/lib/clickhouse/clickhouse-docs-link";
import { type JSONCompactFormatResponse, type QueryError } from "@/lib/connection/connection";
import { toastManager } from "@/lib/toast";
import { AlertCircle, Check, Info, Plus, Trash2 } from "lucide-react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";

/**
 * Transforms markdown links in descriptions from relative URLs to absolute ClickHouse documentation URLs.
 */
function transformMarkdownLinks(description: string): string {
  if (!description) return description;

  const markdownLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;

  return description.replace(markdownLinkRegex, (match, linkText, url) => {
    const absoluteUrl = transformMarkdownLink("setting", url);
    return absoluteUrl !== url ? `[${linkText}](${absoluteUrl})` : match;
  });
}

/* Match query-input-view.css admonition styles (query-suggestion-manager ACE editor) */
const admonitionStyles =
  "[&_.admonition]:my-2 [&_.admonition]:py-2 [&_.admonition]:px-3 [&_.admonition]:text-xs [&_.admonition]:border-l [&_.admonition]:border-l-border [&_.admonition]:rounded-r [&_.admonition]:rounded-l-none " +
  "[&_.admonition-title]:font-bold [&_.admonition-title]:mb-1 [&_.admonition-title]:uppercase [&_.admonition-title]:text-[11px] [&_.admonition-title]:opacity-90 " +
  "[&_.admonition-content]:whitespace-normal [&_.admonition-content_p]:mb-2 [&_.admonition-content_p:last-child]:mb-0 " +
  "[&_.admonition.note]:border-l-blue-400 [&_.admonition.note]:bg-blue-400/10 dark:[&_.admonition.note]:border-l-blue-500 dark:[&_.admonition.note]:bg-blue-500/15 " +
  "[&_.admonition.warning]:border-l-amber-500 [&_.admonition.warning]:bg-amber-500/15 dark:[&_.admonition.warning]:border-l-amber-400 dark:[&_.admonition.warning]:bg-amber-400/20 " +
  "[&_.admonition.tip]:border-l-emerald-500 [&_.admonition.tip]:bg-emerald-500/15 dark:[&_.admonition.tip]:border-l-emerald-400 dark:[&_.admonition.tip]:bg-emerald-400/20 " +
  "[&_.admonition.danger]:border-l-red-500 [&_.admonition.danger]:bg-red-500/15 dark:[&_.admonition.danger]:border-l-red-400 dark:[&_.admonition.danger]:bg-red-400/20 " +
  "[&_.admonition.important]:border-l-violet-500 [&_.admonition.important]:bg-violet-500/15 dark:[&_.admonition.important]:border-l-violet-400 dark:[&_.admonition.important]:bg-violet-400/20";

/** Description render with admonition support. Used for SuggestionList and HoverCard. Expects descriptionMarkdown to be preprocessed (transformMarkdownLinks + preprocessAdmonitions) at load time. */
function SettingsDescriptionWithAdmonition({
  descriptionMarkdown,
}: {
  descriptionMarkdown: string;
}) {
  return (
    <div
      className={`text-sm text-foreground [&_p]:mb-2 [&_p:last-child]:mb-0 [&_ul]:list-disc [&_ul]:ml-4 [&_ul]:mb-2 [&_ol]:list-decimal [&_ol]:ml-4 [&_ol]:mb-2 [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-xs [&_code]:font-mono [&_pre]:bg-muted [&_pre]:p-2 [&_pre]:rounded [&_pre]:overflow-x-auto [&_pre]:mb-2 [&_pre_code]:block [&_pre_code]:p-0 [&_pre_code]:bg-transparent [&_pre_code]:m-0 [&_strong]:font-semibold [&_em]:italic ${admonitionStyles}`}
    >
      <ReactMarkdown
        rehypePlugins={[rehypeRaw]}
        components={{
          a: ({ ...props }) => (
            <a
              {...props}
              style={{
                color: "#0070f3",
                textDecoration: "underline",
              }}
              target="_blank"
              rel="noopener noreferrer"
            />
          ),
        }}
      >
        {descriptionMarkdown || "No description available."}
      </ReactMarkdown>
    </div>
  );
}

interface SettingRow {
  name: string;
  type: string;
  value: string;
  description: string;
  readonly?: boolean;
}

interface SystemSetting {
  name: string;
  type: string;
  description: string;
  default: string;
  readonly: boolean;
}

type BottomSectionContent = { type: "error"; message: string } | null;

function ErrorMessage({ message, title }: { message: string; title?: string }) {
  return (
    <div className="w-full rounded-t-none border-t-0 max-h-[140px] flex flex-col mt-4">
      <Alert
        variant="destructive"
        className="border rounded-md p-3 h-full flex items-start bg-destructive/10 dark:bg-destructive/20"
      >
        <div className="flex items-start gap-2 w-full h-full min-h-0">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0 min-h-0 flex flex-col">
            <AlertTitle className="text-sm shrink-0">{title || "Error"}</AlertTitle>
            <AlertDescription className="mt-1 break-words overflow-wrap-anywhere whitespace-pre-wrap text-xs overflow-y-auto flex-1 min-h-0">
              {message}
            </AlertDescription>
          </div>
        </div>
      </Alert>
    </div>
  );
}

function BoolSettingSwitch({
  value,
  onCheckedChange,
  disabled,
}: {
  value: string;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  const checked = value === "true" || value === "1";
  return (
    <div className="flex items-center gap-2">
      <Switch checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
      <span className="text-muted-foreground text-sm">{checked ? "true" : "false"}</span>
    </div>
  );
}

interface SettingNameInputWithSuggestionsProps {
  row: SettingRow;
  rowIndex: number;
  availableSettings: SystemSetting[];
  existingRows: SettingRow[];
  onNameChange?: (index: number, name: string) => void;
  onCancel: () => void;
  isLastRow?: boolean;
}

function SettingNameInputWithSuggestions({
  row,
  rowIndex,
  availableSettings,
  existingRows,
  onNameChange,
  onCancel,
  isLastRow = false,
}: SettingNameInputWithSuggestionsProps) {
  const [isEditing, setIsEditing] = useState(false);
  const hasAutoOpenedRef = useRef(false);

  const availableSettingsForRow = useMemo(() => {
    return availableSettings.filter(
      (s) => !existingRows.some((r, i) => i !== rowIndex && r.name === s.name)
    );
  }, [availableSettings, existingRows, rowIndex]);

  useEffect(() => {
    if (!row.name.trim() && !isEditing && isLastRow && !hasAutoOpenedRef.current) {
      hasAutoOpenedRef.current = true;
      setIsEditing(true);
    }
  }, [row.name, isEditing, isLastRow]);

  const handleFocus = useCallback(() => {
    setIsEditing(true);
  }, []);

  const handleSelectSetting = useCallback(
    (setting: SystemSetting) => {
      if (onNameChange) {
        onNameChange(rowIndex, setting.name);
      }
      setIsEditing(false);
    },
    [onNameChange, rowIndex]
  );

  const handleCancel = useCallback(() => {
    setIsEditing(false);
    if (!row.name.trim()) {
      onCancel();
    }
  }, [onCancel, row.name]);

  if (isEditing) {
    return (
      <SuggestionList
        items={availableSettingsForRow.map((s) => ({
          name: s.name,
          descriptionMarkdown: `**Type:** \`${s.type}\`\n\n**Value:** \`${s.default ? s.default : "—"}\`\n\n${s.description || ""}`,
          tag: s.readonly ? (
            <Badge variant="secondary" className="ml-2 shrink-0 text-[9px] py-0 px-1.5">
              readonly
            </Badge>
          ) : undefined,
        }))}
        onSelect={(item) => {
          const setting = availableSettingsForRow.find((s) => s.name === item.name);
          if (setting) {
            handleSelectSetting(setting);
          }
        }}
        descriptionRender={(md) => <SettingsDescriptionWithAdmonition descriptionMarkdown={md} />}
        initialValue={row.name}
        onValueChange={(value) => {
          if (onNameChange) {
            onNameChange(rowIndex, value);
          }
        }}
        onCancel={handleCancel}
        placeholder="Type to search settings..."
        className="w-full h-8"
      />
    );
  }

  const nameContent = (
    <div
      className="text-sm font-medium truncate min-h-[32px] flex items-center min-w-0 cursor-pointer hover:underline"
      onClick={handleFocus}
    >
      {row.name || <span className="text-muted-foreground italic">Click to edit</span>}
    </div>
  );

  if (row.description) {
    return (
      <HoverCard openDelay={200} closeDelay={100}>
        <HoverCardTrigger asChild>{nameContent}</HoverCardTrigger>
        <HoverCardContent
          className="z-[10000] w-[300px] max-h-[300px] overflow-y-auto p-3"
          align="start"
          side="left"
        >
          <SettingsDescriptionWithAdmonition descriptionMarkdown={row.description} />
        </HoverCardContent>
      </HoverCard>
    );
  }

  return nameContent;
}

interface SettingTableRowProps {
  row: SettingRow;
  index: number;
  availableSettings: SystemSetting[];
  existingRows: SettingRow[];
  onNameChange: (index: number, name: string) => void;
  renderValueInput: (row: SettingRow, index: number) => React.ReactNode;
  handleRemoveRow: (index: number) => void;
}

function SettingTableRow({
  row,
  index,
  availableSettings,
  existingRows,
  onNameChange,
  renderValueInput,
  handleRemoveRow,
}: SettingTableRowProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleDeleteCancel = useCallback(() => {
    setShowDeleteConfirm(false);
  }, []);

  const onDeleteClick = useCallback(() => {
    handleRemoveRow(index);
    setShowDeleteConfirm(false);
  }, [handleRemoveRow, index]);

  return (
    <TableRow key={index} className="h-10">
      <TableCell className="py-1.5">
        <SettingNameInputWithSuggestions
          row={row}
          rowIndex={index}
          availableSettings={availableSettings}
          existingRows={existingRows}
          onNameChange={onNameChange}
          onCancel={onDeleteClick}
          isLastRow={index === existingRows.length - 1}
        />
      </TableCell>
      <TableCell className="py-1.5">
        <div className="text-sm text-muted-foreground truncate">{row.type}</div>
      </TableCell>
      <TableCell className="py-1.5 text-center">
        {row.readonly ? (
          <Check className="h-4 w-4 text-muted-foreground inline-block" />
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="py-1.5 min-w-[150px]">{renderValueInput(row, index)}</TableCell>
      <TableCell className="py-1.5">
        <div className="flex items-center gap-1">
          <StatusPopover
            open={showDeleteConfirm}
            onOpenChange={setShowDeleteConfirm}
            trigger={
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowDeleteConfirm(true)}
                className="h-7 w-7"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            }
            side="left"
            align={"end"}
            icon={
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-red-600 dark:text-red-400" />
            }
            title="Confirm deletion"
          >
            <div className="text-xs mb-3">Are you sure to delete this setting?</div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8"
                onClick={handleDeleteCancel}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="h-8"
                onClick={onDeleteClick}
              >
                Delete
              </Button>
            </div>
          </StatusPopover>
        </div>
      </TableCell>
    </TableRow>
  );
}

export function QueryContextEdit() {
  const { connection } = useConnection();
  const [rows, setRows] = useState<SettingRow[]>([]);
  const [availableSettings, setAvailableSettings] = useState<SystemSetting[]>([]);
  const [isLoadingSettings, setIsLoadingSettings] = useState(false);
  const [bottomSectionContent, setBottomSectionContent] = useState<BottomSectionContent>(null);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const [isChanged, setIsChanged] = useState(false);
  const [initialSettings, setInitialSettings] = useState<SettingRow[]>([]);

  useEffect(() => {
    const context = QueryContextManager.getInstance().getStoredContext();
    const contextRows: SettingRow[] = [];

    if (context.opentelemetry_start_trace_probability !== undefined) {
      contextRows.push({
        name: "opentelemetry_start_trace_probability",
        type: "Float",
        value: String(context.opentelemetry_start_trace_probability),
        description: "Enable OpenTelemetry Tracing",
      });
    }
    if (context.output_format_pretty_row_numbers !== undefined) {
      contextRows.push({
        name: "output_format_pretty_row_numbers",
        type: "Bool",
        value: String(context.output_format_pretty_row_numbers),
        description: "Show row numbers in query results",
      });
    }
    if (context.output_format_pretty_max_rows !== undefined) {
      contextRows.push({
        name: "output_format_pretty_max_rows",
        type: "UInt64",
        value: String(context.output_format_pretty_max_rows),
        description: "Maximum number of result rows",
      });
    }
    if (context.max_execution_time !== undefined) {
      contextRows.push({
        name: "max_execution_time",
        type: "Seconds",
        value: String(context.max_execution_time),
        description: "Maximum execution time in seconds",
      });
    }

    Object.keys(context).forEach((key) => {
      if (
        ![
          "opentelemetry_start_trace_probability",
          "output_format_pretty_row_numbers",
          "output_format_pretty_max_rows",
          "max_execution_time",
          "default_format",
        ].includes(key)
      ) {
        const value = context[key];
        if (value !== undefined) {
          contextRows.push({
            name: key,
            type:
              typeof value === "boolean" ? "Bool" : typeof value === "number" ? "UInt64" : "String",
            value: String(value),
            description: `${key}`,
          });
        }
      }
    });

    setRows(contextRows);
    setInitialSettings(contextRows);
  }, []);

  useEffect(() => {
    if (!connection) {
      setBottomSectionContent({
        type: "error",
        message: "No connection selected",
      });
      return;
    }

    setBottomSectionContent(null);
    setIsLoadingSettings(true);

    const loadSettings = async () => {
      try {
        const { response } = connection.query(
          "SELECT name, type, description, value, readonly FROM system.settings ORDER BY name"
        );

        const apiResponse = await response;

        const data = apiResponse.data.json<JSONCompactFormatResponse>();
        if (data.data) {
          const settings: SystemSetting[] = data.data.map((row) => ({
            name: row[0] as string,
            type: row[1] as string,
            description: preprocessAdmonitions(transformMarkdownLinks(row[2] as string)),
            default: row[3] as string,
            readonly: (row[4] as number) === 1,
          }));
          setAvailableSettings(settings);

          setRows((currentRows) => {
            return currentRows.map((row) => {
              if (!row.name) return row;

              // Update readonly/description of existing rows
              const matchedSetting = settings.find((s) => s.name === row.name);
              if (matchedSetting) {
                return {
                  ...row,
                  description: matchedSetting.description
                    ? matchedSetting.description
                    : row.description,
                  readonly: matchedSetting.readonly,
                };
              }
              return row;
            });
          });
        }
      } catch (error) {
        const apiError = error as QueryError;
        setBottomSectionContent({
          type: "error",
          message: `Failed to load settings: ${apiError.message}`,
        });
      } finally {
        setIsLoadingSettings(false);
      }
    };

    loadSettings();
  }, [connection]);

  const handleSave = useCallback(() => {
    const context: Partial<QueryContext> = {};

    for (const row of rows) {
      const { name, type, value } = row;
      if (name.trim() === "") continue;

      let parsedValue: unknown;
      switch (type) {
        case "Bool":
          parsedValue = value === "true" || value === "1";
          break;
        case "Int64":
        case "UInt64":
        case "Int32":
        case "UInt32":
        case "Int16":
        case "UInt16":
        case "Int8":
        case "UInt8":
        case "Second":
          parsedValue = parseInt(value, 10);
          if (isNaN(parsedValue as number)) {
            toastManager.show(`Invalid number for ${name}`, "error");
            return;
          }
          break;
        case "Float":
        case "Float64":
        case "Float32":
          parsedValue = parseFloat(value);
          if (isNaN(parsedValue as number)) {
            toastManager.show(`Invalid number for ${name}`, "error");
            return;
          }
          break;
        default:
          parsedValue = value;
      }

      context[name] = parsedValue;
    }

    QueryContextManager.getInstance().setContext(context);
  }, [rows]);

  const handleRemoveRow = useCallback((index: number) => {
    setRows((prevRows) => {
      const newRows = prevRows.filter((_, i) => i !== index);
      return newRows;
    });
  }, []);

  const handleValueChange = useCallback(
    (index: number, value: string) => {
      const newRows = [...rows];
      newRows[index] = { ...newRows[index], value };
      setRows(newRows);
    },
    [rows]
  );

  const handleNameChange = useCallback(
    (index: number, name: string) => {
      const newRows = [...rows];
      const matchedSetting = availableSettings.find((s) => s.name === name);

      if (matchedSetting) {
        if (rows.some((r, i) => i !== index && r.name === matchedSetting.name)) {
          toastManager.show(`Setting ${matchedSetting.name} already exists`, "error");
          return;
        }
        newRows[index] = {
          name: matchedSetting.name,
          type: matchedSetting.type,
          value: matchedSetting.default || "",
          description: matchedSetting.description,
          readonly: matchedSetting.readonly,
        };
      } else {
        newRows[index] = { ...newRows[index], name };
      }
      setRows(newRows);
    },
    [rows, availableSettings]
  );

  const handleAddRow = useCallback(() => {
    const newRow: SettingRow = { name: "", type: "String", value: "", description: "" };
    setRows([...rows, newRow]);

    setTimeout(() => {
      if (tableScrollRef.current) {
        tableScrollRef.current.scrollTop = tableScrollRef.current.scrollHeight;
      }
    }, 0);
  }, [rows]);

  useEffect(() => {
    const toKey = (r: SettingRow) => JSON.stringify({ name: r.name, type: r.type, value: r.value });
    const current = rows.map(toKey).join("|");
    const initial = initialSettings.map(toKey).join("|");
    setIsChanged(current !== initial);
  }, [rows, initialSettings]);

  const renderValueInput = (row: SettingRow, index: number) => {
    const disabled = row.readonly === true;
    switch (row.type) {
      case "Bool":
        return (
          <BoolSettingSwitch
            value={row.value}
            onCheckedChange={(checked) => handleValueChange(index, String(checked))}
            disabled={disabled}
          />
        );
      case "Int64":
      case "UInt64":
      case "Int32":
      case "UInt32":
      case "Int16":
      case "UInt16":
      case "Int8":
      case "UInt8":
      case "Float64":
      case "Float32":
        return (
          <Input
            type="number"
            value={row.value}
            onChange={(e) => handleValueChange(index, e.target.value)}
            className="w-full h-8"
            disabled={disabled}
          />
        );
      default:
        return (
          <Input
            type="text"
            value={row.value}
            onChange={(e) => handleValueChange(index, e.target.value)}
            className="w-full h-8"
            disabled={disabled}
          />
        );
    }
  };

  return (
    <div className="space-y-4 h-full flex flex-col">
      <div className="overflow-visible flex-1 flex flex-col min-h-0 relative">
        <FloatingProgressBar show={isLoadingSettings} />
        <div ref={tableScrollRef} className="flex-1 overflow-y-auto overflow-x-visible min-h-0">
          <Table>
            <TableHeader>
              <TableRow className="h-9">
                <TableHead className="w-[200px] py-2">Name</TableHead>
                <TableHead className="w-[120px] py-2">Type</TableHead>
                <TableHead className="w-[80px] py-2 text-center">
                  <span className="inline-flex items-center justify-center gap-1">
                    Readonly
                    <HoverCard openDelay={200} closeDelay={100}>
                      <HoverCardTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 shrink-0"
                          aria-label="Readonly column info"
                        >
                          <Info className="h-3.5 w-3.5 text-muted-foreground" />
                        </Button>
                      </HoverCardTrigger>
                      <HoverCardContent
                        className="z-[10000] w-[280px] p-3 text-sm"
                        align="center"
                        side="bottom"
                      >
                        Indicate whether the setting is restricted from being changed due to
                        server-side configuration. <br />
                        <br />
                        For readonly settings, the value cannot be changed in the query context, and
                        if you may contact your administrators if you really need to change it.
                      </HoverCardContent>
                    </HoverCard>
                  </span>
                </TableHead>
                <TableHead className="min-w-[150px] py-2">Value</TableHead>
                <TableHead className="w-[60px] py-2"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-4">
                    No settings configured. Click{" "}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleAddRow}
                      disabled={!connection || isLoadingSettings}
                    >
                      <Plus className="h-4 w-4" />
                      Add Setting
                    </Button>{" "}
                    to get started.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row, index) => (
                  <SettingTableRow
                    key={index}
                    row={row}
                    index={index}
                    availableSettings={availableSettings}
                    existingRows={rows}
                    onNameChange={handleNameChange}
                    renderValueInput={renderValueInput}
                    handleRemoveRow={handleRemoveRow}
                  />
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="flex justify-between items-center gap-2 px-4 py-4 pt-4 border-t">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleAddRow}
          style={{ visibility: rows.length > 0 ? "visible" : "hidden" }}
          disabled={!connection || isLoadingSettings}
        >
          <Plus className="h-4 w-4" />
          Add Setting
        </Button>
        <Button
          size="sm"
          variant={isChanged ? "default" : "outline"}
          onClick={handleSave}
          disabled={!isChanged}
        >
          Save
        </Button>
      </div>

      {bottomSectionContent?.type === "error" && (
        <ErrorMessage message={bottomSectionContent.message} />
      )}
    </div>
  );
}
