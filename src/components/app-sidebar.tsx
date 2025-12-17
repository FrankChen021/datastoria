import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useConnection } from "@/lib/connection/connection-context";
import { MoonIcon, SunIcon } from "@radix-ui/react-icons";
import { Database, LogOut, Search, Settings, Terminal } from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import Image from "next/image";
import { useEffect, useState } from "react";
import { ConnectionSelectorPopover } from "./connection/connection-selector-popover";
import { showQueryContextEditDialog } from "./query-tab/query-control/query-context-edit-dialog";
import { TabManager } from "./tab-manager";
import { useTheme } from "./theme-provider";

export function AppSidebar() {
  const { isReady } = useConnection();
  const [isConnectionSelectorOpen, setIsConnectionSelectorOpen] = useState(false);
  const { data: session } = useSession();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem className="flex justify-center">
            <Image src="/logo.png" alt="Data Scopic" width={24} height={24} />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            <SidebarMenuItem>
              <Tooltip open={isConnectionSelectorOpen ? false : undefined}>
                <TooltipTrigger asChild>
                  <div>
                    <ConnectionSelectorPopover
                      trigger={
                        <SidebarMenuButton size="lg" className="justify-center">
                          <Database className="h-5 w-5" />
                        </SidebarMenuButton>
                      }
                      sideOffset={5}
                      side="right"
                      onOpenChange={setIsConnectionSelectorOpen}
                    />
                  </div>
                </TooltipTrigger>
                <TooltipContent side="right" align="center">
                  Manage Connections
                </TooltipContent>
              </Tooltip>
            </SidebarMenuItem>
            {isReady && (
              <>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    tooltip="Query"
                    size="lg"
                    className="justify-center"
                    onClick={() => TabManager.activateQueryTab()}
                  >
                    <Terminal className="h-5 w-5" />
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    tooltip="Search Query Log"
                    size="lg"
                    className="justify-center"
                    onClick={() => TabManager.openQueryLogTab()}
                  >
                    <Search className="h-5 w-5" />
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    tooltip="Query Context"
                    size="lg"
                    className="justify-center"
                    onClick={() => showQueryContextEditDialog()}
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
      <SidebarMenuButton size="lg" onClick={toggleTheme} tooltip="Toggle theme" className="justify-center">
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

function UserNavButton({ user }: { user: { name?: string | null; email?: string | null; image?: string | null } }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton size="lg" className="justify-center">
          <Avatar className="h-5 w-5">
            <AvatarImage src={user.image ?? ""} alt={user.name ?? ""} />
            <AvatarFallback>{user.name?.[0]?.toUpperCase() ?? "U"}</AvatarFallback>
          </Avatar>
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-56" align="end" side="right" forceMount>
        <DropdownMenuLabel className="p-0 font-normal">
          <div className="flex items-center gap-2 px-2 py-1.5 text-left text-sm">
            <Avatar className="h-8 w-8">
              <AvatarImage src={user.image ?? ""} alt={user.name ?? ""} />
              <AvatarFallback>{user.name?.[0]?.toUpperCase() ?? "U"}</AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-semibold">{user.name}</span>
              <span className="truncate text-xs text-muted-foreground">{user.email}</span>
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="cursor-pointer" onClick={() => signOut({ callbackUrl: "/login" })}>
          <LogOut className="mr-2 h-4 w-4" />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
