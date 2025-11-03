import { Button } from "@/components/ui/button";
import { DialogClose, DialogFooter } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog } from "@/components/use-dialog";
import type { ApiCanceller, ApiErrorResponse } from "@/lib/api";
import { Api } from "@/lib/api";
import type { Connection } from "@/lib/connection/Connection";
import { ensureConnectionRuntimeInitialized } from "@/lib/connection/Connection";
import { useConnection } from "@/lib/connection/ConnectionContext";
import { ConnectionManager } from "@/lib/connection/ConnectionManager";
import { toastManager } from "@/lib/toast";
import axios from "axios";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import React, { useCallback, useEffect, useState } from "react";

export interface ConnectionEditDialogProps {
  connection: Connection | null;
  onClose: () => void;
}

export interface ShowConnectionEditDialogOptions {
  connection: Connection | null;
  onSave?: (connection: Connection) => void;
  onDelete?: () => void;
  onCancel?: () => void;
}

// Wrapper component that includes form and buttons with shared state
function ConnectionEditDialogWrapper({
  connection,
  onSave,
  onDelete,
  onCancel,
  isAddMode,
}: {
  connection: Connection | null;
  onSave?: (connection: Connection) => void;
  onDelete?: () => void;
  onCancel?: () => void;
  isAddMode: boolean;
}) {
  const [isTesting, setIsTesting] = useState(false);
  const { setSelectedConnection } = useConnection();

  const hasProvider = import.meta.env.VITE_CONSOLE_CONNECTION_PROVIDER_ENABLED === "true";

  // View Model
  const [name, setName] = useState(connection ? connection.name : "");
  const [cluster, setCluster] = useState(connection ? connection.cluster : "");
  const [url, setUrl] = useState(connection ? connection.url : "");
  const [user, setUser] = useState(connection ? connection.user : "");
  const [password, setPassword] = useState(connection ? connection.password : "");
  const [editable, setEditable] = useState(connection ? connection.editable : true);
  const [currentSelectedConnection, setCurrentSelectedConnection] = useState<Connection | null>(connection);

  const [apiCanceller, setApiCanceller] = useState<ApiCanceller>();
  const [connectionTemplates, setConnectionTemplates] = useState<Connection[]>(
    isAddMode ? [] : ConnectionManager.getInstance().getConnections()
  );

  // UI state
  const [isShowPassword, setShowPassword] = useState(false);
  const [isLoadingTemplates, setLoadingTemplates] = useState(false);
  const [loadingTemplateError, setLoadingTemplateError] = useState<ApiErrorResponse | undefined>();

  useEffect(() => {
    if (!isAddMode || !hasProvider) return;

    setLoadingTemplates(true);

    const templateUrl =
      import.meta.env.MODE === "development"
        ? import.meta.env.VITE_CONSOLE_CONNECTION_PROVIDER_ENDPOINT_DEV
        : import.meta.env.VITE_CONSOLE_CONNECTION_PROVIDER_ENDPOINT_PRD;

    const apiController = new AbortController();
    axios
      .get(templateUrl as string, {
        signal: apiController.signal,
      })
      .then((response) => {
        interface ConnectionTemplate {
          url: string;
          name: string;
          label?: string;
          isCluster?: boolean;
        }
        const connectionTemplates = response.data as ConnectionTemplate[];

        const newConnections: Connection[] = connectionTemplates.map((conn) => {
          return {
            url: conn.url,
            name: conn.label === undefined ? conn.name : conn.label,
            user: "",
            password: "",
            cluster: conn.isCluster ? conn.name : "",
            editable: false,
          };
        });

        setConnectionTemplates(newConnections);
        setLoadingTemplateError(undefined);
      })
      .catch((error) => {
        setLoadingTemplateError({
          errorMessage: "Failed to loading templates: " + error.message,
          httpHeaders: error.response?.headers,
          httpStatus: error.response?.status,
          data: error.response?.data,
        });
      })
      .finally(() => {
        setLoadingTemplates(false);
      });

    return () => {
      apiController.abort();
    };
  }, [hasProvider, isAddMode]);

  const showMessage = (message: string | React.ReactNode) => toastManager.show(message, "success");
  const showErrorMessage = (message: string | React.ReactNode) => toastManager.show(message, "error");

  const getEditingConnection = useCallback((): Connection | undefined => {
    if (name.trim().length === 0) {
      showErrorMessage("Name can't be empty.");
      return;
    }

    let cURL;
    try {
      cURL = new URL(url.trim());
    } catch {
      showErrorMessage("URL is invalid.");
      return;
    }
    if (cURL.protocol !== "http:" && cURL.protocol !== "https:") {
      showErrorMessage("URL must start with http:// or https://");
      return;
    }
    if (cURL.pathname === "") {
      cURL.pathname = "/";
    }

    const userText = user.trim();
    if (userText.length === 0) {
      showErrorMessage("User can't be empty.");
      return;
    }

    const newConnection: Connection = {
      name: name,
      url: cURL.href,
      user: userText,
      password: password,
      cluster: cluster.trim(),
      editable: editable,
    };

    console.log(`Connection: [${newConnection.url}]`);

    return newConnection;
  }, [name, cluster, url, user, password, editable]);

  // Save handler
  const stableHandleSave = useCallback(async (): Promise<boolean> => {
    const editingConnection = getEditingConnection();
    if (editingConnection == null) {
      return false; // Keep dialog open
    }

    const manager = ConnectionManager.getInstance();

    if (isAddMode) {
      // For a new connection, the name must not be in the saved connection
      if (manager.contains(editingConnection.name)) {
        showErrorMessage(
          `There's already a connection with the name [${editingConnection.name}]. Please change the connection name to continue.`
        );
        return false; // Keep dialog open
      }

      manager.add(editingConnection);
    } else {
      // edit mode
      // If name changed, the name must not be in the saved connection
      if (editingConnection.name !== currentSelectedConnection?.name) {
        if (manager.contains(editingConnection.name)) {
          showErrorMessage(
            `There's already a connection with the name [${editingConnection.name}]. Please change the connection name to continue.`
          );
          return false; // Keep dialog open
        }
      }

      manager.replace(currentSelectedConnection!.name, editingConnection);
    }

    // Get the saved connection from manager to ensure consistency
    const savedConnection = manager.getConnections().find((conn) => conn.name === editingConnection.name);
    if (!savedConnection) {
      showErrorMessage("Failed to retrieve saved connection from ConnectionManager.");
      return false; // Keep dialog open
    }

    // Update the selected connection to the newly saved/edited connection
    // This will also initialize the connection runtime and save it as the last selected
    setSelectedConnection(savedConnection);
    if (onSave) {
      onSave(savedConnection);
    }
    return true; // Close dialog
  }, [getEditingConnection, currentSelectedConnection, isAddMode, onSave, setSelectedConnection]);

  useEffect(() => {
    return () => {
      // cancel any inflight request on unmount
      apiCanceller?.cancel();
    };
  }, [apiCanceller]);

  const renderConnectionSelector = () => {
    if (!hasProvider) return null;

    return (
      <div className="space-y-2">
        <Label>{isAddMode ? "Templates(Optional)" : "Connections"}</Label>
        {isLoadingTemplates && <div>Loading...</div>}
        {!isLoadingTemplates && loadingTemplateError !== undefined && (
          <div className="text-sm text-destructive">{loadingTemplateError.errorMessage}</div>
        )}
        {!isLoadingTemplates && loadingTemplateError === undefined && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="w-full justify-start">
                {currentSelectedConnection ? currentSelectedConnection.name : "Select a template..."}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-full">
              <DropdownMenuLabel>Templates</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {connectionTemplates.map((conn) => (
                <DropdownMenuItem
                  key={conn.name}
                  onClick={() => {
                    setCurrentSelectedConnection(conn);
                    setCluster(conn.cluster);
                    setEditable(conn.editable);
                    setName(conn.name);
                    setUrl(conn.url);
                    setUser(conn.user);
                    setPassword(conn.password);
                  }}
                >
                  {conn.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    );
  };

  // Test handler that manages testing state
  const handleTestConnection = useCallback(async () => {
    const testConnection = getEditingConnection();
    if (testConnection == null) {
      console.log("Test connection: getEditingConnection returned null");
      return;
    }

    // Set testing state to true
    setIsTesting(true);

    console.log("Test connection: Starting test for", testConnection);

    // Helper function to show message with delay and stop testing
    const showMessageWithDelay = (messageFn: () => void) => {
      setTimeout(() => {
        setIsTesting(false);
        messageFn();
      }, 300); // 500ms delay for smooth UI
    };

    try {
      const initializedConnection = ensureConnectionRuntimeInitialized(testConnection);
      if (!initializedConnection || !initializedConnection.runtime) {
        console.error("Test connection: Failed to initialize connection runtime", initializedConnection);
        showMessageWithDelay(() => {
          showErrorMessage("Failed to initialize connection. Please check your URL format.");
        });
        return;
      }

      console.log("Test connection: Connection initialized, runtime:", initializedConnection.runtime);
      const api = Api.create(initializedConnection);
      console.log("Test connection: API created, executing SQL...");

      // Create abort controller for cancellation
      const abortController = new AbortController();
      setApiCanceller({
        cancel: () => abortController.abort(),
      });

      try {
        const response = await api.executeAsync({ sql: "SELECT 525" }, abortController.signal);
        console.log("Test connection: Response received", response);

        if (testConnection.cluster.length === 0) {
          setApiCanceller(undefined);
          if (response.httpHeaders["x-clickhouse-format"] == null) {
            showMessageWithDelay(() => {
              showErrorMessage(
                "Successfully connected. But the response from ClickHouse server might not be configured correctly that this console does not support all features. Maybe there is a CORS problem at the server side."
              );
            });
          } else {
            showMessageWithDelay(() => {
              showMessage("Successfully connected.");
            });
          }
          return;
        }

        // For CLUSTER MODE, continue to check if the cluster exists
        try {
          const clusterResponse = await api.executeAsync(
            {
              sql: `SELECT 1 FROM system.clusters WHERE cluster = '${testConnection.cluster}' Format JSONCompact`,
            },
            abortController.signal
          );

          setApiCanceller(undefined);
          if (clusterResponse.data.data.length === 0) {
            showMessageWithDelay(() => {
              showErrorMessage(`Cluster [${testConnection.cluster}] is not found on given ClickHouse server.`);
            });
          } else {
            showMessageWithDelay(() => {
              showMessage("Successfully connected to specified cluster.");
            });
          }
        } catch (clusterError: unknown) {
          const error = clusterError as ApiErrorResponse;
          setApiCanceller(undefined);
          showMessageWithDelay(() => {
            showErrorMessage(
              `Successfully connected to ClickHouse server. But unable to determine if the cluster [${testConnection.name}] exists on the server. You can still save the connection to continue. ${
                error.httpStatus !== 404 ? error.errorMessage : ""
              }`
            );
          });
        }
      } catch (error: unknown) {
        console.error("Test connection: Error received", error);
        setApiCanceller(undefined);

        const apiError = error as ApiErrorResponse;

        // Authentication fails
        if (
          apiError.httpStatus === 403 &&
          apiError.httpHeaders &&
          apiError.httpHeaders["x-clickhouse-exception-code"] === "516"
        ) {
          showMessageWithDelay(() => {
            showErrorMessage("User name or password is wrong.");
          });
          return;
        }

        // try to detect if the error object has 'message' field and then use it if it has
        const detailMessage =
          typeof apiError?.data == "object"
            ? apiError.data?.message
              ? apiError.data.message
              : JSON.stringify(apiError.data, null, 2)
            : apiError?.data;

        showMessageWithDelay(() => {
          showErrorMessage(`${apiError.errorMessage}${detailMessage ? `\n${detailMessage}` : ""}`);
        });
      }
    } catch (e: unknown) {
      console.error("Test connection: Exception caught", e);
      const errorMessage = e instanceof Error ? e.message : "Unknown error";
      showMessageWithDelay(() => {
        showErrorMessage(`Internal Error\n${errorMessage}`);
      });
    }
  }, [getEditingConnection, setApiCanceller]);

  // Wrapped save handler - needs to prevent DialogClose if validation fails
  const handleSave = useCallback(
    async (e: React.MouseEvent) => {
      const shouldClose = await stableHandleSave();
      if (!shouldClose) {
        // Prevent dialog from closing if validation fails
        e.preventDefault();
        e.stopPropagation();
      }
      // If shouldClose is true, DialogClose will handle closing
    },
    [stableHandleSave]
  );

  const handleCancel = useCallback(() => {
    if (onCancel) {
      onCancel();
    }
    // DialogClose will handle closing
  }, [onCancel]);

  const handleDelete = useCallback(() => {
    Dialog.confirm({
      title: "Confirm deletion",
      mainContent: "Are you sure you want to delete this connection? This action cannot be undone.",
      dialogButtons: [
        {
          text: "Delete",
          default: true,
          onClick: async () => {
            if (connection) {
              ConnectionManager.getInstance().remove(connection.name.trim());
              if (onDelete) {
                onDelete();
              }
            }
            return true;
          },
        },
        {
          text: "Cancel",
          default: false,
          onClick: async () => true,
        },
      ],
    });
  }, [connection, onDelete]);

  return (
    <>
      <div className="space-y-2">
        {renderConnectionSelector()}

        <div className="space-y-2">
          <Label htmlFor="name">Connection Name (Required)</Label>
          <Input
            id="name"
            autoFocus
            placeholder="(Required) Name of the connection. Must be unique."
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="cluster" className={!editable ? "text-muted-foreground" : ""}>
            Cluster (Optional)
          </Label>
          <Input
            id="cluster"
            placeholder="The cluster name in the ClickHouse server"
            value={cluster}
            disabled={!editable}
            onChange={(e) => setCluster(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="url">URL (Required)</Label>
          <Input id="url" placeholder="http(s)://" value={url} onChange={(e) => setUrl(e.target.value)} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="user">User (Required)</Label>
          <Input id="user" placeholder="user name" value={user} onChange={(e) => setUser(e.target.value)} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Input
              id="password"
              placeholder="password"
              type={isShowPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pr-10"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
              onClick={() => setShowPassword((prev) => !prev)}
            >
              {isShowPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>
      <DialogFooter className="mt-4">
        <Button variant="outline" onClick={handleTestConnection} disabled={isTesting}>
          {isTesting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Test Connection
            </>
          ) : (
            "Test Connection"
          )}
        </Button>
        {!isAddMode && onDelete && (
          <Button variant="destructive" onClick={handleDelete}>
            Delete
          </Button>
        )}
        <DialogClose asChild>
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
        </DialogClose>
        <DialogClose asChild>
          <Button onClick={(e: React.MouseEvent<HTMLButtonElement>) => handleSave(e)}>Save</Button>
        </DialogClose>
      </DialogFooter>
    </>
  );
}

export function showConnectionEditDialog(options: ShowConnectionEditDialogOptions) {
  const { connection, onSave, onDelete, onCancel } = options;
  const isAddMode = connection == null;

  const mainContent = (
    <ConnectionEditDialogWrapper
      connection={connection}
      onSave={onSave}
      onDelete={onDelete}
      onCancel={onCancel}
      isAddMode={isAddMode}
    />
  );

  Dialog.showDialog({
    title: isAddMode ? "Create a new connection" : "Modify existing connection",
    className: "max-w-lg",
    description: "Configure your ClickHouse connection settings.",
    mainContent: mainContent,
    dialogButtons: [], // Buttons are now in mainContent
    onCancel: onCancel,
    disableBackdrop: true,
  });
}
