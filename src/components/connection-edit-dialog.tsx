import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ApiCanceller, ApiErrorResponse } from '@/lib/api';
import { Api } from '@/lib/api';
import type { Connection } from '@/lib/connection/Connection';
import { ensureConnectionRuntimeInitialized } from '@/lib/connection/Connection';
import { ConnectionManager } from '@/lib/connection/ConnectionManager';
import { useConnection } from '@/lib/connection/ConnectionContext';
import { toastManager } from '@/lib/toast';
import axios from 'axios';
import { Eye, EyeOff } from 'lucide-react';
import React, { useEffect, useState } from 'react';

export interface ConnectionEditDialogProps {
  connection: Connection | null;
  onClose: () => void;
}

export const ConnectionEditDialog = React.memo(function ConnectionEditDialog(
  props: ConnectionEditDialogProps
) {
  const isAddMode = props.connection == null;
  const { setSelectedConnection } = useConnection();

  const hasProvider =
    import.meta.env.VITE_CONSOLE_CONNECTION_PROVIDER_ENABLED === 'true';

  // View Model
  const [name, setName] = useState(props.connection ? props.connection.name : '');
  const [cluster, setCluster] = useState(
    props.connection ? props.connection.cluster : ''
  );
  const [url, setUrl] = useState(props.connection ? props.connection.url : '');
  const [user, setUser] = useState(props.connection ? props.connection.user : '');
  const [password, setPassword] = useState(
    props.connection ? props.connection.password : ''
  );
  const [editable, setEditable] = useState(
    props.connection ? props.connection.editable : true
  );
  const [currentSelectedConnection, setCurrentSelectedConnection] = useState<
    Connection | null
  >(props.connection);

  const [apiCanceller, setApiCanceller] = useState<ApiCanceller>();
  const [connectionTemplates, setConnectionTemplates] = useState<Connection[]>(
    isAddMode ? [] : ConnectionManager.getInstance().getConnections()
  );

  // UI state
  const [isTestingConnection, setTestingConnection] = useState(false);
  const [isShowPassword, setShowPassword] = useState(false);
  const [isLoadingTemplates, setLoadingTemplates] = useState(false);
  const [loadingTemplateError, setLoadingTemplateError] = useState<
    ApiErrorResponse | undefined
  >();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (!isAddMode || !hasProvider) return;

    setLoadingTemplates(true);

    const url =
      import.meta.env.MODE === 'development'
        ? import.meta.env.VITE_CONSOLE_CONNECTION_PROVIDER_ENDPOINT_DEV
        : import.meta.env.VITE_CONSOLE_CONNECTION_PROVIDER_ENDPOINT_PRD;

    const apiController = new AbortController();
    axios
      .get(url as string, {
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
            user: '',
            password: '',
            cluster: conn.isCluster ? conn.name : '',
            editable: false,
          };
        });

        setConnectionTemplates(newConnections);
        setLoadingTemplateError(undefined);
      })
      .catch((error) => {
        setLoadingTemplateError({
          errorMessage: 'Failed to loading templates: ' + error.message,
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

  const showMessage = (message: string | React.ReactNode) =>
    toastManager.show(message, 'success');
  const showErrorMessage = (message: string | React.ReactNode) =>
    toastManager.show(message, 'error');

  const getEditingConnection = (): Connection | undefined => {
    if (name.trim().length === 0) {
      showErrorMessage("Name can't be empty.");
      return;
    }

    let cURL;
    try {
      cURL = new URL(url.trim());
    } catch {
      showErrorMessage('URL is invalid.');
      return;
    }
    if (cURL.protocol !== 'http:' && cURL.protocol !== 'https:') {
      showErrorMessage('URL must start with http:// or https://');
      return;
    }
    if (cURL.pathname === '') {
      cURL.pathname = '/';
    }

    const userText = user.trim();
    if (userText.length === 0) {
      showErrorMessage("User can't be empty.");
      return;
    }

    const connection: Connection = {
      name: name,
      url: cURL.href,
      user: userText,
      password: password,
      cluster: cluster.trim(),
      editable: editable,
    };

    // Customized case
    // handling some special usernames
    const parts = connection.user.split('-');
    if (parts.length === 2 && parts[1].startsWith('cluster_')) {
      if (connection.name !== parts[1]) {
        showErrorMessage("Cluster on 'User' does not match the 'Name'");
        return;
      }

      connection.user = parts[0];
      connection.cluster = parts[1];
    }

    console.log(`Connection: [${connection.url}]`);

    return connection;
  };

  const onSave = () => {
    const editingConnection = getEditingConnection();
    if (editingConnection == null) {
      return;
    }

    const manager = ConnectionManager.getInstance();

    if (isAddMode) {
      // For a new connection, the name must not be in the saved connection
      if (manager.contains(editingConnection.name)) {
        showErrorMessage(
          `There's already a connection with the name [${editingConnection.name}]. Please change the connection name to continue.`
        );
        return;
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
          return;
        }
      }

      manager.replace(currentSelectedConnection!.name, editingConnection);
    }

    // Update the selected connection to the newly saved/edited connection
    setSelectedConnection(editingConnection);

    props.onClose();
  };

  const onTestConnection = () => {
    const connection = getEditingConnection();
    if (connection == null) {
      console.log('Test connection: getEditingConnection returned null');
      return;
    }

    console.log('Test connection: Starting test for', connection);
    setTestingConnection(true);

    try {
      const initializedConnection = ensureConnectionRuntimeInitialized(connection);
      if (!initializedConnection || !initializedConnection.runtime) {
        console.error('Test connection: Failed to initialize connection runtime', initializedConnection);
        showErrorMessage('Failed to initialize connection. Please check your URL format.');
        setTestingConnection(false);
        return;
      }

      console.log('Test connection: Connection initialized, runtime:', initializedConnection.runtime);
      const api = Api.create(initializedConnection);
      console.log('Test connection: API created, executing SQL...');
      const apiCanceller = api.executeSQL(
        { sql: 'SELECT 525' },
        (response) => {
          console.log('Test connection: Response received', response);
          if (connection.cluster.length === 0) {
            if (response.httpHeaders['x-clickhouse-format'] == null) {
              showErrorMessage(
                'Successfully connected. But the response from ClickHouse server might not be configured correctly that this console does not support all features. Maybe there is a CORS problem at the server side.'
              );
            } else {
              showMessage('Successfully connected.');
            }
            setTestingConnection(false);
            return;
          }

          //
          // For CLUSTER MODE, continue to check if the cluster exists
          //
          const canceller = api.executeSQL(
            {
              sql: `SELECT 1 FROM system.clusters WHERE cluster = '${connection.cluster}' Format JSONCompact`,
            },
            (response) => {
              if (response.data.data.length === 0) {
                showErrorMessage(
                  `Cluster [${connection.cluster}] is not found on given ClickHouse server.`
                );
              } else {
                showMessage('Successfully connected to specified cluster.');
              }
            },
            (error) => {
              showErrorMessage(
                `Successfully connected to ClickHouse server. But unable to determine if the cluster [${connection.name}] exists on the server. You can still save the connection to continue. ${
                  error.httpStatus !== 404 ? error.errorMessage : ''
                }`
              );
            },
            () => {
              setTestingConnection(false);
            }
          );

          setApiCanceller(canceller);
        },
        (error) => {
          console.error('Test connection: Error received', error);
          setApiCanceller(undefined);

          //
          // Authentication fails
          //
          if (
            error.httpStatus === 403 &&
            error.httpHeaders &&
            error.httpHeaders['x-clickhouse-exception-code'] === '516'
          ) {
            showErrorMessage('User name or password is wrong.');
            setTestingConnection(false);
            return;
          }

          // try to detect if the error object has 'message' field and then use it if it has
          const detailMessage =
            typeof error?.data == 'object'
              ? error.data.message
                ? error.data.message
                : JSON.stringify(error.data, null, 2)
              : error?.data;

          showErrorMessage(`${error.errorMessage}\n${detailMessage}`);
          setTestingConnection(false);
        },
        () => {
          console.log('Test connection: Request finalized');
          setTestingConnection(false);
        }
      );

      setApiCanceller(apiCanceller);
      console.log('Test connection: Request initiated');
    } catch (e: unknown) {
      console.error('Test connection: Exception caught', e);
      setTestingConnection(false);
      const errorMessage = e instanceof Error ? e.message : 'Unknown error';
      showErrorMessage(`Internal Error\n${errorMessage}`);
    }
  };

  const onDelete = () => {
    if (name != null && currentSelectedConnection) {
      ConnectionManager.getInstance().remove(name.trim());
    }

    props.onClose();
  };

  const onClose = () => {
    // cancel any inflight request
    apiCanceller?.cancel();

    props.onClose();
  };

  const renderConnectionSelector = () => {
    if (!hasProvider) return null;

    return (
      <div className="space-y-2">
        <Label>{isAddMode ? 'Templates(Optional)' : 'Connections'}</Label>
        {isLoadingTemplates && <div>Loading...</div>}
        {!isLoadingTemplates && loadingTemplateError !== undefined && (
          <div className="text-sm text-destructive">
            {loadingTemplateError.errorMessage}
          </div>
        )}
        {!isLoadingTemplates && loadingTemplateError === undefined && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="w-full justify-start">
                {currentSelectedConnection
                  ? currentSelectedConnection.name
                  : 'Select a template...'}
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

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isAddMode ? 'Create a new connection' : 'Modify an existing connection'}
          </DialogTitle>
          <DialogDescription>
            Configure your ClickHouse connection settings.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {renderConnectionSelector()}

          <div className="space-y-2">
            <Label htmlFor="name">
              Name (Required)
            </Label>
            <Input
              id="name"
              autoFocus
              placeholder="name of a connection. Must be unique."
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="cluster" className={!editable ? 'text-muted-foreground' : ''}>
              Cluster (Optional)
            </Label>
            <Input
              id="cluster"
              placeholder="logic cluster name"
              value={cluster}
              disabled={!editable}
              onChange={(e) => setCluster(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="url">URL (Required)</Label>
            <Input
              id="url"
              placeholder="http(s)://"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="user">User (Required)</Label>
            <Input
              id="user"
              placeholder="user name"
              value={user}
              onChange={(e) => setUser(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Input
                id="password"
                placeholder="password"
                type={isShowPassword ? 'text' : 'password'}
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
                {isShowPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={onTestConnection}
            disabled={isTestingConnection}
          >
            {isTestingConnection ? 'Testing...' : 'Test Connection'}
          </Button>
          {props.connection != null && (
            <Button
              variant="destructive"
              onClick={() => setShowDeleteConfirm(true)}
            >
              Delete
            </Button>
          )}
          <Button onClick={onSave}>Save</Button>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm deletion</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this connection? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="destructive"
              onClick={() => {
                onDelete();
                setShowDeleteConfirm(false);
              }}
            >
              Delete
            </Button>
            <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
});
