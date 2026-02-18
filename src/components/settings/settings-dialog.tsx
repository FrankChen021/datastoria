import { ConnectionProvider } from "@/components/connection/connection-context";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { ChevronRight, X } from "lucide-react";
import React, { useCallback, useState } from "react";
import ReactDOM from "react-dom/client";
import { SETTINGS_REGISTRY, type SettingsSection } from "./settings-registry";

export interface ShowSettingsDialogOptions {
  initialSection?: SettingsSection;
  onCancel?: () => void;
}

function SettingsDialogWrapper({
  onCancel,
  initialSection = "query-context",
}: {
  onCancel?: () => void;
  initialSection?: SettingsSection;
}) {
  const [activeSection, setActiveSection] = useState<SettingsSection>(initialSection);

  const handleClose = useCallback(() => {
    if (onCancel) {
      onCancel();
    }
  }, [onCancel]);

  // Handle ESC key to close
  React.useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        handleClose();
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, [handleClose]);

  const activePage = SETTINGS_REGISTRY[activeSection];
  const ActiveComponent = activePage.component;

  return (
    <div className="fixed inset-0 z-[9999] bg-background flex flex-col">
      <SidebarProvider>
        <div className="flex-1 overflow-hidden flex">
          {/* Inner Sidebar */}
          <Sidebar collapsible="none" variant="inset" className="border-r">
            <SidebarContent>
              <SidebarGroup>
                <SidebarGroupLabel>Settings</SidebarGroupLabel>
                <SidebarMenu>
                  {/* SQL Section */}
                  <SidebarMenuItem>
                    <Collapsible defaultOpen className="group/collapsible">
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton>
                          <ChevronRight className="transition-transform group-data-[state=open]/collapsible:rotate-90" />
                          <span>SQL</span>
                        </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <SidebarMenuSub>
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton
                              className="cursor-pointer"
                              onClick={() => setActiveSection("query-context")}
                              isActive={activeSection === "query-context"}
                            >
                              <span>Query Context</span>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        </SidebarMenuSub>
                      </CollapsibleContent>
                    </Collapsible>
                  </SidebarMenuItem>

                  {/* AI Section */}
                  <SidebarMenuItem>
                    <Collapsible defaultOpen className="group/collapsible">
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton>
                          <ChevronRight className="transition-transform group-data-[state=open]/collapsible:rotate-90" />
                          <span>AI</span>
                        </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <SidebarMenuSub>
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton
                              className="cursor-pointer"
                              onClick={() => setActiveSection("agent")}
                              isActive={activeSection === "agent"}
                            >
                              <span>Agent</span>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>

                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton
                              className="cursor-pointer"
                              onClick={() => setActiveSection("models")}
                              isActive={activeSection === "models"}
                            >
                              <span>Models</span>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        </SidebarMenuSub>
                      </CollapsibleContent>
                    </Collapsible>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroup>
            </SidebarContent>
          </Sidebar>

          {/* Main Content Area */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex-shrink-0 border-b px-4 py-2 flex items-center justify-between">
              <div className="flex flex-col">
                <div className="text-sm font-medium">{activePage.title}</div>
                <div className="text-xs text-muted-foreground">{activePage.description}</div>
              </div>
              <Button variant="ghost" size="icon" onClick={handleClose} className="h-8 w-8">
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Content Area - Fills remaining space */}
            <div className="flex-1 overflow-y-auto px-0 py-0">
              <ActiveComponent />
            </div>
          </div>
        </div>
      </SidebarProvider>
    </div>
  );
}

export function showSettingsDialog(options: ShowSettingsDialogOptions = {}) {
  const { onCancel, initialSection } = options;

  // Create a container div to mount the full-screen component
  const container = document.createElement("div");
  document.body.appendChild(container);

  // Create React root
  const root = ReactDOM.createRoot(container);

  // Function to cleanup and close
  const cleanup = () => {
    if (container.parentNode) {
      root.unmount();
      document.body.removeChild(container);
    }
    if (onCancel) {
      onCancel();
    }
  };

  // Render the full-screen component. ConnectionProvider with createConnectionFromPending
  // creates a connection from the last selected config so QueryContextEdit can use useConnection.
  root.render(
    <ConnectionProvider createConnectionFromPending>
      <SettingsDialogWrapper onCancel={cleanup} initialSection={initialSection} />
    </ConnectionProvider>
  );
}
