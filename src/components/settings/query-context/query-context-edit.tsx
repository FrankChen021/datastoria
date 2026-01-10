import type { QueryContext } from "@/components/settings/query-context/query-context";
import { QueryContextManager } from "@/components/settings/query-context/query-context-manager";
import { SuggestionList } from "@/components/shared/suggestion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
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
import {
  Connection,
  type JSONCompactFormatResponse,
  type QueryError,
} from "@/lib/connection/connection";
import type { ConnectionConfig } from "@/lib/connection/connection-config";
import { ConnectionManager } from "@/lib/connection/connection-manager";
import { toastManager } from "@/lib/toast";
import styled from "@emotion/styled";
import { AlertCircle, Info, Plus, Trash2 } from "lucide-react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ReactMarkdown from "react-markdown";

/**
 * Transforms markdown links in descriptions from relative URLs to absolute ClickHouse documentation URLs.
 */
function transformMarkdownLinks(description: string): string {
  if (!description) return description;

  const markdownLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;

  const replaced = description.replace(markdownLinkRegex, (match, linkText, url) => {
    if (/^https?:\/\//.test(url)) {
      return match;
    }

    if (url.startsWith("/")) {
      const urlWithoutMd = url.replace(/\.md$/, "");
      return `[${linkText}](https://clickhouse.com/docs${urlWithoutMd})`;
    }

    if (url.startsWith("../") || url.startsWith("./") || url.startsWith("#")) {
      const baseUrlObj = new URL("https://clickhouse.com/docs/operations/settings/settings");
      const basePath = baseUrlObj.pathname;

      const relativePath = url.replace(/\.md$/, "");

      const baseSegments = basePath.split("/").filter(Boolean);
      const relativeSegments = relativePath.split("/").filter(Boolean);

      const resultSegments = [...baseSegments];
      for (const segment of relativeSegments) {
        if (segment === "..") {
          resultSegments.pop();
        } else if (segment !== ".") {
          resultSegments.push(segment);
        }
      }

      const newPath = "/" + resultSegments.join("/");
      const newUrl = `${baseUrlObj.origin}${newPath}`;

      return `[${linkText}](${newUrl})`;
    }

    return match;
  });

  return replaced;
}

interface SettingRow {
  name: string;
  type: string;
  value: string;
  description: string;
  isNameEditable?: boolean;
  isDeletable?: boolean;
}

const StyledMarkdownContainer = styled.div`
  a {
    color: #0070f3;
    text-decoration: none;
    &:hover {
      text-decoration: underline;
      color: #0051a2;
    }
  }
`;

function SettingDescription({ description }: { description: string }) {
  return (
    <StyledMarkdownContainer className="text-sm text-foreground [&_p]:mb-2 [&_p:last-child]:mb-0 [&_ul]:list-disc [&_ul]:ml-4 [&_ul]:mb-2 [&_ol]:list-decimal [&_ol]:ml-4 [&_ol]:mb-2 [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-xs [&_code]:font-mono [&_pre]:bg-muted [&_pre]:p-2 [&_pre]:rounded [&_pre]:overflow-x-auto [&_pre]:mb-2 [&_strong]:font-semibold [&_em]:italic [&_a]:underline [&_a]:text-primary [&_a:hover]:text-primary/80">
      <ReactMarkdown>{description || "No description available."}</ReactMarkdown>
    </StyledMarkdownContainer>
  );
}

interface SystemSetting {
  name: string;
  type: string;
  description: string;
  default: string;
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
  const isNameEditable = row.isNameEditable !== false;

  const availableSettingsForRow = useMemo(() => {
    return availableSettings.filter(
      (s) => !existingRows.some((r, i) => i !== rowIndex && r.name === s.name)
    );
  }, [availableSettings, existingRows, rowIndex]);

  useEffect(() => {
    if (
      !row.name.trim() &&
      !isEditing &&
      isLastRow &&
      !hasAutoOpenedRef.current &&
      isNameEditable
    ) {
      hasAutoOpenedRef.current = true;
      setIsEditing(true);
    }
  }, [row.name, isEditing, isLastRow, isNameEditable]);

  const handleFocus = useCallback(() => {
    if (isNameEditable) {
      setIsEditing(true);
    }
  }, [isNameEditable]);

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
          type: s.type,
          description: s.description,
        }))}
        onSelect={(item) => {
          const setting = availableSettingsForRow.find((s) => s.name === item.name);
          if (setting) {
            handleSelectSetting(setting);
          }
        }}
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

  return (
    <div
      className={`text-sm font-medium truncate min-h-[32px] flex items-center ${
        isNameEditable ? "cursor-pointer hover:underline" : ""
      }`}
      onClick={isNameEditable ? handleFocus : undefined}
    >
      {row.name ||
        (isNameEditable ? <span className="text-muted-foreground italic">Click to edit</span> : "")}
    </div>
  );
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
  const [mousePosition, setMousePosition] = useState<{ x: number; y: number } | null>(null);
  const [isHovering, setIsHovering] = useState(false);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);

  const handleMouseMove = (e: React.MouseEvent) => {
    setMousePosition({ x: e.clientX, y: e.clientY });
  };

  const handleMouseEnter = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    hoverTimeoutRef.current = setTimeout(() => {
      setIsHovering(true);
    }, 200);
  };

  const handleMouseLeave = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    setIsHovering(false);
    setMousePosition(null);
  };

  // Calculate tooltip position to keep it within viewport
  const getTooltipPosition = () => {
    if (!mousePosition) return { left: 0, top: 0 };

    const tooltipWidth = 300;
    const tooltipHeight = 300; // max height
    const offset = 10;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let left = mousePosition.x + offset;
    let top = mousePosition.y + offset;

    // Check right boundary
    if (left + tooltipWidth > viewportWidth) {
      left = mousePosition.x - tooltipWidth - offset;
    }

    // Check left boundary
    if (left < 0) {
      left = offset;
    }

    // Check bottom boundary
    if (top + tooltipHeight > viewportHeight) {
      top = mousePosition.y - tooltipHeight - offset;
    }

    // Check top boundary
    if (top < 0) {
      top = offset;
    }

    return { left, top };
  };

  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);

  const rowContent = (
    <TableRow key={index} className="h-10">
      <TableCell className="py-1.5">
        <SettingNameInputWithSuggestions
          row={row}
          rowIndex={index}
          availableSettings={availableSettings}
          existingRows={existingRows}
          onNameChange={onNameChange}
          onCancel={() => handleRemoveRow(index)}
          isLastRow={index === existingRows.length - 1}
        />
      </TableCell>
      <TableCell className="py-1.5">
        <div className="text-sm text-muted-foreground truncate">{row.type}</div>
      </TableCell>
      <TableCell className="py-1.5 min-w-[150px]">{renderValueInput(row, index)}</TableCell>
      <TableCell className="py-1.5">
        <div className="flex items-center gap-1">
          {row.description && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onMouseMove={handleMouseMove}
              onMouseEnter={handleMouseEnter}
              onMouseLeave={handleMouseLeave}
            >
              <Info className="h-3.5 w-3.5" />
            </Button>
          )}
          {row.isDeletable !== false && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleRemoveRow(index)}
              className="h-7 w-7"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  );

  const tooltipPosition = getTooltipPosition();

  return (
    <>
      {rowContent}
      {row.description &&
        isHovering &&
        mousePosition &&
        createPortal(
          <div
            ref={tooltipRef}
            className="fixed z-[10001] w-[300px] max-h-[300px] overflow-y-auto p-3 rounded-md border shadow-lg bg-popover border-muted/50 pointer-events-none"
            style={{
              left: `${tooltipPosition.left}px`,
              top: `${tooltipPosition.top}px`,
            }}
            onMouseEnter={(e) => {
              e.stopPropagation();
            }}
          >
            <SettingDescription description={row.description} />
          </div>,
          document.body
        )}
    </>
  );
}

export function QueryContextEdit() {
  const [selectedConnection, setSelectedConnection] = useState<ConnectionConfig | null>(null);
  const [rows, setRows] = useState<SettingRow[]>([]);
  const [availableSettings, setAvailableSettings] = useState<SystemSetting[]>([]);
  const [hasLoadedSettings, setHasLoadedSettings] = useState(false);
  const [bottomSectionContent, setBottomSectionContent] = useState<BottomSectionContent>(null);
  const tableScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const connection = ConnectionManager.getInstance().getLastSelectedOrFirst();
    if (connection) {
      setSelectedConnection(connection);
    }
  }, []);

  useEffect(() => {
    const context = QueryContextManager.getInstance().getStoredContext();
    const contextRows: SettingRow[] = [];

    if (context.opentelemetry_start_trace_probability !== undefined) {
      contextRows.push({
        name: "opentelemetry_start_trace_probability",
        type: "Bool",
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
        isNameEditable: false,
        isDeletable: false,
      });
    }
    if (context.output_format_pretty_max_rows !== undefined) {
      contextRows.push({
        name: "output_format_pretty_max_rows",
        type: "UInt64",
        value: String(context.output_format_pretty_max_rows),
        description: "Maximum number of result rows",
        isNameEditable: false,
        isDeletable: false,
      });
    }
    if (context.max_execution_time !== undefined) {
      contextRows.push({
        name: "max_execution_time",
        type: "UInt64",
        value: String(context.max_execution_time),
        description: "Maximum execution time in seconds",
        isNameEditable: false,
        isDeletable: false,
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
  }, []);

  const loadAvailableSettings = useCallback(async () => {
    if (!selectedConnection) {
      setBottomSectionContent({
        type: "error",
        message: "No connection selected",
      });
      return;
    }

    setBottomSectionContent(null);

    try {
      const connection = Connection.create(selectedConnection);
      const { response } = connection.query(
        "SELECT name, type, description, value FROM system.settings ORDER BY name",
        {
          default_format: "JSONCompact",
        }
      );

      const apiResponse = await response;

      const data = apiResponse.data.json<JSONCompactFormatResponse>();
      if (data.data) {
        const settings: SystemSetting[] = data.data.map((row) => ({
          name: row[0] as string,
          type: row[1] as string,
          description: row[2] as string,
          default: row[3] as string,
        }));
        setAvailableSettings(settings);
        setHasLoadedSettings(true);

        setRows((currentRows) => {
          return currentRows.map((row) => {
            if (!row.name) return row;

            const matchedSetting = settings.find((s) => s.name === row.name);
            if (matchedSetting && matchedSetting.description) {
              return { ...row, description: transformMarkdownLinks(matchedSetting.description) };
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
    }
  }, [selectedConnection]);

  useEffect(() => {
    if (selectedConnection && !hasLoadedSettings) {
      loadAvailableSettings();
    }
  }, [selectedConnection, hasLoadedSettings, loadAvailableSettings]);

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
          parsedValue = parseInt(value, 10);
          if (isNaN(parsedValue as number)) {
            toastManager.show(`Invalid number for ${name}`, "error");
            return;
          }
          break;
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
    toastManager.show("Query context saved", "success");
  }, [rows]);

  const handleRemoveRow = useCallback(
    (index: number) => {
      setRows(rows.filter((_, i) => i !== index));
    },
    [rows]
  );

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
          isNameEditable: newRows[index].isNameEditable,
          isDeletable: newRows[index].isDeletable,
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

  const renderValueInput = (row: SettingRow, index: number) => {
    switch (row.type) {
      case "Bool":
        return (
          <Switch
            checked={row.value === "true" || row.value === "1"}
            onCheckedChange={(checked) => handleValueChange(index, String(checked))}
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
          />
        );
      default:
        return (
          <Input
            type="text"
            value={row.value}
            onChange={(e) => handleValueChange(index, e.target.value)}
            className="w-full h-8"
          />
        );
    }
  };

  return (
    <div className="space-y-4 h-full flex flex-col">
      <div className="overflow-visible flex-1 flex flex-col min-h-0">
        <div ref={tableScrollRef} className="flex-1 overflow-y-auto overflow-x-visible min-h-0">
          <Table>
            <TableHeader>
              <TableRow className="h-9">
                <TableHead className="w-[200px] py-2">Name</TableHead>
                <TableHead className="w-[120px] py-2">Type</TableHead>
                <TableHead className="min-w-[150px] py-2">Value</TableHead>
                <TableHead className="w-[60px] py-2"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-4">
                    No settings configured. Click "Add Setting" to get started.
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
          disabled={!selectedConnection}
        >
          <Plus className="h-4 w-4" />
          Add Setting
        </Button>
        <Button size="sm" onClick={handleSave}>
          Save
        </Button>
      </div>

      {bottomSectionContent?.type === "error" && (
        <ErrorMessage message={bottomSectionContent.message} />
      )}
    </div>
  );
}
