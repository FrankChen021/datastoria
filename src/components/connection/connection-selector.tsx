import { useConnection } from "@/components/connection/connection-context";
import { HighlightableCommandItem } from "@/components/shared/cmdk/cmdk-extension";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useIsMobile } from "@/hooks/use-mobile";
import type { ConnectionConfig } from "@/lib/connection/connection-config";
import { ConnectionManager } from "@/lib/connection/connection-manager";
import { cn } from "@/lib/utils";
import { Check, Eye, EyeOff, Pencil, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { showConnectionEditDialog } from "./connection-edit-component";

interface ConnectionSelectorProps {
  /**
   * Whether the selector is currently open
   */
  isOpen: boolean;
  /**
   * Callback to close the selector
   */
  onClose: () => void;
  /**
   * Optional className for the Command component
   */
  className?: string;
  /**
   * Connection name to show as the default selected one.
   * When provided, overrides the value from connection context for initial selection.
   */
  defaultConnectionName?: string | null;
}

/**
 * Right-hand details panel for a connection.
 */
function ConnectionDetailPanel({
  conn,
  onEdit,
}: {
  conn: ConnectionConfig | null;
  onEdit?: (c: ConnectionConfig) => void;
}) {
  const [showPassword, setShowPassword] = useState(false);
  if (!conn) {
    return null;
  }
  return (
    <div
      data-panel="right"
      className="w-[260px] flex-shrink-0 flex flex-col h-full p-0 bg-popover rounded-sm text-[10px] text-popover-foreground shadow-md"
    >
      <div className="px-2 py-3 w-full flex flex-col flex-1">
        <div className="overflow-auto h-full">
          <div className="flex flex-col gap-y-3">
            <div>
              <div className="text-xs text-muted-foreground">Name</div>
              <div className="text-xs font-medium whitespace-nowrap">{conn.name}</div>
            </div>

            <div>
              <div className="text-xs text-muted-foreground">URL</div>
              <div className="text-xs whitespace-nowrap">{conn.url}</div>
            </div>

            <div>
              <div className="text-xs text-muted-foreground">User</div>
              <div className="text-xs whitespace-nowrap">{conn.user}</div>
            </div>

            <div>
              <div className="text-xs text-muted-foreground">Password</div>
              <div className="flex items-center gap-2">
                {conn.password && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-4 w-4 p-0"
                    onClick={() => setShowPassword((s) => !s)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <EyeOff className="!h-3 !w-3" />
                    ) : (
                      <Eye className="!h-3 !w-3" />
                    )}
                  </Button>
                )}
                <div className="text-xs whitespace-nowrap">
                  {conn.password ? (showPassword ? conn.password : "••••••") : "No password"}
                </div>
              </div>
            </div>

            <div>
              <div className="text-xs text-muted-foreground">Cluster</div>
              <div className="text-xs whitespace-nowrap">{conn.cluster || "N/A"}</div>
            </div>
          </div>
        </div>
      </div>
      <div className="h-px bg-border" />
      <div className="h-[36px] flex items-center">
        <Button
          variant="ghost"
          size="sm"
          className="px-2 font-normal text-sm w-full h-full rounded-none"
          onClick={() => onEdit?.(conn)}
        >
          <Pencil className="h-4 w-4 mr-2" />
          Edit Connection
        </Button>
      </div>
    </div>
  );
}

/**
 * Shared connection selector component.
 * This component contains the cmdk implementation that's shared between
 * the popover and dialog variants. It manages its own state and handlers.
 */
export function ConnectionSelector({
  isOpen,
  onClose,
  className,
  defaultConnectionName: defaultConnectionNameProp,
}: ConnectionSelectorProps) {
  const isMobile = useIsMobile();
  const { connection, pendingConfig, isConnectionAvailable, switchConnection } = useConnection();
  const [connections, setConnections] = useState<ConnectionConfig[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const resolvedDefault =
    defaultConnectionNameProp ??
    (pendingConfig && !isConnectionAvailable ? pendingConfig.name : connection?.name);
  const [highlightedValue, setHighlightedValue] = useState<string | undefined>(resolvedDefault);

  // Load connections
  const reloadConnections = () => {
    const manager = ConnectionManager.getInstance();
    setConnections(manager.getConnections());
  };

  useEffect(() => {
    reloadConnections();
  }, []); // Load connections on mount

  // Reload connections when selector opens and focus input
  useEffect(() => {
    if (isOpen) {
      reloadConnections();

      // Focus the input after render using requestAnimationFrame
      if (inputRef.current) {
        requestAnimationFrame(() => {
          inputRef.current?.focus();
        });
      }
      // Initialize highlighted value when opening (use prop if provided so selector reflects default config)
      const targetValue =
        defaultConnectionNameProp ??
        (pendingConfig && !isConnectionAvailable ? pendingConfig.name : connection?.name);
      setHighlightedValue(targetValue);

      // This is a bug of cmdk, but model-selector is not affected
      // Tried to use Opus to fix, but it does not work, so we have to do this scroll manually.
      // Scroll the selected item into view after cmdk has updated
      // Use double RAF to ensure: 1) state update, 2) DOM render with aria-selected
      if (targetValue) {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const selectedItem = document.querySelector('[cmdk-item][aria-selected="true"]');
            selectedItem?.scrollIntoView({ block: "nearest" });
          });
        });
      }
    }
  }, [isOpen, pendingConfig, isConnectionAvailable, connection?.name, defaultConnectionNameProp]);

  const handleAddConnection = () => {
    showConnectionEditDialog({
      connection: null,
      onSave: (savedConnection) => {
        // Reload connections after save
        reloadConnections();
        // Ensure the newly saved connection is selected in the context
        switchConnection(savedConnection);
      },
    });
    onClose();
  };

  const handleConnectionSelect = (newConnection: ConnectionConfig) => {
    // Switch if it's different from current connection OR different from pending config
    // This allows switching even when initialization failed (pendingConfig exists but connection is old)
    const isDifferentFromCurrent = newConnection.name !== connection?.name;
    const isDifferentFromPending = newConnection.name !== pendingConfig?.name;

    if (isDifferentFromCurrent || isDifferentFromPending) {
      switchConnection(newConnection);
    }
    onClose();
  };

  const handleEditConnection = (connConfig: ConnectionConfig) => {
    showConnectionEditDialog({
      connection: connConfig,
      onSave: (savedConnection) => {
        // Reload connections after save
        reloadConnections();
        // Update the selected connection if it was the one being edited or if it was renamed
        // We check name against the currently active connection
        if (!connection || connection.name === connConfig.name) {
          switchConnection(savedConnection);
        }
      },
      onDelete: () => {
        // Reload connections after delete
        const updatedConnections = ConnectionManager.getInstance().getConnections();
        setConnections(updatedConnections);
        // Clear selected connection if it was the one deleted, or select the first available
        if (connection?.name === connConfig.name) {
          if (updatedConnections.length > 0) {
            switchConnection(updatedConnections[0]);
          } else {
            switchConnection(null);
          }
        }
      },
    });
    onClose();
  };

  // Find the connection currently highlighted by cmdk's value
  const highlightedConnection = highlightedValue
    ? connections.find((c) => c.name === highlightedValue) || null
    : null;

  // (no-op) connection display helper removed - details are rendered in the bottom panel

  return (
    <>
      <Command
        value={highlightedValue}
        onValueChange={setHighlightedValue}
        className={cn(
          "flex flex-row items-stretch h-[300px] w-full min-w-0 overflow-visible bg-transparent shadow-none border-0 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-input-wrapper]_svg]:h-4 [&_[cmdk-input-wrapper]_svg]:w-4 [&_[cmdk-input]]:h-9 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-1.5 [&_[cmdk-item]]:!rounded-none",
          className
        )}
        filter={(value: string, search: string) => {
          if (value.toLowerCase().includes(search.toLowerCase())) return 1;
          return 0;
        }}
      >
        {/* Left Pane */}
        <div
          data-panel="left"
          className={cn(
            "flex-1 bg-popover rounded-sm overflow-hidden shadow-md flex flex-col",
            isMobile ? "min-w-0" : "min-w-[340px]",
            !isMobile && highlightedConnection ? "border-r rounded-r-none" : ""
          )}
        >
          <CommandInput
            ref={inputRef}
            placeholder="Search connections..."
            className="!h-9 text-sm w-full"
          />
          <CommandList className="!rounded-none max-h-[500px] flex-1 overflow-y-auto w-full">
            <CommandEmpty className="p-2 text-center text-sm">No connections found</CommandEmpty>
            {connections.map((conn) => {
              // `isSelected` reflects the current connection (prop or context),
              // not the cmdk highlighted value. This keeps the active selection
              // unchanged while hovering through the list (matches model-selector behavior).
              const effectiveCurrent = defaultConnectionNameProp ?? connection?.name;
              const isSelected = effectiveCurrent === conn.name;

              return (
                <CommandItem
                  key={conn.name}
                  value={conn.name}
                  onSelect={() => handleConnectionSelect(conn)}
                  className={cn(
                    "flex items-center justify-between !rounded-none cursor-pointer !py-2 !px-2.5 transition-colors hover:bg-muted group",
                    isSelected && "bg-muted"
                  )}
                  style={{ borderRadius: 0 }}
                >
                  <div
                    className={cn(
                      "flex items-center text-sm truncate flex-1 min-w-0",
                      isSelected && "text-primary"
                    )}
                  >
                    {isSelected && <Check className="h-3 w-3 mr-1" />}
                    <HighlightableCommandItem text={conn.name} />
                  </div>
                </CommandItem>
              );
            })}
          </CommandList>

          <div className="h-px bg-border shrink-0" />
          <div className="items-center flex shrink-0">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-center text-sm font-normal gap-2 rounded-none"
              onClick={handleAddConnection}
            >
              <Plus className="h-3 w-3" />
              Add Connection
            </Button>
          </div>
        </div>

        {/* Right Pane: description view hidden on mobile for simplicity */}
        {!isMobile && (
          <ConnectionDetailPanel conn={highlightedConnection} onEdit={handleEditConnection} />
        )}
      </Command>
    </>
  );
}
