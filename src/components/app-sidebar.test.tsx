/**
 * @vitest-environment jsdom
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppSidebar } from "./app-sidebar";

const {
  openMock,
  setDisplayModeMock,
  setActiveSidebarTabMock,
  switchConnectionMock,
  showConnectionEditDialogMock,
  showConnectionWizardDialogMock,
  savedConnectionsMock,
} = vi.hoisted(() => ({
  openMock: vi.fn(),
  setDisplayModeMock: vi.fn(),
  setActiveSidebarTabMock: vi.fn(),
  switchConnectionMock: vi.fn(),
  showConnectionEditDialogMock: vi.fn(),
  showConnectionWizardDialogMock: vi.fn(),
  savedConnectionsMock: vi.fn((): unknown[] => []),
}));

const testGlobal = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

vi.mock("@/components/chat/view/use-chat-panel", () => ({
  useChatPanel: () => ({
    open: openMock,
    setDisplayMode: setDisplayModeMock,
    setActiveSidebarTab: setActiveSidebarTabMock,
  }),
}));

vi.mock("@/components/connection/connection-context", () => ({
  useConnection: () => ({
    isConnectionAvailable: true,
    pendingConfig: null,
    connection: null,
    switchConnection: switchConnectionMock,
  }),
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: null }),
  signOut: vi.fn(),
}));

vi.mock("@/components/ui/sidebar", () => ({
  Sidebar: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SidebarContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SidebarFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SidebarGroup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SidebarHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SidebarMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SidebarMenuItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SidebarMenuButton: ({
    children,
    onClick,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
  }) => <button onClick={onClick}>{children}</button>,
  SidebarMenuSub: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SidebarMenuSubButton: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SidebarMenuSubItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  useSidebar: () => ({ isMobile: false, state: "collapsed" }),
}));

vi.mock("@/components/app-logo", () => ({
  AppLogo: () => <div>Logo</div>,
}));

vi.mock("@/components/connection/connection-selector", () => ({
  ConnectionSelector: () => <div>ConnectionSelector</div>,
}));

vi.mock("@/components/connection/connection-edit-component", () => ({
  showConnectionEditDialog: showConnectionEditDialogMock,
}));

vi.mock("@/components/connection/connection-wizard", () => ({
  showConnectionWizardDialog: showConnectionWizardDialogMock,
}));

vi.mock("@/components/connection/connection-selector-dialog", () => ({
  openConnectionSelectorDialog: vi.fn(),
}));

vi.mock("@/lib/connection/connection-manager", () => ({
  ConnectionManager: {
    getInstance: () => ({
      getConnections: savedConnectionsMock,
    }),
  },
}));

vi.mock("@/components/release-note/release-notes-view", () => ({
  openReleaseNotes: vi.fn(),
}));

vi.mock("./dashboard-tab/dashboard-list", () => ({
  DashboardList: () => <div>DashboardList</div>,
}));

vi.mock("./settings/settings-dialog", () => ({
  showSettingsDialog: vi.fn(),
}));

vi.mock("@/components/user-profile-image", () => ({
  UserProfileImage: () => <div>UserProfileImage</div>,
}));

vi.mock("@/components/ui/collapsible", () => ({
  Collapsible: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CollapsibleContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CollapsibleTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({
    children,
    onClick,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
  }) => <button onClick={onClick}>{children}</button>,
  DropdownMenuLabel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuSeparator: () => <div />,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/hover-card", () => ({
  HoverCard: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  HoverCardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  HoverCardTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe("AppSidebar", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    testGlobal.IS_REACT_ACT_ENVIRONMENT = true;
    openMock.mockReset();
    setDisplayModeMock.mockReset();
    setActiveSidebarTabMock.mockReset();
    switchConnectionMock.mockReset();
    showConnectionEditDialogMock.mockReset();
    showConnectionWizardDialogMock.mockReset();
    savedConnectionsMock.mockReset();
    savedConnectionsMock.mockReturnValue([]);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("opens the AI sidebar in panel mode when the active tab is the query editor", async () => {
    await act(async () => {
      root.render(<AppSidebar />);
    });

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent("ACTIVE_TAB_CHANGE", {
          detail: {
            tabId: "query",
            tabInfo: { id: "query", type: "query" },
          },
        })
      );
    });

    const button = Array.from(container.querySelectorAll("button")).find((candidate) =>
      candidate.textContent?.includes("Work with AI")
    );

    await act(async () => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(setActiveSidebarTabMock).toHaveBeenCalledWith("history");
    expect(setDisplayModeMock).toHaveBeenCalledWith("panel");
    expect(openMock).not.toHaveBeenCalled();
  });

  it("uses the default chat open behavior when the active tab is not the query editor", async () => {
    await act(async () => {
      root.render(<AppSidebar />);
    });

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent("ACTIVE_TAB_CHANGE", {
          detail: {
            tabId: "database:default",
            tabInfo: { id: "database:default", type: "database", database: "default" },
          },
        })
      );
    });

    const button = Array.from(container.querySelectorAll("button")).find((candidate) =>
      candidate.textContent?.includes("Work with AI")
    );

    await act(async () => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(setActiveSidebarTabMock).toHaveBeenCalledWith("history");
    expect(openMock).toHaveBeenCalled();
    expect(setDisplayModeMock).not.toHaveBeenCalled();
  });

  it("opens the first connection wizard from the connection button when no connection exists", async () => {
    await act(async () => {
      root.render(<AppSidebar />);
    });

    const button = Array.from(container.querySelectorAll("button")).find((candidate) =>
      candidate.textContent?.includes("Create Connection")
    );

    await act(async () => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(showConnectionWizardDialogMock).toHaveBeenCalled();
    expect(showConnectionEditDialogMock).not.toHaveBeenCalled();
  });

  it("opens the create connection dialog when saved connections already exist", async () => {
    savedConnectionsMock.mockReturnValue([{ name: "existing" }]);

    await act(async () => {
      root.render(<AppSidebar />);
    });

    const button = Array.from(container.querySelectorAll("button")).find((candidate) =>
      candidate.textContent?.includes("Create Connection")
    );

    await act(async () => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(showConnectionEditDialogMock).toHaveBeenCalledWith({
      connection: null,
      onSave: switchConnectionMock,
    });
    expect(showConnectionWizardDialogMock).not.toHaveBeenCalled();
  });
});
