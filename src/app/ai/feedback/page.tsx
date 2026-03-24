"use client";

import { AutoExplainFeedbackReport } from "@/components/ai/feedback/auto-explain-feedback-report";
import { AppSidebar } from "@/components/app-sidebar";
import { AppStorageProvider } from "@/components/app-storage-provider";
import { ChatPanelProvider } from "@/components/chat/view/use-chat-panel";
import { ConnectionProvider } from "@/components/connection/connection-context";
import { ReleaseDetectorProvider } from "@/components/release-note/release-detector";
import { ModelConfigBootstrap } from "@/components/settings/models/model-config-bootstrap";
import { ErrorBoundary } from "@/components/shared/error-boundary";
import { ThemeProvider } from "@/components/shared/theme-provider";
import { ToastProvider } from "@/components/shared/toast-provider";
import { DialogProvider } from "@/components/shared/use-dialog";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

export default function AIFeedbackPage() {
  return (
    <AppStorageProvider>
      <ModelConfigBootstrap>
        <ThemeProvider defaultTheme="dark">
          <ConnectionProvider>
            <ChatPanelProvider>
              <ReleaseDetectorProvider>
                <ToastProvider />
                <DialogProvider />
                <SidebarProvider open={false}>
                  <AppSidebar />
                  <SidebarInset className="min-w-0 flex flex-col overflow-x-hidden h-screen">
                    <div className="flex-1 min-h-0 overflow-auto">
                      <ErrorBoundary>
                        <div className="mx-auto w-full max-w-6xl p-6">
                          <div className="mb-6">
                            <h1 className="text-2xl font-semibold tracking-tight">
                              AI Feedback Report
                            </h1>
                            <p className="mt-1 text-sm text-muted-foreground">
                              Internal reporting for inline auto explain feedback quality.
                            </p>
                          </div>
                          <AutoExplainFeedbackReport />
                        </div>
                      </ErrorBoundary>
                    </div>
                  </SidebarInset>
                </SidebarProvider>
              </ReleaseDetectorProvider>
            </ChatPanelProvider>
          </ConnectionProvider>
        </ThemeProvider>
      </ModelConfigBootstrap>
    </AppStorageProvider>
  );
}
