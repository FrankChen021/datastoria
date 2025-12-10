import { SuggestionList } from "@/components/shared/suggestion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ApiErrorResponse } from "@/lib/api";
import { Api } from "@/lib/api";
import type { Connection } from "@/lib/connection/Connection";
import { ensureConnectionRuntimeInitialized } from "@/lib/connection/Connection";
import { ConnectionManager } from "@/lib/connection/ConnectionManager";
import type { QueryContext } from "@/lib/query-context/QueryContext";
import { QueryContextManager } from "@/lib/query-context/QueryContextManager";
import { toastManager } from "@/lib/toast";
import { AlertCircle, Info, Plus, Trash2, X } from "lucide-react";
import styled from "@emotion/styled";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ReactDOM from "react-dom/client";
import ReactMarkdown from "react-markdown";

/**
 * Transforms markdown links in descriptions from relative URLs to absolute ClickHouse documentation URLs.
 *
 * Example:
 * [Table engine Distributed](../../engines/table-engines/special/distributed.md)
 * becomes:
 * [Table engine Distributed](https://clickhouse.com/docs/operations/engines/table-engines/special/distributed)
 *
 * @param description - The description text that may contain markdown links
 * @param baseUrl - The base URL for ClickHouse documentation (default: https://clickhouse.com/docs/operations/settings/settings)
 * @returns The description with all relative markdown links transformed to absolute URLs
 */
function transformMarkdownLinks(description: string): string {
  if (!description) return description;

  // Regular expression to match markdown links: [text](url)
  const markdownLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;

  const replaced = description.replace(markdownLinkRegex, (match, linkText, url) => {
    // If URL is already absolute (starts with http:// or https://), leave it as is
    if (/^https?:\/\//.test(url)) {
      return match;
    }

    if (url.startsWith("/")) {
      // Remove .md extension if present
      const urlWithoutMd = url.replace(/\.md$/, "");
      return `[${linkText}](https://clickhouse.com/docs${urlWithoutMd})`;
    }

    // If URL is relative (starts with ../ or ./), transform it
    if (url.startsWith("../") || url.startsWith("./") || url.startsWith("#")) {
      // Parse the base URL to get the path
      const baseUrlObj = new URL("https://clickhouse.com/docs/operations/settings/settings");
      const basePath = baseUrlObj.pathname;

      // Remove .md extension if present
      const relativePath = url.replace(/\.md$/, "");

      // Resolve relative path
      // Split base path into segments
      const baseSegments = basePath.split("/").filter(Boolean);

      // Process relative path
      const relativeSegments = relativePath.split("/").filter(Boolean);

      // Remove segments for each ".."
      const resultSegments = [...baseSegments];
      for (const segment of relativeSegments) {
        if (segment === "..") {
          resultSegments.pop();
        } else if (segment !== ".") {
          resultSegments.push(segment);
        }
      }

      // Construct the new absolute URL
      const newPath = "/" + resultSegments.join("/");
      const newUrl = `${baseUrlObj.origin}${newPath}`;

      return `[${linkText}](${newUrl})`;
    }

    // For other relative URLs (without ../ or ./), leave as is or handle as needed
    return match;
  });

  return replaced;
}

interface SettingRow {
  name: string;
  type: string;
  value: string;
  description: string;
  isNameEditable?: boolean; // Default: true
  isDeletable?: boolean; // Default: true
}

const StyledMarkdown = styled(ReactMarkdown)`
  a {
    color: #0070f3;
    text-decoration: none;
    &:hover {
      text-decoration: underline;
      color: #0051a2;
    }
  }
`;

// Reusable component for rendering markdown descriptions
function SettingDescription({ description }: { description: string }) {
  return (
    <div className="text-sm text-foreground [&_p]:mb-2 [&_p:last-child]:mb-0 [&_ul]:list-disc [&_ul]:ml-4 [&_ul]:mb-2 [&_ol]:list-decimal [&_ol]:ml-4 [&_ol]:mb-2 [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-xs [&_code]:font-mono [&_pre]:bg-muted [&_pre]:p-2 [&_pre]:rounded [&_pre]:overflow-x-auto [&_pre]:mb-2 [&_strong]:font-semibold [&_em]:italic [&_a]:underline [&_a]:text-primary [&_a:hover]:text-primary/80">
      <StyledMarkdown>{description || "No description available."}</StyledMarkdown>
    </div>
  );
}

interface SystemSetting {
  name: string;
  type: string;
  description: string;
  default: string;
}

export interface ShowQueryContextEditDialogOptions {
  onCancel?: () => void;
}

// Type for bottom section content
type BottomSectionContent = { type: "error"; message: string } | null;

// Error message component for bottom section
function ErrorMessage({ message, title }: { message: string; title?: string }) {
  return (
    <Card className="w-full rounded-t-none border-t-0 max-h-[140px] flex flex-col">
      <CardContent className="p-0 flex-1 min-h-0 overflow-hidden">
        <Alert
          variant="destructive"
          className="border-0 rounded-t-none p-3 h-full flex items-start bg-destructive/10 dark:bg-destructive/20"
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
      </CardContent>
    </Card>
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
  const hasAutoOpenedRef = useRef(false); // Track if we've already auto-opened this row
  const isNameEditable = row.isNameEditable !== false; // Default: true

  // Filter out settings that are already used in other rows
  const availableSettingsForRow = useMemo(() => {
    return availableSettings.filter((s) => !existingRows.some((r, i) => i !== rowIndex && r.name === s.name));
  }, [availableSettings, existingRows, rowIndex]);

  // Automatically enter edit mode when row name is empty (new row)
  // Only auto-edit if this is the last row to prevent multiple rows from editing simultaneously
  // Use a ref to ensure this only happens once per row, not every time isEditing changes
  useEffect(() => {
    if (!row.name.trim() && !isEditing && isLastRow && !hasAutoOpenedRef.current && isNameEditable) {
      hasAutoOpenedRef.current = true; // Mark that we've auto-opened this row
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
      // Update the name via onNameChange
      if (onNameChange) {
        onNameChange(rowIndex, setting.name);
      }
      setIsEditing(false);
    },
    [onNameChange, rowIndex]
  );

  const handleCancel = useCallback(() => {
    setIsEditing(false);
    // Only call onCancel (which removes the row) if this is a new row with no name
    // For existing rows, just exit edit mode without deleting
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
      {row.name || (isNameEditable ? <span className="text-muted-foreground italic">Click to edit</span> : "")}
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
            <Button variant="ghost" size="icon" onClick={() => handleRemoveRow(index)} className="h-7 w-7">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  );

  return (
    <>
      {rowContent}
      {row.description &&
        isHovering &&
        mousePosition &&
        createPortal(
          <div
            className="fixed z-[10001] w-[300px] max-h-[300px] overflow-y-auto p-3 rounded-md border shadow-lg bg-popover border-muted/50 pointer-events-none"
            style={{
              left: `${mousePosition.x + 10}px`,
              top: `${mousePosition.y + 10}px`,
              transform: "translate(0, 0)",
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

function QueryContextEditDialogWrapper({ onCancel }: { onCancel?: () => void }) {
  const [selectedConnection, setSelectedConnection] = useState<Connection | null>(null);
  const [rows, setRows] = useState<SettingRow[]>([]);
  const [availableSettings, setAvailableSettings] = useState<SystemSetting[]>([]);
  const [hasLoadedSettings, setHasLoadedSettings] = useState(false);
  const [bottomSectionContent, setBottomSectionContent] = useState<BottomSectionContent>(null);
  const tableScrollRef = useRef<HTMLDivElement>(null);

  // Get connection from ConnectionManager (since dialog is rendered outside React tree)
  useEffect(() => {
    const connection = ConnectionManager.getInstance().getLastSelectedOrFirst();
    if (connection) {
      const initialized = ensureConnectionRuntimeInitialized(connection);
      setSelectedConnection(initialized);
    }
  }, []);

  // Load current query context (stored only, without defaults)
  useEffect(() => {
    const context = QueryContextManager.getInstance().getStoredContext();
    const contextRows: SettingRow[] = [];

    // Add known context properties
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

    // Add any other custom settings from context
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
            type: typeof value === "boolean" ? "Bool" : typeof value === "number" ? "UInt64" : "String",
            value: String(value),
            description: `${key}`,
          });
        }
      }
    });

    setRows(contextRows);
  }, []);

  // Load available settings from system.settings
  const loadAvailableSettings = useCallback(async () => {
    if (!selectedConnection) {
      setBottomSectionContent({
        type: "error",
        message: "No connection selected",
      });
      return;
    }

    // Clear any previous errors
    setBottomSectionContent(null);

    try {
      const api = Api.create(selectedConnection);
      const { response } = api.executeAsync(
        // in old version, there's no 'default' value field
        "SELECT name, type, description, value FROM system.settings ORDER BY name",
        {
          default_format: "JSONCompact",
        }
      );

      const apiResponse = await response;

      const data = apiResponse.data as { data?: Array<[string, string, string, string]> };
      if (data.data) {
        const settings: SystemSetting[] = data.data.map(([name, type, description, defaultValue]) => ({
          name,
          type,
          description: transformMarkdownLinks(description || ""),
          default: defaultValue || "",
        }));
        setAvailableSettings(settings);
        setHasLoadedSettings(true);

        // Update row descriptions when settings are loaded
        setRows((currentRows) => {
          return currentRows.map((row) => {
            if (!row.name) return row; // Skip empty rows

            const matchedSetting = settings.find((s) => s.name === row.name);
            if (matchedSetting && matchedSetting.description) {
              return { ...row, description: transformMarkdownLinks(matchedSetting.description) };
            }
            return row;
          });
        });
      }
    } catch (error) {
      const apiError = error as ApiErrorResponse;
      setBottomSectionContent({
        type: "error",
        message: `Failed to load settings: ${apiError.errorMessage}`,
      });
    }
  }, [selectedConnection]);

  // Load available settings when connection is available
  useEffect(() => {
    if (selectedConnection && !hasLoadedSettings) {
      loadAvailableSettings();
    }
  }, [selectedConnection, hasLoadedSettings, loadAvailableSettings]);

  const handleClose = useCallback(() => {
    if (onCancel) {
      onCancel();
    }
  }, [onCancel]);

  const handleSave = useCallback(() => {
    // Build context from table rows only (table is the source of truth)
    const context: Partial<QueryContext> = {};

    // Validate and build context from rows
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
    handleClose();
  }, [rows, handleClose]);

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
      // Check if this name matches a setting from availableSettings
      const matchedSetting = availableSettings.find((s) => s.name === name);

      if (matchedSetting) {
        // If it's a known setting, update name, type, description, and default value
        // Also check if already exists in other rows
        if (rows.some((r, i) => i !== index && r.name === matchedSetting.name)) {
          toastManager.show(`Setting ${matchedSetting.name} already exists`, "error");
          return;
        }
        newRows[index] = {
          name: matchedSetting.name,
          type: matchedSetting.type,
          value: matchedSetting.default || "",
          description: matchedSetting.description,
          // Preserve isNameEditable and isDeletable if they exist
          isNameEditable: newRows[index].isNameEditable,
          isDeletable: newRows[index].isDeletable,
        };
      } else {
        // Just update the name, preserve other properties
        newRows[index] = { ...newRows[index], name };
      }
      setRows(newRows);
    },
    [rows, availableSettings]
  );

  const handleAddRow = useCallback(() => {
    const newRow: SettingRow = { name: "", type: "String", value: "", description: "" };
    setRows([...rows, newRow]);

    // Scroll to bottom after a brief delay to ensure the row is rendered
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

  // Handle ESC key to close
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        handleClose();
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, [handleClose]);

  return (
    <div className="fixed inset-0 z-[9999] bg-background flex flex-col">
      {/* Main Content - Centered */}
      <div className="flex-1 overflow-y-auto flex items-center justify-center p-8 relative">
        <div className="w-full max-w-4xl flex flex-col max-h-[90vh] overflow-hidden">
          <Card className={`w-full relative flex-shrink-0 ${bottomSectionContent ? "rounded-b-none" : ""}`}>
            {/* Close Button - Top Right inside Card */}
            <Button variant="ghost" size="icon" onClick={handleClose} className="absolute top-2 right-2 h-8 w-8 z-10">
              <X className="h-4 w-4" />
            </Button>
            <CardHeader>
              <CardTitle>Query Context</CardTitle>
              <CardDescription>Configure query execution settings and parameters.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="border rounded-md overflow-visible">
                  <div ref={tableScrollRef} className="h-[300px] overflow-y-auto overflow-x-visible">
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

                <div className="flex justify-between items-center gap-2 pt-4 border-t">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddRow}
                    disabled={!selectedConnection}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Setting
                  </Button>
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" onClick={handleClose}>
                      Cancel
                    </Button>
                    <Button type="button" onClick={handleSave}>
                      Save
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Bottom Section Area - Fixed height container, content adapts inside */}
          <div className="h-[140px] relative overflow-hidden flex items-start">
            <div
              className={`w-full transition-all duration-300 ease-in-out ${
                bottomSectionContent ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-4 pointer-events-none"
              }`}
            >
              {bottomSectionContent?.type === "error" && <ErrorMessage message={bottomSectionContent.message} />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function showQueryContextEditDialog(options: ShowQueryContextEditDialogOptions = {}) {
  const { onCancel } = options;

  // Create a container div to mount the full-screen component
  const container = document.createElement("div");
  document.body.appendChild(container);

  // Create React root
  const root = ReactDOM.createRoot(container);

  // Function to cleanup and close
  const cleanup = () => {
    if (container.parentNode) {
      root.unmount();
      document.body.removeChild(container);
    }
    if (onCancel) {
      onCancel();
    }
  };

  // Render the full-screen component
  root.render(<QueryContextEditDialogWrapper onCancel={cleanup} />);
}
