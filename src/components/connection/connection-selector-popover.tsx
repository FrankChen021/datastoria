import { useConnection } from "@/components/connection/connection-context";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ConnectionManager } from "@/lib/connection/connection-manager";
import { Pencil } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Input } from "../ui/input";
import { showConnectionEditDialog } from "./connection-edit-component";
import { ConnectionSelector } from "./connection-selector";

interface ConnectionSelectorPopoverProps {
  /**
   * Custom trigger element. If provided, this will be used instead of the default Input field.
   * This is useful for sidebar contexts where you want to use a SidebarMenuButton.
   */
  trigger?: ReactNode;
  /**
   * Custom className for the popover content.
   */
  popoverClassName?: string;
  /**
   * Side offset for the popover. Defaults to 0 for nav-bar, 5 for sidebar.
   */
  sideOffset?: number;
  /**
   * Side of the popover. Defaults to "bottom" for nav-bar, "right" for sidebar.
   */
  side?: "top" | "right" | "bottom" | "left";
  /**
   * Callback that receives the popover open state. Useful for disabling tooltips when popover is open.
   */
  onOpenChange?: (open: boolean) => void;
}

/**
 * Popover-based connection selector.
 * Used in contexts where the selector should appear near the trigger (e.g., sidebar).
 */
export function ConnectionSelectorPopover({
  trigger,
  popoverClassName = "w-[400px] p-0",
  sideOffset,
  side,
  onOpenChange,
}: ConnectionSelectorPopoverProps) {
  const { connection } = useConnection();
  const [isCommandOpen, setIsCommandOpen] = useState(false);

  // Handle open state changes
  const handleOpenChange = (open: boolean) => {
    setIsCommandOpen(open);
    onOpenChange?.(open);
  };

  // Handler for editing connection from the input field's edit button
  const handleEditConnectionFromInput = () => {
    if (connection) {
      // Find the actual Connection object from the manager/list to ensure we have all properties (like editable)
      const manager = ConnectionManager.getInstance();
      const connectionToEdit = manager.getConnections().find((c) => c.name === connection.name);

      if (connectionToEdit) {
        showConnectionEditDialog({
          connection: connectionToEdit,
        });
      }
    }
  };

  // Default side offset
  const defaultSideOffset = trigger !== undefined ? 5 : 0;

  // Render trigger - either custom trigger or default Input field
  const renderTrigger = () => {
    if (trigger) {
      return trigger;
    }

    return (
      <div className="relative">
        <Input
          className="w-[350px] h-9 pr-9 cursor-pointer"
          title="Edit Connection"
          value={connection ? `${connection.name}@${connection.url}` : ""}
          readOnly
        />
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-0 top-0 h-9 w-9 rounded-l-none"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (connection) {
              // Trigger edit logic which will resolve the connection object
              handleEditConnectionFromInput();
            }
          }}
          title="Edit Connection"
        >
          <Pencil className="h-4 w-4" />
        </Button>
      </div>
    );
  };

  return (
    <div className="flex items-center gap-1">
      <Popover open={isCommandOpen} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>{renderTrigger()}</PopoverTrigger>
        <PopoverContent
          className={popoverClassName}
          align="start"
          sideOffset={sideOffset ?? defaultSideOffset}
          side={side}
        >
          <ConnectionSelector isOpen={isCommandOpen} onClose={() => setIsCommandOpen(false)} />
        </PopoverContent>
      </Popover>
    </div>
  );
}
