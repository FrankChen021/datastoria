"use client";

import { cn } from "@/lib/utils";
import { EllipsisVertical } from "lucide-react";
import React from "react";
import FloatingProgressBar from "@/components/floating-progress-bar";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { TitleOption } from "./dashboard-model";
import type { TimeSpan } from "./timespan-selector";

export type RefreshOptions = {
  inputFilter?: string;
  selectedTimeSpan?: TimeSpan;
};

export interface DashboardPanelComponent {
  refresh(param: RefreshOptions): void;

  getLastRefreshOptions(): RefreshOptions;
}

export interface DashboardPanelLayoutProps {
  // Card props
  componentRef?: React.RefObject<HTMLDivElement | null>;
  className?: string;
  style?: React.CSSProperties;

  // Loading state
  isLoading: boolean;

  // Collapsible state (optional - if not provided, card is not collapsible)
  isCollapsed?: boolean;
  setIsCollapsed?: (collapsed: boolean) => void;

  // Title/header configuration
  titleOption?: TitleOption;

  // Dropdown menu items
  dropdownItems?: React.ReactNode;

  // Content
  children: React.ReactNode;

  // Header styling variations
  headerClassName?: string; // Additional classes for header container
  headerBackground?: boolean; // Whether to show bg-muted/50 background
}

/**
 * Common layout component for dashboard cards
 * Handles Card wrapper, FloatingProgressBar, Collapsible, Header, and DropdownMenu
 */
export function DashboardPanelLayout({
  componentRef,
  className,
  style,
  isLoading,
  isCollapsed,
  setIsCollapsed,
  titleOption,
  dropdownItems,
  children,
  headerClassName,
  headerBackground = false,
}: DashboardPanelLayoutProps) {
  const isCollapsible = isCollapsed !== undefined && setIsCollapsed !== undefined;
  const showTitle = !!titleOption?.title && titleOption?.showTitle !== false;

  // Render dropdown menu button (absolutely positioned)
  const renderDropdownMenu = () => {
    if (!dropdownItems) return null;

    return (
      <div className="absolute right-2 z-10">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 p-0 flex items-center justify-center bg-transparent hover:bg-muted hover:ring-2 hover:ring-foreground/20"
              title="More options"
              aria-label="More options"
            >
              <EllipsisVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={0}>
            {dropdownItems}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  };

  // Render header with title (collapsible if enabled)
  const renderHeaderWithTitle = (wrapInTrigger = false) => {
    if (!showTitle || !titleOption) return null;

    const headerContent = (
      <div className={cn("flex items-center p-2 transition-colors", headerBackground && "bg-muted/50")}>
        <div className="flex-1 text-left min-w-0">
          <CardDescription
            className={cn(
              titleOption.align ? "text-" + titleOption.align : isCollapsible ? "text-left" : "text-center",
              "font-semibold text-muted-foreground m-0 truncate"
            )}
          >
            {titleOption.title}
          </CardDescription>
          {titleOption.description && (
            <CardDescription className="text-xs mt-1 m-0 truncate">{titleOption.description}</CardDescription>
          )}
        </div>
      </div>
    );

    const hoverClasses = isCollapsible ? "hover:bg-muted cursor-pointer" : "";

    const headerElement = (
      <CardHeader className={cn("p-0 relative", headerClassName)}>
        {wrapInTrigger ? (
          <CollapsibleTrigger className={cn("w-full transition-all", hoverClasses)}>{headerContent}</CollapsibleTrigger>
        ) : (
          <div className={cn("w-full", hoverClasses)}>{headerContent}</div>
        )}
        {renderDropdownMenu()}
      </CardHeader>
    );

    return headerElement;
  };

  return (
    <Card ref={componentRef} className={cn("@container/card rounded-sm relative overflow-hidden h-full flex flex-col", className)} style={style}>
      <FloatingProgressBar show={isLoading} />
      {isCollapsible ? (
        <Collapsible open={!isCollapsed} onOpenChange={(open) => setIsCollapsed?.(!open)} className="flex flex-col h-full">
          {renderHeaderWithTitle(true)}
          <CollapsibleContent className="flex-1 overflow-hidden">{children}</CollapsibleContent>
        </Collapsible>
      ) : (
        <>
          {renderHeaderWithTitle(false)}
          <div className="flex-1 overflow-hidden">{children}</div>
        </>
      )}
    </Card>
  );
}
