"use client";

import FloatingProgressBar from "@/components/floating-progress-bar";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { EllipsisVertical, RotateCw } from "lucide-react";
import React, { useState } from "react";
import type { TitleOption } from "./dashboard-model";
import type { TimeSpan } from "./timespan-selector";

export type RefreshOptions = {
  inputFilter?: string;
  selectedTimeSpan?: TimeSpan;
  forceRefresh?: boolean; // Force refresh even if parameters haven't changed
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

  // Refresh callback (called when refresh button is clicked)
  onRefresh?: () => void;

  // Content
  children: React.ReactNode;

  // Header styling variations
  headerClassName?: string; // Additional classes for header container
  headerBackground?: boolean; // Whether to show bg-muted/50 background
}

interface DashboardPanelHeaderProps {
  titleOption: TitleOption;
  isCollapsible: boolean;
  headerBackground: boolean;
  headerClassName?: string;
  wrapInTrigger: boolean;
  showRefreshButton: boolean;
  onRefresh?: () => void;
  dropdownItems?: React.ReactNode;
}

const DashboardPanelHeader = React.memo<DashboardPanelHeaderProps>(
  ({
    titleOption,
    isCollapsible,
    headerBackground,
    headerClassName,
    wrapInTrigger,
    showRefreshButton,
    onRefresh,
    dropdownItems,
  }) => {
    const [isHovered, setIsHovered] = useState(false);

    // Render refresh button (absolutely positioned, before dropdown menu)
    const renderRefreshButton = () => {
      if (!showRefreshButton || !onRefresh) return null;

      return (
        <div className="absolute right-10 top-[calc(50%-6px)] -translate-y-1/2 z-10">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-5 w-5 p-0 flex items-center justify-center bg-transparent hover:bg-muted hover:ring-2 hover:ring-foreground/20"
            title="Refresh panel"
            aria-label="Refresh panel"
            onClick={onRefresh}
          >
            <RotateCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      );
    };

    // Render dropdown menu button (absolutely positioned, only visible on hover)
    const renderDropdownMenu = () => {
      if (!dropdownItems) return null;

      return (
        <div className={cn("absolute right-2 top-[calc(50%-6px)] -translate-y-1/2 z-10 transition-opacity", isHovered ? "opacity-100" : "opacity-0")}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-5 w-5 p-0 flex items-center justify-center bg-transparent hover:bg-muted hover:ring-2 hover:ring-foreground/20"
                title="More options"
                aria-label="More options"
              >
                <EllipsisVertical className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={0}>
              {dropdownItems}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      );
    };

    // don't padding bottom so that we have more space for charts under the title
    const headerContent = (
      <div className={cn("flex items-center px-2 py-1 transition-colors", headerBackground && "bg-muted/50")}>
        <div className="flex-1 text-left min-w-0">
          <CardDescription
            className={cn(
              titleOption.align ? "text-" + titleOption.align : isCollapsible ? "text-left" : "text-center",
              "text-xs text-muted-foreground m-0 truncate"
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
      <CardHeader
        className={cn("p-0 relative", headerClassName)}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {wrapInTrigger ? (
          <CollapsibleTrigger className={cn("w-full transition-all", hoverClasses)}>{headerContent}</CollapsibleTrigger>
        ) : (
          <div className={cn("w-full", hoverClasses)}>{headerContent}</div>
        )}
        {renderRefreshButton()}
        {renderDropdownMenu()}
      </CardHeader>
    );

    return headerElement;
  }
);

DashboardPanelHeader.displayName = "DashboardPanelHeader";

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
  onRefresh,
  children,
  headerClassName,
  headerBackground = false,
}: DashboardPanelLayoutProps) {
  const isCollapsible = isCollapsed !== undefined && setIsCollapsed !== undefined;
  const showTitle = !!titleOption?.title && titleOption?.showTitle !== false;
  const showRefreshButton = titleOption?.showRefreshButton === true;

  // Render header with title (collapsible if enabled)
  const renderHeaderWithTitle = (wrapInTrigger = false) => {
    if (!showTitle || !titleOption) return null;

    return (
      <DashboardPanelHeader
        titleOption={titleOption}
        isCollapsible={isCollapsible}
        headerBackground={headerBackground}
        headerClassName={headerClassName}
        wrapInTrigger={wrapInTrigger}
        showRefreshButton={showRefreshButton}
        onRefresh={onRefresh}
        dropdownItems={dropdownItems}
      />
    );
  };

  return (
    <Card
      ref={componentRef}
      className={cn("@container/card rounded-sm relative overflow-hidden h-full flex flex-col", className)}
      style={style}
    >
      <FloatingProgressBar show={isLoading} />
      {isCollapsible ? (
        <Collapsible
          open={!isCollapsed}
          onOpenChange={(open) => setIsCollapsed?.(!open)}
          className="flex flex-col h-full"
        >
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
