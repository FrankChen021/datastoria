"use client";

import { AppSidebar } from "@/components/app-sidebar";
import { AppStorageProvider } from "@/components/app-storage-provider";
import { ChatPanelProvider } from "@/components/chat/view/use-chat-panel";
import { ConnectionProvider } from "@/components/connection/connection-context";
import { MainPage } from "@/components/main-page";
import { ReleaseDetectorProvider } from "@/components/release-note/release-detector";
import { ErrorBoundary } from "@/components/shared/error-boundary";
import { ThemeProvider } from "@/components/shared/theme-provider";
import { ToastProvider } from "@/components/shared/toast-provider";
import { DialogProvider } from "@/components/shared/use-dialog";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { SessionProvider } from "next-auth/react";

export default function Home() {
  return (
    <SessionProvider refetchOnWindowFocus={false} refetchInterval={0} basePath="/api/auth">
      <AppStorageProvider>
        <ThemeProvider defaultTheme="dark">
          <ConnectionProvider>
            <ChatPanelProvider>
              <ReleaseDetectorProvider>
                <ToastProvider />
                <DialogProvider />
                <SidebarProvider open={false}>
                  <AppSidebar />
                  <SidebarInset className="min-w-0 flex flex-col overflow-x-hidden h-screen">
                    <div className="flex-1 min-h-0 min-w-0 overflow-hidden">
                      <ErrorBoundary>
                        <MainPage />
                      </ErrorBoundary>
                    </div>
                  </SidebarInset>
                </SidebarProvider>
              </ReleaseDetectorProvider>
            </ChatPanelProvider>
          </ConnectionProvider>
        </ThemeProvider>
      </AppStorageProvider>
    </SessionProvider>
  );
}
