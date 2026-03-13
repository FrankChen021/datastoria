import { Dialog as SharedDialog } from "@/components/shared/use-dialog";
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
    SharedDialog.close();
  }, [onCancel]);

  const activePage = SETTINGS_REGISTRY[activeSection];
  const ActiveComponent = activePage.component;

  return (
    <div className="fixed inset-0 bg-background flex flex-col">
      <SidebarProvider>
        <div className="flex-1 overflow-hidden flex">
          {/* Inner Sidebar */}
          <Sidebar collapsible="none" variant="inset" className="border-r">
            <SidebarContent>
              <SidebarGroup>
                <SidebarGroupLabel>Settings</SidebarGroupLabel>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      className="justify-start"
                      onClick={() => setActiveSection("ui")}
                      isActive={activeSection === "ui"}
                    >
                      <span>UI</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>

                  {/* SQL Section */}
                  <SidebarMenuItem>
                    <Collapsible defaultOpen className="group/collapsible">
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton>
                          <span>SQL</span>
                          <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
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
                          <span>AI</span>
                          <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                        </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <SidebarMenuSub>
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton
                              className="cursor-pointer"
                              onClick={() => setActiveSection("models")}
                              isActive={activeSection === "models"}
                            >
                              <span>Models</span>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>

                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton
                              className="cursor-pointer"
                              onClick={() => setActiveSection("skills")}
                              isActive={activeSection === "skills"}
                            >
                              <span>Skills</span>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>

                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton
                              className="cursor-pointer"
                              onClick={() => setActiveSection("agent")}
                              isActive={activeSection === "agent"}
                            >
                              <span>Agent</span>
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

  SharedDialog.showDialog({
    title: "Settings",
    visuallyHiddenTitle: true,
    overlayClassName: "!z-[9990]",
    className:
      "!z-[9990] !inset-0 !left-0 !top-0 !h-screen !w-screen !max-h-screen !max-w-none !translate-x-0 !translate-y-0 rounded-none border-0 p-0 shadow-none duration-0 data-[state=open]:!animate-none data-[state=closed]:!animate-none",
    closeButtonClassName: "hidden",
    disableContentScroll: true,
    mainContent: <SettingsDialogWrapper onCancel={onCancel} initialSection={initialSection} />,
  });
}
