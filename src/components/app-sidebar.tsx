import { AppLogo } from "@/components/app-logo";
import { useConnection } from "@/components/connection/connection-context";
import { ConnectionSelector } from "@/components/connection/connection-selector";
import { SYSTEM_TABLE_REGISTRY } from "@/components/introspection/system-table-registry";
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
import { UserProfileImage } from "@/components/user-profile-image";
import { hostNameManager } from "@/lib/host-name-manager";
import { MoonIcon, SunIcon } from "@radix-ui/react-icons";
import {
  ChartLine,
  Database,
  LogOut,
  Monitor,
  Network,
  Settings,
  Sparkles,
  Telescope,
  Terminal,
} from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import React, { useCallback, useEffect, useState } from "react";
import { showSettingsDialog } from "./settings/settings-dialog";
import { TabManager } from "./tab-manager";
import { useTheme } from "./theme-provider";

function HoverCardSidebarMenuItem({
  icon,
  content,
  contentClassName,
}: {
  icon: React.ReactNode;
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
      contentClassName="w-[400px] p-0"
    />
  );
}

function SystemTableIntrospectionSidebarMenuItem() {
  return (
    <HoverCardSidebarMenuItem
      icon={<Telescope className="h-5 w-5" />}
      content={() => (
        <div className="space-y-1">
          {Array.from(SYSTEM_TABLE_REGISTRY.entries()).map(([tableName, entry]) => (
            <button
              key={tableName}
              className="w-full text-left px-2 py-1.5 text-sm rounded-sm hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors"
              onClick={() =>
                TabManager.openTab({
                  id: `introspection:${tableName}`,
                  type: "introspection",
                  tableName,
                })
              }
            >
              {entry.title}
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
      cluster: connection!.cluster!,
    });
  };

  // When cluster is supported, show hover card with submenu items
  if (isClusterMode) {
    return (
      <HoverCardSidebarMenuItem
        icon={<ChartLine className="h-5 w-5" />}
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
        tooltip="Click to open node status dashboard"
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
                    tooltip="Click to open query tab to write and execute SQL"
                    size="lg"
                    className="justify-center"
                    onClick={() => TabManager.activateQueryTab()}
                  >
                    <Terminal className="h-5 w-5" />
                  </SidebarMenuButton>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <SidebarMenuButton
                    tooltip="Click to open chat tab to chat with AI"
                    size="lg"
                    className="justify-center"
                    onClick={() => TabManager.openChatTab()}
                  >
                    <Sparkles className="h-5 w-5" />
                  </SidebarMenuButton>
                </SidebarMenuItem>

                <DashboardSidebarMenuItem />

                <SystemTableIntrospectionSidebarMenuItem />

                <SidebarMenuItem>
                  <SidebarMenuButton
                    tooltip="Click to open Settings"
                    size="lg"
                    className="justify-center"
                    onClick={() => showSettingsDialog()}
                  >
                    <Settings className="h-5 w-5" />
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </>
            )}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <ThemeToggleButton />
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

function ThemeToggleButton() {
  const { setTheme } = useTheme();
  const [isDark, setIsDark] = useState<boolean | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Set mounted flag to true after client-side hydration
    setMounted(true);

    const root = window.document.documentElement;
    // Set initial value after mount
    setIsDark(root.classList.contains("dark"));

    const observer = new MutationObserver(() => {
      setIsDark(root.classList.contains("dark"));
    });

    observer.observe(root, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => observer.disconnect();
  }, []);

  const toggleTheme = () => {
    const root = window.document.documentElement;
    const currentlyDark = root.classList.contains("dark");
    setTheme(currentlyDark ? "light" : "dark");
  };

  // Prevent hydration mismatch by not rendering icons until mounted
  if (!mounted) {
    return (
      <SidebarMenuButton
        size="lg"
        onClick={toggleTheme}
        tooltip="Toggle theme"
        className="justify-center"
      >
        <div className="h-5 w-5" />
      </SidebarMenuButton>
    );
  }

  return (
    <SidebarMenuButton
      size="lg"
      onClick={toggleTheme}
      tooltip={isDark ? "Switch to Light mode" : "Switch to Dark mode"}
      className="justify-center"
    >
      {isDark ? <SunIcon className="h-5 w-5" /> : <MoonIcon className="h-5 w-5" />}
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
