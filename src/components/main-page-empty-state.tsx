import { Button } from "@/components/ui/button";
import { TabManager } from "@/components/tab-manager";
import { AlertCircle, Database, Loader2, Plus, RotateCcw } from "lucide-react";

export type AppInitStatus = "initializing" | "ready" | "error";

interface MainPageEmptyStateProps {
  status: AppInitStatus;
  error?: string | null;
  onRetry?: () => void;
}

export function MainPageEmptyState({ 
  status, 
  error, 
  onRetry 
}: MainPageEmptyStateProps) {
  
  // 1. Loading State
  if (status === "initializing") {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center bg-muted/5 p-8 text-center animate-in fade-in duration-500">
        <div className="bg-background p-4 rounded-full shadow-sm border mb-6">
          <Loader2 className="h-8 w-8 text-primary animate-spin" />
        </div>
        <h3 className="text-lg font-medium mb-2">Connecting to Database...</h3>
        <p className="text-muted-foreground text-sm">
          Loading schema and verifying connection
        </p>
      </div>
    );
  }

  // 2. Error State
  if (status === "error") {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center bg-muted/5 p-8 text-center animate-in slide-in-from-bottom-4 duration-300">
        <div className="bg-destructive/10 p-4 rounded-full mb-6">
          <AlertCircle className="h-10 w-10 text-destructive" />
        </div>
        <h3 className="text-lg font-medium mb-2">Connection Failed</h3>
        <p className="text-muted-foreground max-w-md mb-8 text-sm whitespace-pre-wrap">
          {error || "Unable to establish a connection to the server."}
        </p>
        <div className="flex gap-3 mt-4">
          {onRetry && (
            <Button onClick={onRetry} variant="outline" className="gap-2">
              <RotateCcw className="h-4 w-4" />
              Retry Connection
            </Button>
          )}
        </div>
      </div>
    );
  }

  // 3. Ready (Welcome) State
  return (
    <div className="h-full w-full flex flex-col items-center justify-center bg-muted/5 p-8 text-center animate-in fade-in zoom-in-95 duration-300">
      <div className="bg-background p-6 rounded-full shadow-sm border mb-6">
        <Database className="h-10 w-10 text-primary/80" />
      </div>
      
      <h3 className="text-2xl font-semibold tracking-tight mb-2">
        Welcome to ClickHouse Console
      </h3>
      
      <p className="text-muted-foreground max-w-md mb-8 text-sm leading-relaxed">
        Select a table from the sidebar to view its details, 
        or start by running a new SQL query.
      </p>
      
      <Button 
        onClick={() => TabManager.activateQueryTab()} 
        className="gap-2 shadow-sm"
      >
        <Plus className="h-4 w-4" />
        Open New Query
      </Button>
    </div>
  );
}

