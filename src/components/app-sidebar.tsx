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
import { ConnectionSelector } from "./connection/connection-selector";
import { TabManager } from "./tab-manager";
import { useConnection } from "@/lib/connection/ConnectionContext";
import { MoonIcon, SunIcon } from "@radix-ui/react-icons";
import { Database, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { useTheme } from "./theme-provider";

export function AppSidebar() {
  const { selectedConnection } = useConnection();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild size="lg" tooltip="ClickHouse Console" className="justify-center">
              <a href="/" className="flex items-center justify-center">
                <img src="/logo_clickhouse.svg" alt="ClickHouse" className="h-6 w-6" />
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            <SidebarMenuItem>
              <ConnectionSelector
                trigger={
                  <SidebarMenuButton
                    tooltip={selectedConnection ? `Current connection: ${selectedConnection.name}@${selectedConnection.url}` : "Select Connection"}
                    size="lg"
                    className="justify-center"
                  >
                    <Database className="h-5 w-5" />
                  </SidebarMenuButton>
                }
                sideOffset={5}
                side="right"
              />
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

