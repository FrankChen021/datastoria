import { Dialog } from "@/components/shared/use-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { FieldDescription } from "@/components/ui/field-description";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useIsMobile } from "@/hooks/use-mobile";
import { Connection, QueryError } from "@/lib/connection/connection";
import type { ConnectionConfig } from "@/lib/connection/connection-config";
import { ConnectionManager } from "@/lib/connection/connection-manager";
import { cn } from "@/lib/utils";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import axios from "axios";
import { AlertCircle, CheckCircle2, Eye, EyeOff, Loader2 } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from "react";

// Type for test status
type TestStatus = { type: "success" | "error"; message: string } | null;

// Exported component for inline use (e.g., in ConnectionWizard)
export function StatusPopover({
  children,
  className,
  icon,
  title,
  trigger,
  open,
  onOpenChange,
  ...props
}: ComponentPropsWithoutRef<typeof PopoverContent> & {
  icon: ReactNode;
  title: string;
  trigger: ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className={cn("p-0 overflow-hidden z-[10000]", className)} {...props}>
        <PopoverPrimitive.Arrow className={cn("fill-[var(--border)]")} width={12} height={8} />
        <div className="flex items-start gap-2 px-3 py-3">
          {icon}
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm mb-1">{title}</div>
            {children}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function ConnectionEditComponent({
  connection,
  onSave,
  onDelete,
  onCancel,
  isAddMode,
}: {
  connection: ConnectionConfig | null;
  onSave?: (connection: ConnectionConfig) => void;
  onDelete?: () => void;
  onCancel?: () => void;
  isAddMode: boolean;
}) {
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const isMobile = useIsMobile();

  const hasProvider = process.env.NEXT_PUBLIC_CONSOLE_CONNECTION_PROVIDER_ENABLED === "true";

  // View Model
  const [name, setName] = useState(connection ? connection.name : "");
  const [cluster, setCluster] = useState(connection ? connection.cluster : "");
  const [url, setUrl] = useState(connection ? connection.url : "");
  const [user, setUser] = useState(connection ? connection.user : "");
  const [password, setPassword] = useState(connection ? connection.password : "");
  const [editable, setEditable] = useState(connection ? connection.editable : true);
  const [currentSelectedConnection, setCurrentSelectedConnection] =
    useState<ConnectionConfig | null>(connection);

  // Initialize isNameManuallyEdited: true if editing existing connection, false for new connection
  useEffect(() => {
    if (connection) {
      setIsNameManuallyEdited(true); // Existing connection name is pre-set
    } else {
      setIsNameManuallyEdited(false); // New connection, allow auto-fill
    }
  }, [connection]);

  const [apiCanceller, setAbort] = useState<AbortController>();
  const apiCancellerRef = useRef<AbortController | undefined>(undefined);
  const [connectionTemplates, setConnectionTemplates] = useState<ConnectionConfig[]>(
    isAddMode ? [] : ConnectionManager.getInstance().getConnections()
  );

  // UI state
  const [isShowPassword, setShowPassword] = useState(false);
  const [isLoadingTemplates, setLoadingTemplates] = useState(false);
  const [loadingTemplateError, setLoadingTemplateError] = useState<QueryError | undefined>();
  const [testStatus, setTestStatus] = useState<TestStatus>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Error and message state
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isNameManuallyEdited, setIsNameManuallyEdited] = useState(false);

  useEffect(() => {
    if (!isAddMode || !hasProvider) return;

    setLoadingTemplates(true);

    const templateUrl =
      process.env.NODE_ENV === "development"
        ? process.env.NEXT_PUBLIC_CONSOLE_CONNECTION_PROVIDER_ENDPOINT_DEV
        : process.env.NEXT_PUBLIC_CONSOLE_CONNECTION_PROVIDER_ENDPOINT_PRD;

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

        const newConnections: ConnectionConfig[] = connectionTemplates.map((conn) => {
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
        setLoadingTemplateError(
          new QueryError(
            "Failed to loading templates: " + error.message,
            error.response?.status,
            error.response?.headers,
            error.response?.data
          )
        );
      })
      .finally(() => {
        setLoadingTemplates(false);
      });

    return () => {
      apiController.abort();
    };
  }, [hasProvider, isAddMode]);

  const clearFieldErrors = useCallback(() => {
    setFieldErrors({});
  }, []);

  const setFieldError = useCallback((field: string, error: string) => {
    setFieldErrors((prev) => ({ ...prev, [field]: error }));
  }, []);

  const getEditingConnection = useCallback((): ConnectionConfig | undefined => {
    clearFieldErrors();

    let hasError = false;

    if (name.trim().length === 0) {
      setFieldError("name", "Name can't be empty.");
      hasError = true;
    }

    let cURL;
    try {
      cURL = new URL(url.trim());
    } catch {
      setFieldError("url", "URL is invalid.");
      hasError = true;
    }
    if (cURL && cURL.protocol !== "http:" && cURL.protocol !== "https:") {
      setFieldError("url", "URL must start with http:// or https://");
      hasError = true;
    }
    if (cURL && cURL.pathname === "") {
      cURL.pathname = "/";
    }

    const userText = user.trim();
    if (userText.length === 0) {
      setFieldError("user", "User can't be empty.");
      hasError = true;
    }

    if (hasError) {
      return;
    }

    const newConnection: ConnectionConfig = {
      name: name,
      url: cURL!.href,
      user: userText,
      password: password,
      cluster: cluster.trim(),
      editable: editable,
    };

    return newConnection;
  }, [name, cluster, url, user, password, editable, clearFieldErrors, setFieldError]);

  // Save handler
  const stableHandleSave = useCallback(async (): Promise<boolean> => {
    const editingConnection = getEditingConnection();
    if (editingConnection == null) {
      return false; // Keep dialog open
    }

    clearFieldErrors();

    const manager = ConnectionManager.getInstance();

    if (isAddMode) {
      // For a new connection, the name must not be in the saved connection
      if (manager.contains(editingConnection.name)) {
        setFieldError(
          "name",
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
          setFieldError(
            "name",
            `There's already a connection with the name [${editingConnection.name}]. Please change the connection name to continue.`
          );
          return false; // Keep dialog open
        }
      }

      manager.replace(currentSelectedConnection!.name, editingConnection);
    }

    // Get the saved connection from manager to ensure consistency
    const savedConnection = manager
      .getConnections()
      .find((conn) => conn.name === editingConnection.name);
    if (!savedConnection) {
      // This shouldn't happen, but handle gracefully
      console.error("Failed to retrieve saved connection from ConnectionManager.");
      return false; // Keep dialog open
    }

    // Call onSave with the saved connection
    // The caller (e.g., wizard) will handle setting it as the selected connection
    if (onSave) {
      onSave(savedConnection);
    }
    return true; // Close dialog
  }, [
    getEditingConnection,
    currentSelectedConnection,
    isAddMode,
    onSave,
    clearFieldErrors,
    setFieldError,
  ]);

  useEffect(() => {
    if (apiCanceller) {
      apiCancellerRef.current = apiCanceller;
    }
  }, [apiCanceller]);

  useEffect(() => {
    return () => {
      // cancel any inflight request on unmount
      apiCancellerRef.current?.abort();
    };
  }, []);

  // Helper function to get auto-generated name from URL
  const getAutoGeneratedName = useCallback((urlValue: string): string => {
    try {
      const urlObj = new URL(urlValue.trim());
      return urlObj.hostname;
    } catch {
      return "";
    }
  }, []);

  // Memoize template selection handler
  const handleTemplateSelect = useCallback((conn: ConnectionConfig) => {
    setCurrentSelectedConnection(conn);
    setCluster(conn.cluster);
    setEditable(conn.editable);
    setName(conn.name);
    setUrl(conn.url);
    setUser(conn.user);
    setPassword(conn.password);
    setIsNameManuallyEdited(true); // Template names are pre-set, so mark as manually edited
  }, []);

  // Memoize input onChange handlers to prevent unnecessary re-renders
  const handleUrlChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newUrl = e.target.value;
      setUrl(newUrl);
      if (fieldErrors.url) {
        setFieldError("url", "");
      }

      // Auto-fill name from URL hostname if:
      // 1. Name hasn't been manually edited, OR
      // 2. Name is empty, OR
      // 3. Name matches the previous auto-generated value
      const previousAutoName = getAutoGeneratedName(url);
      if (!isNameManuallyEdited || name.trim() === "" || name === previousAutoName) {
        try {
          const urlObj = new URL(newUrl.trim());
          const hostname = urlObj.hostname;
          // Use hostname as connection name
          const autoName = hostname;
          setName(autoName);
          setIsNameManuallyEdited(false); // Reset flag since we're auto-filling
        } catch {
          // Invalid URL, don't update name
        }
      }
    },
    [fieldErrors.url, setFieldError, isNameManuallyEdited, name, url, getAutoGeneratedName]
  );

  const handleUserChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setUser(e.target.value);
      if (fieldErrors.user) {
        setFieldError("user", "");
      }
    },
    [fieldErrors.user, setFieldError]
  );

  const handlePasswordChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value),
    []
  );

  const handleClusterChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => setCluster(e.target.value),
    []
  );

  const handleNameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setName(e.target.value);
      setIsNameManuallyEdited(true); // Mark as manually edited
      if (fieldErrors.name) {
        setFieldError("name", "");
      }
    },
    [fieldErrors.name, setFieldError]
  );

  // Memoize connection selector to prevent unnecessary re-renders
  const renderConnectionSelector = useMemo(() => {
    if (!hasProvider) return null;

    return (
      <div className="space-y-2">
        <FieldLabel>{isAddMode ? "Templates(Optional)" : "Connections"}</FieldLabel>
        {isLoadingTemplates && <div>Loading...</div>}
        {!isLoadingTemplates && loadingTemplateError !== undefined && (
          <div className="text-sm text-destructive">{loadingTemplateError.message}</div>
        )}
        {!isLoadingTemplates && loadingTemplateError === undefined && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className="w-full justify-start"
                disabled={showDeleteConfirm}
              >
                {currentSelectedConnection
                  ? currentSelectedConnection.name
                  : "Select a template..."}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-full">
              <DropdownMenuLabel>Templates</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {connectionTemplates.map((conn) => (
                <DropdownMenuItem key={conn.name} onClick={() => handleTemplateSelect(conn)}>
                  {conn.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    );
  }, [
    hasProvider,
    isAddMode,
    isLoadingTemplates,
    loadingTemplateError,
    currentSelectedConnection,
    connectionTemplates,
    handleTemplateSelect,
    showDeleteConfirm,
  ]);

  // Test handler that manages testing state
  const handleTestConnection = useCallback(async () => {
    const testConnectionConfig = getEditingConnection();
    if (testConnectionConfig == null) {
      return;
    }

    // Clear previous test status
    setTestStatus(null);

    // Set testing state to true
    setIsTesting(true);

    // Helper function to set test result with delay
    const setTestResultWithDelay = (result: { type: "success" | "error"; message: string }) => {
      setTimeout(() => {
        setIsTesting(false);
        setTestStatus(result);
      }, 300); // 300ms delay for smooth UI transition
    };

    try {
      const connection = Connection.create(testConnectionConfig);

      try {
        const { response, abortController } = connection.query("SELECT 1");

        // Set the canceller immediately after getting the abort controller
        setAbort(abortController);

        const apiResponse = await response;

        if (testConnectionConfig.cluster.length === 0) {
          setAbort(undefined);
          if (apiResponse.httpHeaders["x-clickhouse-format"] == null) {
            setTestResultWithDelay({
              type: "error",
              message:
                "Successfully connected. But the response from ClickHouse server might not be configured correctly that this console does not support all features. Maybe there is a CORS problem at the server side.",
            });
          } else {
            setTestResultWithDelay({
              type: "success",
              message: "Successfully connected.",
            });
          }
          return;
        }

        // For CLUSTER MODE, continue to check if the cluster exists
        try {
          const { response: clusterResponse, abortController: clusterAbortController } =
            connection.query(
              `SELECT 1 FROM system.clusters WHERE cluster = '${testConnectionConfig.cluster}' Format JSONCompact`
            );

          // Update the canceller for the cluster check
          setAbort(clusterAbortController);

          const clusterApiResponse = await clusterResponse;

          setAbort(undefined);
          if (clusterApiResponse.data.json().length === 0) {
            setTestResultWithDelay({
              type: "error",
              message: `Cluster [${testConnectionConfig.cluster}] is not found on given ClickHouse server.`,
            });
          } else {
            setTestResultWithDelay({
              type: "success",
              message: "Successfully connected to specified cluster.",
            });
          }
        } catch (clusterError: unknown) {
          console.error(clusterError);
          const error = clusterError as QueryError;
          setAbort(undefined);
          setTestResultWithDelay({
            type: "error",
            message: `Successfully connected to ClickHouse server. But unable to determine if the cluster [${testConnectionConfig.cluster}] exists on the server. You can still save the connection to continue. ${
              error.httpStatus !== 404 ? error.message : ""
            }`,
          });
        }
      } catch (error: unknown) {
        setAbort(undefined);

        const apiError = error as QueryError;

        // Authentication fails
        if (
          apiError.httpStatus === 403 &&
          apiError.httpHeaders &&
          apiError.httpHeaders["x-clickhouse-exception-code"] === "516"
        ) {
          setTestResultWithDelay({
            type: "error",
            message: "User name or password is wrong.",
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

        setTestResultWithDelay({
          type: "error",
          message: `${apiError.message}${detailMessage ? `\n${detailMessage}` : ""}`,
        });
      }
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : "Unknown error";
      setTestResultWithDelay({
        type: "error",
        message: `Internal Error\n${errorMessage}`,
      });
    }
  }, [getEditingConnection, setAbort]);

  // Save handler
  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      await stableHandleSave();
      // stableHandleSave already handles calling onSave and closing
    } finally {
      setIsSaving(false);
    }
  }, [stableHandleSave]);

  const handleCancel = useCallback(() => {
    if (onCancel) {
      onCancel();
    }
  }, [onCancel]);

  const handleClose = useCallback(() => {
    handleCancel();
  }, [handleCancel]);

  const handleDeleteClick = useCallback(() => {
    setShowDeleteConfirm(true);
  }, []);

  const handleDeleteConfirm = useCallback(() => {
    if (connection) {
      ConnectionManager.getInstance().remove(connection.name.trim());
      setShowDeleteConfirm(false);
      if (onDelete) {
        onDelete();
      }
    }
  }, [connection, onDelete]);

  const handleDeleteCancel = useCallback(() => {
    setShowDeleteConfirm(false);
  }, []);

  // Handle ESC key to close
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        handleClose();
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, [handleClose]);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        handleSave();
      }}
    >
      <FieldGroup className="space-y-4 sm:space-y-2">
        {hasProvider && <Field>{renderConnectionSelector}</Field>}

        <Field className="grid grid-cols-1 gap-y-0.5 sm:grid-cols-[128px_1fr] sm:gap-x-2 sm:gap-y-0 sm:items-center">
          <FieldLabel htmlFor="url" className="text-left sm:text-right">
            URL
          </FieldLabel>
          <Input
            id="url"
            autoFocus
            placeholder="http(s)://"
            value={url}
            onChange={handleUrlChange}
            className={cn("min-h-11 w-full min-w-0", fieldErrors.url && "border-destructive")}
          />
          <div className="hidden sm:block" />
          {fieldErrors.url ? (
            <FieldDescription className="text-destructive text-xs sm:col-start-2">
              {fieldErrors.url}
            </FieldDescription>
          ) : (
            <FieldDescription className="text-xs sm:col-start-2">
              Server HTTP(s) URL
            </FieldDescription>
          )}
        </Field>

        <Field className="grid grid-cols-1 gap-y-0.5 sm:grid-cols-[128px_1fr] sm:gap-x-2 sm:gap-y-0 sm:items-center">
          <FieldLabel htmlFor="user" className="text-left sm:text-right">
            User
          </FieldLabel>
          <Input
            id="user"
            value={user}
            onChange={handleUserChange}
            className={cn("min-h-11 w-full min-w-0", fieldErrors.user && "border-destructive")}
          />
          <div className="hidden sm:block" />
          {fieldErrors.user ? (
            <FieldDescription className="text-destructive text-xs sm:col-start-2">
              {fieldErrors.user}
            </FieldDescription>
          ) : (
            <FieldDescription className="text-xs sm:col-start-2">Server user name</FieldDescription>
          )}
        </Field>

        <Field className="grid grid-cols-1 gap-y-0.5 sm:grid-cols-[128px_1fr] sm:gap-x-2 sm:gap-y-0 sm:items-center">
          <FieldLabel htmlFor="password" className="text-left sm:text-right">
            Password
          </FieldLabel>
          <div className="relative w-full min-w-0">
            <Input
              id="password"
              type={isShowPassword ? "text" : "password"}
              value={password}
              onChange={handlePasswordChange}
              className="min-h-11 w-full pr-10"
              autoComplete="current-password"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent min-h-11"
              onClick={() => setShowPassword((prev) => !prev)}
              disabled={showDeleteConfirm}
            >
              {isShowPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
          <div className="hidden sm:block" />
          <FieldDescription className="text-xs sm:col-start-2">
            Optional. Leave blank if not needed.
          </FieldDescription>
        </Field>

        <Field className="grid grid-cols-1 gap-y-0.5 sm:grid-cols-[128px_1fr] sm:gap-x-2 sm:gap-y-0 sm:items-center">
          <FieldLabel
            htmlFor="cluster"
            className={cn("text-left sm:text-right", !editable && "text-muted-foreground")}
          >
            Cluster (Optional)
          </FieldLabel>
          <Input
            id="cluster"
            value={cluster}
            disabled={!editable}
            onChange={handleClusterChange}
            className="min-h-11 w-full min-w-0"
          />
          <div className="hidden sm:block" />
          <FieldDescription className="text-xs sm:col-start-2">
            ClickHouse Cluster name if the server is deployed as cluster
          </FieldDescription>
        </Field>

        <Field className="grid grid-cols-1 gap-y-0.5 sm:grid-cols-[128px_1fr] sm:gap-x-2 sm:gap-y-0 sm:items-center">
          <FieldLabel htmlFor="name" className="text-left sm:text-right">
            Connection Name
          </FieldLabel>
          <Input
            id="name"
            value={name}
            onChange={handleNameChange}
            className={cn("min-h-11 w-full min-w-0", fieldErrors.name && "border-destructive")}
          />
          <div className="hidden sm:block" />
          {fieldErrors.name ? (
            <FieldDescription className="text-destructive text-xs sm:col-start-2">
              {fieldErrors.name}
            </FieldDescription>
          ) : (
            <FieldDescription className="text-xs sm:col-start-2">
              Display name for this connection
            </FieldDescription>
          )}
        </Field>

        <FieldGroup className="pt-1">
          <Field>
            <div className="flex flex-col gap-2 pt-4 border-t sm:flex-row sm:justify-end sm:pt-6">
              <StatusPopover
                open={testStatus !== null}
                onOpenChange={(open) => !open && setTestStatus(null)}
                trigger={
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full min-h-11 sm:w-auto"
                    onClick={handleTestConnection}
                    disabled={isTesting || isSaving || showDeleteConfirm}
                  >
                    {isTesting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Test Connection
                  </Button>
                }
                side={isMobile ? "top" : "left"}
                align={isMobile ? "center" : "end"}
                sideOffset={isMobile ? 4 : 0}
                className="max-w-md"
                icon={
                  testStatus?.type === "success" ? (
                    <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-green-600 dark:text-green-400" />
                  ) : (
                    <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-red-600 dark:text-red-400" />
                  )
                }
                title={testStatus?.type === "success" ? "Connection Test" : "Error"}
              >
                <div className="text-xs whitespace-pre-wrap break-words max-h-[200px] overflow-y-auto">
                  {testStatus?.message}
                </div>
              </StatusPopover>
              {!isAddMode && onDelete && (
                <StatusPopover
                  open={showDeleteConfirm}
                  onOpenChange={setShowDeleteConfirm}
                  trigger={
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full min-h-11 sm:w-auto"
                      onClick={handleDeleteClick}
                      disabled={isTesting || isSaving}
                    >
                      Delete
                    </Button>
                  }
                  side="top"
                  align={isMobile ? "center" : "end"}
                  sideOffset={isMobile ? 4 : undefined}
                  icon={
                    <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-red-600 dark:text-red-400" />
                  }
                  title="Confirm deletion"
                >
                  <div className="text-xs mb-3">
                    Are you sure to delete this connection? This action cannot be reverted.
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleDeleteCancel}
                      disabled={isTesting || isSaving}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={handleDeleteConfirm}
                      disabled={isTesting || isSaving}
                    >
                      Delete
                    </Button>
                  </div>
                </StatusPopover>
              )}
              <Button
                type="button"
                variant="outline"
                className="w-full min-h-11 sm:w-auto"
                onClick={handleCancel}
                disabled={isTesting || isSaving || showDeleteConfirm}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="w-full min-h-11 sm:w-auto"
                disabled={isTesting || isSaving || showDeleteConfirm}
              >
                Save
              </Button>
            </div>
          </Field>
        </FieldGroup>
      </FieldGroup>
    </form>
  );
}

export interface ShowConnectionEditDialogOptions {
  connection: ConnectionConfig | null;
  onSave?: (connection: ConnectionConfig) => void;
  onDelete?: () => void;
  onCancel?: () => void;
}

export function showConnectionEditDialog(options: ShowConnectionEditDialogOptions) {
  const { connection, onSave, onDelete, onCancel } = options;
  const isAddMode = connection == null;

  const handleClose = () => {
    Dialog.close();
    if (onCancel) {
      onCancel();
    }
  };

  Dialog.showDialog({
    title: isAddMode ? "Create a new connection" : "Modify existing connection",
    description: "Configure your ClickHouse connection settings.",
    className: "max-w-2xl",
    disableBackdrop: true,
    mainContent: (
      <ConnectionEditComponent
        connection={connection}
        onSave={(savedConnection: ConnectionConfig) => {
          Dialog.close();
          if (onSave) {
            onSave(savedConnection);
          }
        }}
        onDelete={() => {
          Dialog.close();
          if (onDelete) {
            onDelete();
          }
        }}
        onCancel={handleClose}
        isAddMode={isAddMode}
      />
    ),
    onCancel: handleClose,
  });
}
