import { AppLogo } from "@/components/app-logo";
import { useConnection } from "@/components/connection/connection-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ConnectionConfig } from "@/lib/connection/connection-config";
import { ConnectionManager } from "@/lib/connection/connection-manager";
import { X } from "lucide-react";
import Link from "next/link";
import { useCallback, useState } from "react";
import { ConnectionEditComponent } from "./connection-edit-component";

export function ConnectionWizard() {
  const { switchConnection } = useConnection();
  const [isCreatingConnection, setIsCreatingConnection] = useState(false);

  const handleCreateConnection = useCallback(() => {
    setIsCreatingConnection(true);
  }, []);

  const handleSave = useCallback(
    (savedConnection: ConnectionConfig) => {
      // Set the newly created connection as the selected one
      // This will update hasAnyConnections and trigger MainPage to show the main interface
      switchConnection(savedConnection);
      setIsCreatingConnection(false);
    },
    [switchConnection]
  );

  const handleCancel = useCallback(() => {
    setIsCreatingConnection(false);
  }, []);

  {
    /* pt/pb use max(1rem, env(safe-area-inset-*)): at least 1rem padding, or the device safe-area inset when larger (e.g. iPhone notch and home indicator), so the wizard stays centered and clear of system UI. */
  }
  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm overflow-y-auto overflow-x-hidden flex flex-col items-center justify-center min-h-[100dvh] pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] px-4 sm:px-8">
      <div className="w-full max-w-2xl flex flex-col my-auto">
        {!isCreatingConnection ? (
          <Card className="w-full">
            <CardHeader className="text-center space-y-1 pb-4">
              <div className="flex justify-center items-center">
                <AppLogo width={64} height={64} />
                <CardTitle>DataStoria</CardTitle>
              </div>
              <CardDescription className="text-base">
                AI-powered ClickHouse management console with visualization and insights
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 px-4 sm:px-6">
              <div className="space-y-4">
                <div className="grid gap-3 text-sm text-muted-foreground">
                  <div className="flex items-start gap-3">
                    <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-xs font-semibold text-primary">1</span>
                    </div>
                    <div>
                      <p className="font-medium text-foreground">Configure Connection</p>
                      <p>
                        Enter your ClickHouse server URL, credentials, and optional cluster name
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-xs font-semibold text-primary">2</span>
                    </div>
                    <div>
                      <p className="font-medium text-foreground">Test Connection</p>
                      <p>Verify that the console can connect to your server</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-xs font-semibold text-primary">3</span>
                    </div>
                    <div>
                      <p className="font-medium text-foreground">Start Exploring</p>
                      <p>Query your data, browse schemas, and monitor your ClickHouse cluster</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-xs font-semibold text-primary">4</span>
                    </div>
                    <div>
                      <p className="font-medium text-foreground">Ask AI</p>
                      <p>
                        Ask AI questions about your cluster data in natural language and get instant
                        answers, visualizations, and more
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex flex-col items-center justify-center gap-2 pt-2">
                <Button
                  size="lg"
                  onClick={handleCreateConnection}
                  className="w-full min-w-0 max-w-64 px-4"
                >
                  Create Your First Connection
                </Button>
                <div className="flex flex-col items-center gap-2 w-full">
                  <span className="text-sm text-muted-foreground text-center">
                    don't have a ClickHouse server? Try{" "}
                    <Link href="https://play.clickhouse.com" target="_blank">
                      ClickHouse Playground
                    </Link>
                  </span>
                  <Button
                    variant="outline"
                    size="lg"
                    className="w-full min-w-0 max-w-64"
                    onClick={() => {
                      const playgroundConnection: ConnectionConfig = {
                        name: "ClickHouse Playground",
                        url: "https://play.clickhouse.com",
                        user: "play",
                        password: "",
                        cluster: "",
                        editable: true,
                      };
                      // Save to ConnectionManager
                      const connectionManager = ConnectionManager.getInstance();
                      if (!connectionManager.contains(playgroundConnection.name)) {
                        connectionManager.add(playgroundConnection);
                      }
                      handleSave(playgroundConnection);
                    }}
                  >
                    Connect to play.clickhouse.com
                  </Button>
                </div>
              </div>
            </CardContent>
            {/* Spacer to match the height of ConnectionEditDialogContent's bottom section */}
          </Card>
        ) : (
          <Card className="w-full relative flex flex-col max-h-[calc(100dvh-2rem)] min-h-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleCancel}
              className="absolute top-2 right-2 h-8 w-8 z-10"
            >
              <X className="h-4 w-4" />
            </Button>
            <CardHeader className="flex-shrink-0 px-4 pb-2 pt-6 sm:px-6 sm:pb-4">
              <CardTitle>Create a new connection</CardTitle>
              <CardDescription>Configure your ClickHouse connection settings.</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 min-h-0 overflow-y-auto pt-4 px-4 sm:px-6 sm:pt-0">
              <ConnectionEditComponent
                connection={null}
                onSave={handleSave}
                onCancel={handleCancel}
                isAddMode={true}
              />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
