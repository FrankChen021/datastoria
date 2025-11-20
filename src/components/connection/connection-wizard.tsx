import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { Connection } from "@/lib/connection/Connection";
import { useConnection } from "@/lib/connection/ConnectionContext";
import { Database } from "lucide-react";
import { showConnectionEditDialog } from "./connection-edit-dialog";

export function ConnectionWizard() {
    const { setSelectedConnection } = useConnection();

    const handleCreateConnection = () => {
        showConnectionEditDialog({
            connection: null,
            onSave: (savedConnection: Connection) => {
                // Set the newly created connection as the selected one
                // This will update hasAnyConnections and trigger MainPage to show the main interface
                setSelectedConnection(savedConnection);
            },
        });
    };

    return (
        <div className="fixed inset-0 bg-background flex items-center justify-center p-8">
            <Card className="w-full max-w-2xl">
                <CardHeader className="text-center space-y-4">
                    <div className="flex justify-center">
                        <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                            <Database className="h-8 w-8 text-primary" />
                        </div>
                    </div>
                    <CardTitle className="text-3xl">Welcome to ClickHouse Console</CardTitle>
                    <CardDescription className="text-base">
                        Get started by creating your first connection to a ClickHouse server.
                        You'll be able to query databases, explore schemas, and monitor server performance.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="space-y-4">
                        <div className="grid gap-3 text-sm text-muted-foreground">
                            <div className="flex items-start gap-3">
                                <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                                    <span className="text-xs font-semibold text-primary">1</span>
                                </div>
                                <div>
                                    <p className="font-medium text-foreground">Configure Connection</p>
                                    <p>Enter your ClickHouse server URL, credentials, and optional cluster name</p>
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
                        </div>
                    </div>
                    <div className="flex justify-center pt-4">
                        <Button size="lg" onClick={handleCreateConnection} className="px-8">
                            Create Your First Connection
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
