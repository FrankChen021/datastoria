import { Button } from "@/components/ui/button";
import { useConnection } from "@/lib/connection/ConnectionContext";
import { Link, useMatchRoute } from "@tanstack/react-router";
import { LayoutDashboard, Terminal } from "lucide-react";
import { ConnectionSelector } from "./connection-selector";
import { ThemeToggle } from "./theme-toggle";

export default function NavBar() {
  const matchRoute = useMatchRoute();
  const isDashboardActive = !!matchRoute({ to: "/dashboard" });
  const isQueryActive = !!matchRoute({ to: "/query" });
  const { selectedConnection } = useConnection();

  return (
    <header className="sticky inset-x-0 top-0 w-full border-b h-[49px]">
      <nav className="flex items-center justify-between px-2 py-2 h-full">
        <div className="flex items-center ml-1 gap-2">
          <ConnectionSelector />
          {selectedConnection && (
            <>
              <Link to="/query">
                <Button variant={isQueryActive ? "secondary" : "ghost"} size="sm">
                  <Terminal className="h-4 w-4 mr-2" />
                  Query
                </Button>
              </Link>
              <Link to="/dashboard">
                <Button variant={isDashboardActive ? "secondary" : "ghost"} size="sm">
                  <LayoutDashboard className="h-4 w-4 mr-2" />
                  Dashboard
                </Button>
              </Link>
            </>
          )}
        </div>
        <div className="flex items-center mr-1 gap-2">
          <ThemeToggle />
        </div>
      </nav>
    </header>
  );
}
