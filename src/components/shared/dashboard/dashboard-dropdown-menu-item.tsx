import { DropdownMenuItem, DropdownMenuSubTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import React from "react";

/**
 * Compact dropdown menu item for dashboard panels
 * Applies consistent compact styling across all dashboard components
 */
export const DashboardDropdownMenuItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuItem>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuItem>
>(({ className, ...props }, ref) => {
  return (
    <DropdownMenuItem ref={ref} className={cn("py-1 px-2 text-xs min-h-0", className)} {...props} />
  );
});

DashboardDropdownMenuItem.displayName = "DashboardDropdownMenuItem";

/**
 * Compact dropdown menu sub-trigger for dashboard panels
 * Applies consistent compact styling across all dashboard components
 */
export const DashboardDropdownMenuSubTrigger = React.forwardRef<
  React.ElementRef<typeof DropdownMenuSubTrigger>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuSubTrigger>
>(({ className, ...props }, ref) => {
  return (
    <DropdownMenuSubTrigger
      ref={ref}
      className={cn("py-1 px-2 text-xs min-h-0", className)}
      {...props}
    />
  );
});

DashboardDropdownMenuSubTrigger.displayName = "DashboardDropdownMenuSubTrigger";
