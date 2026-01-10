import { LocalStorage } from "../local-storage";
import type { ConnectionConfig } from "./connection-config";

export const ConnectionChangeType = {
  ADD: 0,
  MODIFY: 1,
  REMOVE: 2,
} as const;

export type ConnectionChangeTypeValue =
  (typeof ConnectionChangeType)[keyof typeof ConnectionChangeType];

export interface ConnectionChangeEventArgs {
  type: ConnectionChangeTypeValue;
  beforeChange: ConnectionConfig | null;
  afterChange: ConnectionConfig | null;
}

const ConnectionKey: string = "connections";
export class ConnectionManager {
  private static instance: ConnectionManager;

  public static getInstance(): ConnectionManager {
    return this.instance || (this.instance = new this());
  }

  private connectionMap: Map<string, ConnectionConfig>;
  private connectionArray: ConnectionConfig[];

  constructor() {
    let savedConnections: unknown[] = [];
    try {
      savedConnections = LocalStorage.getInstance().getAsJSON<unknown[]>(ConnectionKey, () => []);
    } catch {
      // Ignore
    }

    this.connectionMap = new Map();
    this.connectionArray = [];
    savedConnections.forEach((val) => {
      // Type guard for connection data
      if (
        typeof val !== "object" ||
        val === null ||
        !("name" in val) ||
        !("url" in val) ||
        !("user" in val)
      ) {
        return;
      }

      const connData = val as {
        name: string;
        url: string;
        user: string;
        password?: string;
        cluster?: string;
        isCluster?: boolean;
        editable?: boolean;
      };

      // Process old data
      const cluster =
        connData.cluster === undefined && connData.isCluster
          ? connData.name
          : connData.cluster || "";

      const connection: ConnectionConfig = {
        name: connData.name,
        url: connData.url,
        user: connData.user,
        password: connData.password || "",
        cluster: cluster,
        editable: connData.editable !== undefined ? connData.editable : true,
      };

      this.connectionArray.push(connection);
      this.connectionMap.set(connection.name, connection);
    });
    this.connectionArray.sort((a, c) => a.name.localeCompare(c.name));
  }

  getConnections(): ConnectionConfig[] {
    return this.connectionArray;
  }

  contains(name: string) {
    return this.connectionMap.has(name);
  }

  add(connection: ConnectionConfig): ConnectionChangeEventArgs {
    this.connectionArray.push(connection);

    try {
      LocalStorage.getInstance().setJSON(ConnectionKey, this.connectionArray);
    } catch (e) {
      this.connectionArray.pop();
      throw e;
    }

    this.connectionMap.set(connection.name, connection);
    this.connectionArray.sort((a, c) => a.name.localeCompare(c.name));

    return {
      type: ConnectionChangeType.ADD,
      beforeChange: null,
      afterChange: connection,
    };
  }

  replace(name: string, newConnection: ConnectionConfig): ConnectionChangeEventArgs {
    const index = this.indexOf(name);
    if (index === -1) {
      return this.add(newConnection);
    }

    const oldConnection = this.connectionArray[index];
    this.connectionArray[index] = newConnection;
    try {
      LocalStorage.getInstance().setJSON(ConnectionKey, this.connectionArray);
    } catch (e) {
      this.connectionArray[index] = oldConnection;
      throw e;
    }

    this.connectionMap.delete(name);
    this.connectionMap.set(newConnection.name, newConnection);
    this.connectionArray.sort((a, c) => a.name.localeCompare(c.name));

    return {
      type: ConnectionChangeType.MODIFY,
      beforeChange: oldConnection,
      afterChange: newConnection,
    };
  }

  remove(name: string): ConnectionChangeEventArgs {
    let oldConnection = null;

    const newConnectionArray = [];
    for (let i = 0; i < this.connectionArray.length; i++) {
      if (this.connectionArray[i].name !== name) {
        newConnectionArray.push(this.connectionArray[i]);
      } else {
        oldConnection = this.connectionArray[i];
      }
    }

    if (oldConnection !== null) {
      LocalStorage.getInstance().setJSON(ConnectionKey, newConnectionArray);

      this.connectionArray = newConnectionArray;
      this.connectionMap.delete(name);
    }

    return {
      type: ConnectionChangeType.REMOVE,
      beforeChange: oldConnection,
      afterChange: null,
    };
  }

  private indexOf(name: string): number {
    for (let i = 0; i < this.connectionArray.length; i++) {
      if (this.connectionArray[i].name === name) return i;
    }
    return -1;
  }

  public first(): ConnectionConfig | null {
    return this.connectionArray.length > 0 ? this.connectionArray[0] : null;
  }

  public saveLastSelected(name: string | undefined) {
    const key = ConnectionKey + ".selected";

    if (name === undefined) {
      LocalStorage.getInstance().remove(key);
    } else {
      LocalStorage.getInstance().setString(key, name);
    }
  }

  public getLastSelectedOrFirst() {
    const selected = LocalStorage.getInstance().getString(ConnectionKey + ".selected");
    if (selected === null) {
      return this.first();
    }
    const selectedConn = this.connectionArray.find((conn) => conn.name === selected);
    return selectedConn === undefined ? this.first() : selectedConn;
  }
}
