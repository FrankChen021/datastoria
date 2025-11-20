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
import { useConnection } from "@/lib/connection/ConnectionContext";
import { MoonIcon, SunIcon } from "@radix-ui/react-icons";
import { Database, Search, Settings, Terminal } from "lucide-react";
import { useEffect, useState } from "react";
import { ConnectionSelector } from "./connection/connection-selector";
import { showQueryContextEditDialog } from "./query-tab/query-control/query-context-edit-dialog";
import { TabManager } from "./tab-manager";
import { useTheme } from "./theme-provider";

export function AppSidebar() {
  const { selectedConnection, hasAnyConnections } = useConnection();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <a href="/" className="flex items-center justify-center">
              <img src="/logo_clickhouse.svg" alt="ClickHouse" className="h-6 w-6" />
            </a>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            {hasAnyConnections && (
              <SidebarMenuItem>
                <ConnectionSelector
                  trigger={
                    <SidebarMenuButton tooltip={"Manage Connections"} size="lg" className="justify-center">
                      <Database className="h-5 w-5" />
                    </SidebarMenuButton>
                  }
                  sideOffset={5}
                  side="right"
                />
              </SidebarMenuItem>
            )}
            {selectedConnection && (
              <>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    tooltip="Query"
                    size="lg"
                    className="justify-center"
                    onClick={() => TabManager.sendActivateQueryTabRequest()}
                  >
                    <Terminal className="h-5 w-5" />
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    tooltip="Search Query Log"
                    size="lg"
                    className="justify-center"
                    onClick={() => TabManager.sendOpenQueryLogTabRequest()}
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
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

function ThemeToggleButton() {
  const { setTheme } = useTheme();
  const [isDark, setIsDark] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.document.documentElement.classList.contains("dark");
  });

  useEffect(() => {
    const root = window.document.documentElement;
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
