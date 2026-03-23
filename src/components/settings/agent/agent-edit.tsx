import {
  AgentConfigurationManager,
  AUTO_EXPLAIN_LANGUAGE_OPTIONS,
  DEFAULT_AUTO_EXPLAIN_BLACKLIST,
  normalizeAutoExplainLanguage,
  type AgentConfiguration,
  type AgentMode,
  type AutoExplainLanguage,
} from "@/components/settings/agent/agent-manager";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { CLICKHOUSE_ERROR_CODES } from "@/lib/clickhouse/clickhouse-error-code";
import { Check, ChevronDown, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

const allErrorCodeEntries = [...CLICKHOUSE_ERROR_CODES.entries()].sort(
  (a, b) => Number(a[0]) - Number(b[0])
);

function AddBlacklistDialogContent({
  open,
  onOpenChange,
  initialBlacklist,
  onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialBlacklist: string[];
  onApply: (codes: string[]) => void;
}) {
  const [pendingBlacklistSelection, setPendingBlacklistSelection] = useState<string[]>(() =>
    [...initialBlacklist].sort((a, b) => Number(a) - Number(b))
  );
  const addableErrorCodes = useMemo(
    () => allErrorCodeEntries.filter(([code]) => !initialBlacklist.includes(String(code))),
    [initialBlacklist]
  );
  useEffect(() => {
    if (open) {
      setPendingBlacklistSelection([...initialBlacklist].sort((a, b) => Number(a) - Number(b)));
    }
  }, [open, initialBlacklist]);
  const togglePendingSelection = (errorCode: string) => {
    setPendingBlacklistSelection((current) =>
      current.includes(errorCode)
        ? current.filter((code) => code !== errorCode)
        : [...current, errorCode].sort((a, b) => Number(a) - Number(b))
    );
  };
  const newlySelectedCount = pendingBlacklistSelection.filter((code) =>
    addableErrorCodes.some(([c]) => String(c) === code)
  ).length;
  const handleApply = () => {
    onApply(pendingBlacklistSelection);
    onOpenChange(false);
  };
  const handleCancel = () => {
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="z-[10010] max-w-3xl gap-0 border-0 bg-transparent p-0 shadow-none"
        overlayClassName="z-[10005] bg-black/60"
      >
        <DialogTitle className="sr-only">Add Blacklisted Error Codes</DialogTitle>
        <DialogDescription className="sr-only">
          Search ClickHouse error codes by number or name and select multiple entries to skip
          automatic explanation.
        </DialogDescription>
        <Command className="flex h-[640px] min-h-0 flex-col rounded-xl border shadow-2xl">
          <CommandInput placeholder="Search by error code or name..." />
          <div className="min-h-0 flex-1 overflow-hidden">
            <CommandList className="h-full max-h-none overflow-y-auto">
              <CommandEmpty>No error codes found.</CommandEmpty>
              {addableErrorCodes.map(([code, name]) => {
                const codeStr = String(code);
                const isSelected = pendingBlacklistSelection.includes(codeStr);
                return (
                  <CommandItem
                    key={codeStr}
                    value={`${code} ${name}`}
                    onSelect={() => togglePendingSelection(codeStr)}
                    className="gap-3"
                  >
                    <div className="flex h-4 w-4 items-center justify-center rounded-sm border">
                      {isSelected && <Check className="h-3 w-3" />}
                    </div>
                    <span className="w-20 font-mono text-xs text-muted-foreground">{code}</span>
                    <span className="truncate">{name}</span>
                  </CommandItem>
                );
              })}
            </CommandList>
          </div>
          <div className="flex items-center justify-between gap-2 border-t px-4 py-2">
            <div className="text-sm text-muted-foreground">{newlySelectedCount} selected</div>
            <div className="flex gap-2">
              <Button variant="outline" className="h-9" onClick={handleCancel}>
                Cancel
              </Button>
              <Button className="h-9" onClick={handleApply}>
                Add selected
              </Button>
            </div>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

function BlacklistCodesTable({
  entries,
  onRemove,
}: {
  entries: Array<[number | string, string]>;
  onRemove: (errorCode: string) => void;
}) {
  // Native <table> so the scroll container wraps it directly; shared Table adds a div that breaks sticky header.
  return (
    <div className="max-h-[320px] overflow-auto rounded-md border [&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:z-10 [&_thead_th]:bg-background [&_thead_th]:shadow-[0_1px_0_0_hsl(var(--border))]">
      <table className="w-full caption-bottom text-sm">
        <thead className="[&_tr]:border-b">
          <tr className="border-b transition-colors">
            <th className="h-9 w-24 px-4 py-0 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0">
              Code
            </th>
            <th className="h-9 px-4 py-0 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0">
              Name
            </th>
            <th className="h-9 w-20 px-4 py-1 text-right align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0">
              Action
            </th>
          </tr>
        </thead>
        <tbody className="[&_tr:last-child]:border-0">
          {entries.map(([code, name]) => {
            const codeString = String(code);
            return (
              <tr key={codeString} className="h-9 border-b transition-colors hover:bg-muted/50">
                <td className="px-4 py-1 font-mono align-middle">{codeString}</td>
                <td className="px-4 py-1 align-middle">{name}</td>
                <td className="px-4 py-1 text-right align-middle">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onRemove(codeString)}
                    className="h-8 w-8 p-0"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function AgentEdit() {
  const [configuration, setConfiguration] = useState<AgentConfiguration>(
    AgentConfigurationManager.getConfiguration()
  );
  const [isBlacklistDialogOpen, setIsBlacklistDialogOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dropdownContainer, setDropdownContainer] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const currentMode = AgentConfigurationManager.getConfiguration();
    setConfiguration(currentMode);
  }, []);

  useEffect(() => {
    setDropdownContainer(containerRef.current?.closest("[role='dialog']") as HTMLElement | null);
  }, []);

  const handleModeChange = (value: string) => {
    const newConfig = { ...configuration, mode: value as AgentMode };
    setConfiguration(newConfig);
    AgentConfigurationManager.setConfiguration(newConfig);
  };

  const handlePruningChange = (checked: boolean) => {
    const newConfig = { ...configuration, pruneValidateSql: checked };
    setConfiguration(newConfig);
    AgentConfigurationManager.setConfiguration(newConfig);
  };

  const handleAutoExplainChange = (checked: boolean) => {
    const newConfig = {
      ...configuration,
      autoExplainClickHouseErrors: checked,
      autoExplainBlacklist: configuration.autoExplainBlacklist ?? DEFAULT_AUTO_EXPLAIN_BLACKLIST,
      autoExplainLanguage:
        configuration.autoExplainLanguage ?? normalizeAutoExplainLanguage(undefined),
    };
    setConfiguration(newConfig);
    AgentConfigurationManager.setConfiguration(newConfig);
  };

  const handleAutoExplainLanguageChange = (value: string) => {
    const newConfig = {
      ...configuration,
      autoExplainLanguage: value as AutoExplainLanguage,
    };
    setConfiguration(newConfig);
    AgentConfigurationManager.setConfiguration(newConfig);
  };

  const blacklistedCodes = useMemo(
    () =>
      new Set((configuration.autoExplainBlacklist ?? DEFAULT_AUTO_EXPLAIN_BLACKLIST).map(String)),
    [configuration.autoExplainBlacklist]
  );
  const selectedErrorCodes = useMemo(
    () => allErrorCodeEntries.filter(([code]) => blacklistedCodes.has(code)),
    [blacklistedCodes]
  );

  const updateBlacklist = (next: Set<string>) => {
    const newConfig = {
      ...configuration,
      autoExplainBlacklist: [...next].sort((a, b) => Number(a) - Number(b)),
    };
    setConfiguration(newConfig);
    AgentConfigurationManager.setConfiguration(newConfig);
  };

  const handleBlacklistToggle = (errorCode: string, checked: boolean) => {
    const next = new Set(configuration.autoExplainBlacklist ?? DEFAULT_AUTO_EXPLAIN_BLACKLIST);
    if (checked) {
      next.add(errorCode);
    } else {
      next.delete(errorCode);
    }
    updateBlacklist(next);
  };

  const openBlacklistDialog = () => {
    setIsBlacklistDialogOpen(true);
  };

  const clearBlacklist = () => {
    updateBlacklist(new Set());
  };

  const resetBlacklistToDefault = () => {
    updateBlacklist(new Set(DEFAULT_AUTO_EXPLAIN_BLACKLIST));
  };

  const isBlacklistDefault = useMemo(() => {
    const cur = [...(configuration.autoExplainBlacklist ?? DEFAULT_AUTO_EXPLAIN_BLACKLIST)].sort();
    const def = [...DEFAULT_AUTO_EXPLAIN_BLACKLIST].sort();
    return cur.length === def.length && cur.every((c, i) => c === def[i]);
  }, [configuration.autoExplainBlacklist]);

  return (
    <div ref={containerRef} className="h-full flex flex-col">
      <Table className="table-fixed">
        <colgroup>
          <col className="w-[220px]" />
          <col className="w-[350px]" />
          <col />
        </colgroup>
        <TableBody>
          <TableRow className="h-12 hover:bg-transparent">
            <TableCell className="px-0 pl-4 py-1 align-middle">
              <Label>Agent Mode</Label>
            </TableCell>
            <TableCell className="px-0 py-1 align-middle">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="h-9 w-[300px] justify-between">
                    {configuration.mode === "v2" ? "V2 (Skill-based)" : "V1 (Legacy)"}
                    <ChevronDown className="ml-2 h-4 w-4 opacity-50" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent container={dropdownContainer} className="w-[300px] z-[10000]">
                  <DropdownMenuRadioGroup
                    value={configuration.mode}
                    onValueChange={handleModeChange}
                  >
                    <DropdownMenuRadioItem value="v2">V2 (Skill-based)</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="legacy">
                      V1 (Should not be used)
                    </DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </TableCell>
            <TableCell className="px-0 py-1 align-middle text-sm text-muted-foreground">
              Select which agent architecture to use for chat interactions.
            </TableCell>
          </TableRow>

          <TableRow className="h-12 hover:bg-transparent">
            <TableCell className="px-0 pl-4 py-1 align-middle">
              <Label>Context Pruning</Label>
            </TableCell>
            <TableCell className="px-0 py-1 align-middle">
              <div className="flex h-10 items-center">
                <Switch
                  checked={configuration.pruneValidateSql ?? true}
                  onCheckedChange={handlePruningChange}
                />
              </div>
            </TableCell>
            <TableCell className="px-0 py-1 align-middle text-sm text-muted-foreground">
              Enable surgical pruning of SQL validations from history to save tokens.
            </TableCell>
          </TableRow>

          <TableRow className="h-12 hover:bg-transparent">
            <TableCell className="px-0 pl-4 py-1 align-middle">
              <Label>Auto Explain Errors</Label>
            </TableCell>
            <TableCell className="px-0 py-1 align-middle">
              <div className="flex h-10 items-center">
                <Switch
                  checked={configuration.autoExplainClickHouseErrors ?? false}
                  onCheckedChange={handleAutoExplainChange}
                />
              </div>
            </TableCell>
            <TableCell className="px-0 py-1 align-middle text-sm text-muted-foreground">
              Automatically ask AI to explain eligible ClickHouse errors inline in query results.
            </TableCell>
          </TableRow>

          <TableRow className="h-12 hover:bg-transparent">
            <TableCell className="px-0 pl-4 py-1 align-middle">
              <Label className="pl-6">Explanation Language</Label>
            </TableCell>
            <TableCell className="px-0 py-1 align-middle">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="h-9 w-[300px] justify-between">
                    {
                      AUTO_EXPLAIN_LANGUAGE_OPTIONS.find(
                        (o) =>
                          o.value ===
                          normalizeAutoExplainLanguage(configuration.autoExplainLanguage)
                      )?.label
                    }
                    <ChevronDown className="ml-2 h-4 w-4 opacity-50" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent container={dropdownContainer} className="w-[300px] z-[10000]">
                  <DropdownMenuRadioGroup
                    value={normalizeAutoExplainLanguage(configuration.autoExplainLanguage)}
                    onValueChange={handleAutoExplainLanguageChange}
                  >
                    {AUTO_EXPLAIN_LANGUAGE_OPTIONS.map((opt) => (
                      <DropdownMenuRadioItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </TableCell>
            <TableCell className="px-0 py-1 align-middle text-sm text-muted-foreground">
              Language for automatic inline error explanations only. Does not change the main AI
              chat.
            </TableCell>
          </TableRow>

          {configuration.autoExplainClickHouseErrors && (
            <>
              <TableRow className="h-12 border-b-0 hover:bg-transparent">
                <TableCell className="px-0 pl-4 py-1 align-middle">
                  <Label className="pl-6">Blacklist</Label>
                </TableCell>
                <TableCell className="px-0 py-1 align-middle text-sm text-muted-foreground">
                  {selectedErrorCodes.length === 0
                    ? "No blacklisted error codes selected."
                    : `${selectedErrorCodes.length} blacklisted error code${selectedErrorCodes.length === 1 ? "" : "s"}`}
                </TableCell>
                <TableCell className="px-0 pr-2 py-1 align-middle">
                  <div className="flex items-center justify-between gap-4">
                    <div className="text-muted-foreground">
                      Checked error codes will not auto-trigger inline explanation.
                    </div>
                    <div className="flex items-center gap-2">
                      {!isBlacklistDefault && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8"
                          onClick={resetBlacklistToDefault}
                        >
                          Reset
                        </Button>
                      )}
                      {selectedErrorCodes.length > 0 && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8"
                          onClick={clearBlacklist}
                        >
                          Clear all
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8"
                        onClick={openBlacklistDialog}
                      >
                        <Plus className="h-4 w-4" />
                        Add
                      </Button>
                    </div>
                  </div>
                </TableCell>
              </TableRow>
              {selectedErrorCodes.length > 0 && (
                <TableRow className="hover:bg-transparent">
                  <TableCell className="px-0 pl-4 py-0" />
                  <TableCell colSpan={2} className="px-0 pr-2 pb-4 pt-0">
                    <BlacklistCodesTable
                      entries={selectedErrorCodes}
                      onRemove={(codeString) => handleBlacklistToggle(codeString, false)}
                    />
                  </TableCell>
                </TableRow>
              )}
            </>
          )}
        </TableBody>
      </Table>
      <AddBlacklistDialogContent
        open={isBlacklistDialogOpen}
        onOpenChange={setIsBlacklistDialogOpen}
        initialBlacklist={configuration.autoExplainBlacklist ?? DEFAULT_AUTO_EXPLAIN_BLACKLIST}
        onApply={(codes) => updateBlacklist(new Set(codes))}
      />
    </div>
  );
}
