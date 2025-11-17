"use client";

import { cn } from "@/lib/utils";
import { ChevronRight, EllipsisVertical } from "lucide-react";
import React from "react";
import FloatingProgressBar from "../floating-progress-bar";
import { Button } from "../ui/button";
import { Card, CardDescription, CardHeader } from "../ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../ui/collapsible";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "../ui/dropdown-menu";
import type { TitleOption } from "./dashboard-model";
import type { TimeSpan } from "./timespan-selector";

export type RefreshParameter = {
  inputFilter?: string;
  selectedTimeSpan?: TimeSpan;
};

export interface RefreshableComponent {
  refresh(param: RefreshParameter): void;

  getLastRefreshParameter(): RefreshParameter;
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
  hasTitle?: boolean; // Whether to show title in header (vs description only)

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
  hasTitle,
  dropdownItems,
  children,
  headerClassName,
  headerBackground = false,
}: DashboardPanelLayoutProps) {
  const isCollapsible = isCollapsed !== undefined && setIsCollapsed !== undefined;
  const showTitle = hasTitle && titleOption?.title && titleOption?.showTitle !== false;

  // Render dropdown menu button
  const renderDropdownMenu = () => {
    if (!dropdownItems) return null;

    return (
      <div className="pr-2">
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
      <div className={cn("flex items-center p-2 transition-colors gap-2", headerBackground && "bg-muted/50")}>
        {isCollapsible && (
          <ChevronRight
            className={cn("h-4 w-4 transition-transform duration-200 shrink-0", !isCollapsed && "rotate-90")}
          />
        )}
        <div className="flex-1 text-left">
          <CardDescription
            className={cn(
              titleOption.align ? "text-" + titleOption.align : isCollapsible ? "text-left" : "text-center",
              "font-semibold text-muted-foreground m-0"
            )}
          >
            {titleOption.title}
          </CardDescription>
          {titleOption.description && (
            <CardDescription className="text-xs mt-1 m-0">{titleOption.description}</CardDescription>
          )}
        </div>
      </div>
    );

    const headerElement = (
      <CardHeader className={cn("p-0", headerClassName)}>
        <div className="flex items-center">
          {wrapInTrigger ? (
            <CollapsibleTrigger className="flex-1">{headerContent}</CollapsibleTrigger>
          ) : (
            <div className="flex-1">{headerContent}</div>
          )}
          {renderDropdownMenu()}
        </div>
      </CardHeader>
    );

    return headerElement;
  };

  // Render header with description only (no title)
  const renderHeaderWithDescription = () => {
    if (showTitle || !titleOption) return null;

    return (
      <CardHeader className={cn("pt-5 pb-3", headerClassName)}>
        <div className="flex items-center justify-between">
          {titleOption.description && <CardDescription className="text-xs">{titleOption.description}</CardDescription>}
          <div className="ml-auto">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <EllipsisVertical className="h-4 w-4" />
                  <span className="sr-only">More options</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">{dropdownItems}</DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardHeader>
    );
  };

  // Render minimal header (no title option)
  const renderMinimalHeader = () => {
    if (titleOption) return null;

    return (
      <CardHeader className={cn("p-0", headerClassName)}>
        <div className="flex items-center justify-end pr-2 pt-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <EllipsisVertical className="h-4 w-4" />
                <span className="sr-only">More options</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">{dropdownItems}</DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
    );
  };

  return (
    <Card ref={componentRef} className={cn("@container/card relative overflow-hidden", className)} style={style}>
      <FloatingProgressBar show={isLoading} />
      {isCollapsible ? (
        <Collapsible open={!isCollapsed} onOpenChange={(open) => setIsCollapsed?.(!open)}>
          {renderHeaderWithTitle(true)}
          <CollapsibleContent>{children}</CollapsibleContent>
        </Collapsible>
      ) : (
        <>
          {renderHeaderWithTitle(false)}
          {renderHeaderWithDescription()}
          {renderMinimalHeader()}
          {children}
        </>
      )}
      {/* Description and minimal headers are always outside Collapsible */}
      {isCollapsible && (
        <>
          {renderHeaderWithDescription()}
          {renderMinimalHeader()}
        </>
      )}
    </Card>
  );
}
