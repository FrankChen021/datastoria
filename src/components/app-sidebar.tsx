import { AppLogo } from "@/components/app-logo";
import { useChatPanel } from "@/components/chat/view/use-chat-panel";
import { useConnection } from "@/components/connection/connection-context";
import { ConnectionSelector } from "@/components/connection/connection-selector";
import { SYSTEM_TABLE_REGISTRY } from "@/components/system-table-tab/system-table-registry";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Switch } from "@/components/ui/switch";
import { UserProfileImage } from "@/components/user-profile-image";
import { hostNameManager } from "@/lib/host-name-manager";
import { MoonIcon, SunIcon } from "@radix-ui/react-icons";
import {
  BookOpen,
  ChartLine,
  Database,
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
}: {
  icon: React.ReactNode;
  description?: string;
  content: (isOpen: boolean, onClose: () => void) => React.ReactNode;
  contentClassName?: string;
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
          <SidebarMenuButton
            size="lg"
            className="justify-center"
            onPointerDown={onMenuItemPointerDown}
          >
            {icon}
          </SidebarMenuButton>
        </HoverCardTrigger>
        <HoverCardContent side="right" align="start" className={contentClassName}>
          {description && <p className="text-xs text-muted-foreground mb-2 px-1">{description}</p>}
          {content(isOpen, onClose)}
        </HoverCardContent>
      </HoverCard>
    </SidebarMenuItem>
  );
}

function ConnectionManageSidebarMenuItem() {
  return (
    <HoverCardSidebarMenuItem
      icon={<Database className="h-5 w-5" />}
      content={(isOpen, onClose) => <ConnectionSelector isOpen={isOpen} onClose={onClose} />}
      contentClassName="w-[450px] p-0"
    />
  );
}

function SystemTableIntrospectionSidebarMenuItem() {
  return (
    <HoverCardSidebarMenuItem
      icon={<ScrollText className="h-5 w-5" />}
      description="View system tables"
      content={() => (
        <div className="space-y-1">
          {Array.from(SYSTEM_TABLE_REGISTRY.entries()).map(([tableName, _entry]) => (
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
  const isClusterMode = connection?.cluster && connection.cluster.length > 0;

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
      cluster: "default_cluster",
    });
  };

  // When cluster is supported, show hover card with submenu items
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

  // When cluster is not supported, show a simple icon button
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        tooltip={{
          children: "Dashboard",
          className: "bg-primary text-primary-foreground text-xs px-2 py-1 border-0 rounded-sm",
        }}
        size="lg"
        className="justify-center"
        onClick={openNodeTab}
      >
        <ChartLine className="h-5 w-5" />
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
                    size="lg"
                    className="justify-center"
                    onClick={() => TabManager.activateQueryTab()}
                  >
                    <Terminal className="h-5 w-5" />
                  </SidebarMenuButton>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <SidebarMenuButton
                    tooltip={{
                      children: "AI Chat",
                      className:
                        "bg-primary text-primary-foreground text-xs px-2 py-1 border-0 rounded-sm",
                    }}
                    size="lg"
                    className="justify-center"
                    onClick={openChatPanel}
                  >
                    <Sparkles className="h-5 w-5" />
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
          <SidebarMenuItem>
            <DocumentationButton />
          </SidebarMenuItem>
          <SidebarMenuItem>
            <GitHubButton />
          </SidebarMenuItem>
          {session?.user && (
            <SidebarMenuItem>
              <UserNavButton user={session.user} />
            </SidebarMenuItem>
          )}
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

function SettingsSidebarMenuItem() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Resolve the actual theme (handle "system" by checking the document class)
  const isDark = mounted
    ? theme === "system"
      ? window.document.documentElement.classList.contains("dark")
      : theme === "dark"
    : false;

  const toggleTheme = (checked: boolean) => {
    setTheme(checked ? "dark" : "light");
  };

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

function GitHubIcon({ className }: { className?: string }) {
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

function DocumentationButton() {
  const simpleTooltipClass =
    "bg-primary text-primary-foreground text-xs px-2 py-1 border-0 rounded-sm";

  return (
    <SidebarMenuButton
      size="lg"
      tooltip={{
        children: "Documentation",
        className: simpleTooltipClass,
      }}
      className="justify-center"
      onClick={() => window.open("https://docs.datastoria.app", "_blank", "noopener,noreferrer")}
    >
      <BookOpen className="h-5 w-5" />
    </SidebarMenuButton>
  );
}

function GitHubButton() {
  const simpleTooltipClass =
    "bg-primary text-primary-foreground text-xs px-2 py-1 border-0 rounded-sm";

  return (
    <SidebarMenuButton
      size="lg"
      tooltip={{
        children: "View on GitHub",
        className: simpleTooltipClass,
      }}
      className="justify-center"
      onClick={() =>
        window.open("https://github.com/FrankChen021/datastoria", "_blank", "noopener,noreferrer")
      }
    >
      <GitHubIcon className="h-5 w-5" />
    </SidebarMenuButton>
  );
}

function UserNavButton({
  user,
}: {
  user: { name?: string | null; email?: string | null; image?: string | null };
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton size="lg" className="justify-center">
          <UserProfileImage user={user} className="h-5 w-5" />
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-56" align="end" side="right" forceMount>
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
