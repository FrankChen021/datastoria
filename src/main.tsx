import { createRoot } from "react-dom/client";
import { AppSidebar } from "./components/app-sidebar";
import { MainPage } from "./components/main-page";
import { ThemeProvider } from "./components/theme-provider";
import { ToastProvider } from "./components/toast-provider";
import { SidebarInset, SidebarProvider } from "./components/ui/sidebar";
import { DialogProvider } from "./components/use-dialog";
import "./index.css";
import { ConnectionProvider } from "./lib/connection/connection-context";
import "./lib/number-utils"; // Import to register Number prototype extensions early

createRoot(document.getElementById("root")!).render(
  <ThemeProvider defaultTheme="dark" storageKey="app-ui-theme">
    <ConnectionProvider>
      <ToastProvider />
      <DialogProvider />
      <SidebarProvider open={false}>
        <AppSidebar />
        <SidebarInset className="min-w-0 overflow-x-hidden h-screen flex flex-col">
          <MainPage />
        </SidebarInset>
      </SidebarProvider>
    </ConnectionProvider>
  </ThemeProvider>
);
