import { AppLogo } from "@/components/app-logo";
import { useConnection } from "@/components/connection/connection-context";
import { ConnectionSelector } from "@/components/connection/connection-selector";
import { SYSTEM_TABLE_REGISTRY } from "@/components/table-tab/system-table/system-table-registry";
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
import { MoonIcon, SunIcon } from "@radix-ui/react-icons";
import { Activity, Database, LogOut, Settings, Sparkles, Terminal } from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import React, { useCallback, useEffect, useState } from "react";
import { showSettingsDialog } from "./settings/settings-dialog";
import { TabManager } from "./tab-manager";
import { useTheme } from "./theme-provider";

function ConnectionManageSidebarMenuItem() {
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

  return (
    <SidebarMenuItem>
      <HoverCard openDelay={200} open={isOpen} onOpenChange={onOpenChange}>
        <HoverCardTrigger asChild>
          <SidebarMenuButton
            size="lg"
            className="justify-center"
            onPointerDown={onMenuItemPointerDown}
          >
            <Database className="h-5 w-5" />
          </SidebarMenuButton>
        </HoverCardTrigger>
        <HoverCardContent side="right" align="start" className="w-[400px] p-0">
          <ConnectionSelector isOpen={isOpen} onClose={() => setIsOpen(false)} />
        </HoverCardContent>
      </HoverCard>
    </SidebarMenuItem>
  );
}

export function AppSidebar() {
  const { isReady } = useConnection();
  const { data: session } = useSession();

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
            {isReady && (
              <>
                <ConnectionManageSidebarMenuItem />

                <SidebarMenuItem>
                  <SidebarMenuButton
                    tooltip="Click to open Query Tab"
                    size="lg"
                    className="justify-center"
                    onClick={() => TabManager.activateQueryTab()}
                  >
                    <Terminal className="h-5 w-5" />
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <HoverCard openDelay={200}>
                    <HoverCardTrigger asChild>
                      <SidebarMenuButton size="lg" className="justify-center">
                        <Activity className="h-5 w-5" />
                      </SidebarMenuButton>
                    </HoverCardTrigger>
                    <HoverCardContent side="right" align="start" className="w-64 p-2">
                      <div className="space-y-1">
                        {Array.from(SYSTEM_TABLE_REGISTRY.keys()).map((tableName) => (
                          <button
                            key={tableName}
                            className="w-full text-left px-2 py-1.5 text-sm rounded-sm hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors"
                            onClick={() => TabManager.openTableTab("system", tableName)}
                          >
                            system.{tableName}
                          </button>
                        ))}
                      </div>
                    </HoverCardContent>
                  </HoverCard>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    tooltip="Click to open AI Chat Tab"
                    size="lg"
                    className="justify-center"
                    onClick={() => TabManager.openChatTab()}
                  >
                    <Sparkles className="h-5 w-5" />
                  </SidebarMenuButton>
                </SidebarMenuItem>
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
