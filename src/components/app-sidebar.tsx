import { AppLogo } from "@/components/app-logo";
import { useChatPanel } from "@/components/chat/view/use-chat-panel";
import { useConnection } from "@/components/connection/connection-context";
import { ConnectionSelector } from "@/components/connection/connection-selector";
import { ConnectionSelectorDialog } from "@/components/connection/connection-selector-dialog";
import { openReleaseNotes } from "@/components/release-note/release-notes-view";
import { SYSTEM_TABLE_REGISTRY } from "@/components/system-table-tab/system-table-registry";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Switch } from "@/components/ui/switch";
import { UserProfileImage } from "@/components/user-profile-image";
import { hostNameManager } from "@/lib/host-name-manager";
import { MoonIcon, SunIcon } from "@radix-ui/react-icons";
import {
  BookOpen,
  ChartLine,
  ChevronRight,
  Database,
  HelpCircle,
  History,
  LogOut,
  Monitor,
  Network,
  ScrollText,
  Settings,
  Sparkles,
  Terminal,
} from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import React, { useCallback, useEffect, useState } from "react";
import { showSettingsDialog } from "./settings/settings-dialog";
import { useTheme } from "./shared/theme-provider";
import { TabManager } from "./tab-manager";

function HoverCardSidebarMenuItem({
  icon,
  description,
  content,
  contentClassName,
  align = "start",
}: {
  icon: React.ReactNode;
  description?: string;
  content: (isOpen: boolean, onClose: () => void) => React.ReactNode;
  contentClassName?: string;
  align?: "start" | "center" | "end";
}) {
  const [isOpen, setIsOpen] = useState(false);
  const isClickingRef = React.useRef(false);

  const onOpenChange = useCallback((newState: boolean) => {
    // This callback is invoked by HoverCard when it wants to change the open state.
    // We add this callback because if user click the trigger, the hover card will close --> open --> close.
    // We add this for better UX.
    //
    // The HoverCard will try to close when:
    // 1. Mouse leaves both the trigger and content
    // 2. User clicks on the trigger (which we want to prevent)
    //
    // When user clicks the trigger while the card is open:
    // - handlePointerDown sets isClickingRef.current = true
    // - HoverCard detects the click and calls onOpenChange(false)
    // - We intercept this close request here and ignore it
    // - Reset the flag so future legitimate close requests work
    if (newState === false && isClickingRef.current) {
      isClickingRef.current = false;
      return; // Ignore the close request - keep the card open
    }

    // For all other cases (hover in/out), update the state normally
    setIsOpen(newState);
  }, []);

  const onMenuItemPointerDown = useCallback(() => {
    // When user clicks the trigger button while the hover card is already open,
    // we set a flag so that onOpenChange can ignore the subsequent close request.
    // This prevents the card from closing when clicking the trigger.
    if (isOpen) {
      isClickingRef.current = true;
    }
  }, [isOpen]);

  const onClose = useCallback(() => {
    setIsOpen(false);
  }, []);

  return (
    <SidebarMenuItem>
      <HoverCard openDelay={200} open={isOpen} onOpenChange={onOpenChange}>
        <HoverCardTrigger asChild>
          <SidebarMenuButton size="default" onPointerDown={onMenuItemPointerDown}>
            {icon}
          </SidebarMenuButton>
        </HoverCardTrigger>
        <HoverCardContent side="right" align={align} className={contentClassName}>
          {description && <p className="text-xs text-muted-foreground mb-2 px-1">{description}</p>}
          {content(isOpen, onClose)}
        </HoverCardContent>
      </HoverCard>
    </SidebarMenuItem>
  );
}

function ConnectionManageSidebarMenuItem() {
  const { isMobile } = useSidebar();
  const { connection } = useConnection();
  const [open, setOpen] = useState(false);
  const [tooltipAllowed, setTooltipAllowed] = useState(true);
  const tooltipDelayRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Suppress the sidebar button tooltip while the popover is open and briefly after it closes.
  useEffect(() => {
    if (open) {
      if (tooltipDelayRef.current) {
        clearTimeout(tooltipDelayRef.current);
        tooltipDelayRef.current = null;
      }
      setTooltipAllowed(false);
    } else {
      tooltipDelayRef.current = setTimeout(() => {
        setTooltipAllowed(true);
        tooltipDelayRef.current = null;
      }, 400);
    }
    return () => {
      if (tooltipDelayRef.current) clearTimeout(tooltipDelayRef.current);
    };
  }, [open]);

  const triggerButton = (
    <SidebarMenuButton
      size="default"
      tooltip={
        tooltipAllowed
          ? {
              children: "Switch connection",
              className: "bg-primary text-primary-foreground text-xs px-2 py-1 border-0 rounded-sm",
            }
          : undefined
      }
      onClick={isMobile ? undefined : () => setOpen((s) => !s)}
    >
      <Database className="h-5 w-5" />
      <span>Switch connection</span>
    </SidebarMenuButton>
  );

  if (isMobile) {
    return (
      <SidebarMenuItem>
        <ConnectionSelectorDialog
          trigger={triggerButton}
          defaultConnectionName={connection?.name ?? null}
        />
      </SidebarMenuItem>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{triggerButton}</PopoverTrigger>
      <PopoverContent side="right" align="start" className="!w-auto !max-w-none p-0 shadow-lg">
        <ConnectionSelector isOpen={open} onClose={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}

function SystemTableIntrospectionSidebarMenuItem() {
  const { state, isMobile } = useSidebar();
  const isExpanded = state === "expanded" || isMobile;

  if (isExpanded) {
    return (
      <Collapsible defaultOpen={false} className="group/collapsible">
        <SidebarMenuItem>
          <CollapsibleTrigger asChild>
            <SidebarMenuButton size="default" tooltip="View system tables">
              <ScrollText className="h-5 w-5" />
              <span>System tables</span>
              <ChevronRight className="ml-auto h-4 w-4 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
            </SidebarMenuButton>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <SidebarMenuSub>
              {Array.from(SYSTEM_TABLE_REGISTRY.entries()).map(([tableName]) => (
                <SidebarMenuSubItem key={tableName}>
                  <SidebarMenuSubButton
                    asChild
                    onClick={() =>
                      TabManager.openTab({
                        id: `system-table:${tableName}`,
                        type: "system-table",
                        tableName,
                      })
                    }
                  >
                    <button type="button">system.{tableName}</button>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
              ))}
            </SidebarMenuSub>
          </CollapsibleContent>
        </SidebarMenuItem>
      </Collapsible>
    );
  }

  return (
    <HoverCardSidebarMenuItem
      icon={<ScrollText className="h-5 w-5" />}
      description="View system tables"
      content={() => (
        <div className="space-y-1">
          {Array.from(SYSTEM_TABLE_REGISTRY.entries()).map(([tableName]) => (
            <button
              key={tableName}
              className="w-full text-left px-2 py-1.5 text-sm rounded-sm hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors"
              onClick={() =>
                TabManager.openTab({
                  id: `system-table:${tableName}`,
                  type: "system-table",
                  tableName,
                })
              }
            >
              system.{tableName}
            </button>
          ))}
        </div>
      )}
      contentClassName="w-64 p-2"
    />
  );
}

function DashboardSidebarMenuItem() {
  const { connection } = useConnection();
  const { state } = useSidebar();
  const isClusterMode = connection?.cluster && connection.cluster.length > 0;
  const isExpanded = state === "expanded";

  const openNodeTab = () => {
    TabManager.openTab({
      id: `node:${connection?.metadata.displayName}`,
      type: "node",
      host: hostNameManager.getShortHostname(connection!.metadata.displayName),
    });
  };

  const openClusterTab = () => {
    TabManager.openTab({
      id: `cluster:${connection!.cluster}`,
      type: "cluster",
      cluster: connection!.cluster!,
    });
  };

  if (isClusterMode && isExpanded) {
    return (
      <SidebarMenuItem>
        <SidebarMenuButton size="default" tooltip="Dashboard">
          <ChartLine className="h-5 w-5" />
          <span>Dashboard</span>
        </SidebarMenuButton>
        <SidebarMenuSub>
          <SidebarMenuSubItem>
            <SidebarMenuSubButton asChild onClick={openNodeTab}>
              <button type="button">Node Status</button>
            </SidebarMenuSubButton>
          </SidebarMenuSubItem>
          <SidebarMenuSubItem>
            <SidebarMenuSubButton asChild onClick={openClusterTab}>
              <button type="button">Cluster Status</button>
            </SidebarMenuSubButton>
          </SidebarMenuSubItem>
        </SidebarMenuSub>
      </SidebarMenuItem>
    );
  }

  if (isClusterMode) {
    return (
      <HoverCardSidebarMenuItem
        icon={<ChartLine className="h-5 w-5" />}
        description="View dashboards"
        content={(_isOpen, onClose) => (
          <div className="space-y-1">
            <button
              className="w-full flex items-center gap-2 text-left px-2 py-1.5 text-sm rounded-sm hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors"
              onClick={() => {
                openNodeTab();
                onClose();
              }}
            >
              <Monitor className="h-4 w-4" />
              Node Status
            </button>
            <button
              className="w-full flex items-center gap-2 text-left px-2 py-1.5 text-sm rounded-sm hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors"
              onClick={() => {
                openClusterTab();
                onClose();
              }}
            >
              <Network className="h-4 w-4" />
              Cluster Status
            </button>
          </div>
        )}
        contentClassName="w-48 p-2"
      />
    );
  }

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        tooltip={{
          children: "Dashboard",
          className: "bg-primary text-primary-foreground text-xs px-2 py-1 border-0 rounded-sm",
        }}
        size="default"
        onClick={openNodeTab}
      >
        <ChartLine className="h-5 w-5" />
        <span>Dashboard</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

export function AppSidebar() {
  const { isConnectionAvailable, pendingConfig } = useConnection();
  const { data: session } = useSession();
  const { open: openChatPanel } = useChatPanel();

  // Show connection selector if connection is available OR if there's a pending config (failed initialization)
  // This allows users to switch connections even after a failure
  const showConnectionSelector = isConnectionAvailable || !!pendingConfig;

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem className="flex justify-center">
            <AppLogo width={24} height={24} />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup className="pt-0">
          <SidebarMenu>
            {showConnectionSelector && <ConnectionManageSidebarMenuItem />}
            {isConnectionAvailable && (
              <>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    tooltip={{
                      children: "Query",
                      className:
                        "bg-primary text-primary-foreground text-xs px-2 py-1 border-0 rounded-sm",
                    }}
                    size="default"
                    onClick={() => TabManager.activateQueryTab()}
                  >
                    <Terminal className="h-5 w-5" />
                    <span>Query</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <SidebarMenuButton
                    tooltip={{
                      children: "Chat with AI",
                      className:
                        "bg-primary text-primary-foreground text-xs px-2 py-1 border-0 rounded-sm",
                    }}
                    size="default"
                    onClick={openChatPanel}
                  >
                    <Sparkles className="h-5 w-5" />
                    <span>AI Assistant</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                <DashboardSidebarMenuItem />

                <SystemTableIntrospectionSidebarMenuItem />

                <SettingsSidebarMenuItem />
              </>
            )}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          {session?.user && (
            <SidebarMenuItem>
              <UserNavButton user={session.user} />
            </SidebarMenuItem>
          )}
          <SidebarMenuItem>
            <GitHubButton />
          </SidebarMenuItem>
          <HelpSidebarMenuItem />
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

function SettingsSidebarMenuItem() {
  const { theme, setTheme } = useTheme();
  const { state, isMobile } = useSidebar();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted
    ? theme === "system"
      ? window.document.documentElement.classList.contains("dark")
      : theme === "dark"
    : false;

  const toggleTheme = (checked: boolean) => {
    setTheme(checked ? "dark" : "light");
  };

  const isExpanded = state === "expanded" || isMobile;

  if (isExpanded) {
    return (
      <Collapsible defaultOpen={false} className="group/collapsible">
        <SidebarMenuItem>
          <CollapsibleTrigger asChild>
            <SidebarMenuButton size="default" tooltip="Settings">
              <Settings className="h-5 w-5" />
              <span>Settings</span>
              <ChevronRight className="ml-auto h-4 w-4 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
            </SidebarMenuButton>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <SidebarMenuSub>
              <SidebarMenuSubItem>
                <div
                  role="button"
                  tabIndex={0}
                  className="flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 text-sidebar-foreground outline-none ring-sidebar-ring hover:bg-sidebar-accent hover:text-sidebar-accent-foreground cursor-pointer [&>svg]:size-4 [&>svg]:shrink-0"
                  onClick={() => toggleTheme(!isDark)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggleTheme(!isDark);
                    }
                  }}
                >
                  {isDark ? <MoonIcon className="h-4 w-4" /> : <SunIcon className="h-4 w-4" />}
                  <span className="text-sm">{isDark ? "Dark Mode" : "Light Mode"}</span>
                  <Switch
                    checked={isDark}
                    onCheckedChange={toggleTheme}
                    aria-label="Toggle dark mode"
                    className="ml-auto h-4 w-8 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input [&>span]:h-3 [&>span]:w-3 [&>span]:data-[state=checked]:translate-x-4"
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              </SidebarMenuSubItem>
              <SidebarMenuSubItem>
                <SidebarMenuSubButton asChild onClick={() => showSettingsDialog()}>
                  <button type="button" className="flex items-center gap-2">
                    <Settings className="h-4 w-4 shrink-0" />
                    App Settings
                  </button>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            </SidebarMenuSub>
          </CollapsibleContent>
        </SidebarMenuItem>
      </Collapsible>
    );
  }

  return (
    <HoverCardSidebarMenuItem
      icon={<Settings className="h-5 w-5" />}
      description="Settings"
      content={(_isOpen, onClose) => (
        <div className="space-y-2">
          <div
            role="button"
            tabIndex={0}
            className="w-full flex items-center justify-between px-2 py-1.5 rounded-sm hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors"
            onClick={() => toggleTheme(!isDark)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                toggleTheme(!isDark);
              }
            }}
          >
            <div className="flex items-center gap-2 text-sm">
              {isDark ? <MoonIcon className="h-4 w-4" /> : <SunIcon className="h-4 w-4" />}
              <span>{isDark ? "Dark Mode" : "Light Mode"}</span>
            </div>
            <Switch
              checked={isDark}
              onCheckedChange={toggleTheme}
              aria-label="Toggle dark mode"
              className="h-4 w-8 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input [&>span]:h-3 [&>span]:w-3 [&>span]:data-[state=checked]:translate-x-4"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
          <button
            className="w-full flex items-center gap-2 text-left px-2 py-1.5 text-sm rounded-sm hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors"
            onClick={() => {
              showSettingsDialog();
              onClose();
            }}
          >
            <Settings className="h-4 w-4" />
            App Settings
          </button>
        </div>
      )}
      contentClassName="w-48 p-2"
    />
  );
}

export function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      role="img"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      fill="currentColor"
    >
      <title>GitHub</title>
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  );
}

function HelpSidebarMenuItem() {
  return (
    <HoverCardSidebarMenuItem
      icon={<HelpCircle className="h-5 w-5" />}
      description="Help & Resources"
      align="end"
      content={(_isOpen, onClose) => (
        <div className="space-y-1">
          <button
            className="w-full flex items-center gap-2 text-left px-2 py-1.5 text-sm rounded-sm hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors"
            onClick={() => {
              window.open("https://docs.datastoria.app", "_blank", "noopener,noreferrer");
              onClose();
            }}
          >
            <BookOpen className="h-4 w-4" />
            Documentation
          </button>
          <button
            className="w-full flex items-center gap-2 text-left px-2 py-1.5 text-sm rounded-sm hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors"
            onClick={() => {
              openReleaseNotes();
              onClose();
            }}
          >
            <History className="h-4 w-4" />
            Release Notes
          </button>
        </div>
      )}
      contentClassName="w-48 p-2"
    />
  );
}

function DocumentationButton() {
  const simpleTooltipClass =
    "bg-primary text-primary-foreground text-xs px-2 py-1 border-0 rounded-sm";

  return (
    <SidebarMenuButton
      size="default"
      tooltip={{
        children: "Documentation",
        className: simpleTooltipClass,
      }}
      onClick={() => window.open("https://docs.datastoria.app", "_blank", "noopener,noreferrer")}
    >
      <BookOpen className="h-5 w-5" />
      <span>Documentation</span>
    </SidebarMenuButton>
  );
}

function GitHubButton() {
  const simpleTooltipClass =
    "bg-primary text-primary-foreground text-xs px-2 py-1 border-0 rounded-sm";

  return (
    <SidebarMenuButton
      size="default"
      tooltip={{
        children: "View on GitHub",
        className: simpleTooltipClass,
      }}
      onClick={() =>
        window.open("https://github.com/FrankChen021/datastoria", "_blank", "noopener,noreferrer")
      }
    >
      <GitHubIcon className="h-5 w-5" />
      <span>View on GitHub</span>
    </SidebarMenuButton>
  );
}

function UserNavButton({
  user,
}: {
  user: { name?: string | null; email?: string | null; image?: string | null };
}) {
  const { isMobile } = useSidebar();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton>
          <UserProfileImage user={user} className="h-5 w-5" />
          <span>Account</span>
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-56" align="end" side={isMobile ? "top" : "right"}>
        <DropdownMenuLabel className="p-0 font-normal">
          <div className="flex items-center gap-2 px-2 py-1.5 text-left text-sm">
            <UserProfileImage user={user} className="h-8 w-8" />
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-semibold">{user.name}</span>
              <span className="truncate text-xs text-muted-foreground">{user.email}</span>
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="cursor-pointer"
          onClick={() => signOut({ callbackUrl: "/login" })}
        >
          <LogOut className="mr-2 h-4 w-4" />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
