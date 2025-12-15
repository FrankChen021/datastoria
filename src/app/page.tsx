"use client";

import { AppSidebar } from "@/components/app-sidebar";
import { MainPage } from "@/components/main-page";
import { ThemeProvider } from "@/components/theme-provider";
import { ToastProvider } from "@/components/toast-provider";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { DialogProvider } from "@/components/use-dialog";
import { ConnectionProvider } from "@/lib/connection/connection-context";
import { SessionProvider } from "next-auth/react";

export default function Home() {
  return (
    <SessionProvider
      refetchOnWindowFocus={false}
      refetchInterval={0}
      basePath="/api/auth"
    >
      <ThemeProvider defaultTheme="dark" storageKey="app-ui-theme">
        <ConnectionProvider>
          <ToastProvider />
          <DialogProvider />
          <SidebarProvider open={false}>
            <AppSidebar />
            <SidebarInset className="min-w-0 overflow-x-hidden h-screen">
              <MainPage />
            </SidebarInset>
          </SidebarProvider>
        </ConnectionProvider>
      </ThemeProvider>
    </SessionProvider>
  );
}
