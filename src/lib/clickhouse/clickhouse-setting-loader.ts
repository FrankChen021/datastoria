import { normalizeSettingDescriptionMarkdown } from "@/components/settings/query-context/settings-description";
import type { Connection, JSONCompactFormatResponse } from "@/lib/connection/connection";

export type ClickHouseSettingCategory = "settings" | "server_settings" | "merge_tree_settings";

export interface ClickHouseSetting {
  name: string;
  type: string;
  description: string;
  value: string;
  readonly: boolean | null;
  category: ClickHouseSettingCategory;
}

export class ClickHouseSettingLoader {
  public static async load(connection: Connection): Promise<void> {
    connection.metadata.clickhouseSettings = new Map<string, ClickHouseSetting>();

    await Promise.all([
      this.loadSettingTable(
        connection,
        "SELECT name, type, description, value, readonly FROM system.settings ORDER BY name",
        "settings",
        true
      ),
      this.loadSettingTable(
        connection,
        "SELECT name, type, description, value FROM system.server_settings ORDER BY name",
        "server_settings",
        false
      ),
      this.loadSettingTable(
        connection,
        "SELECT name, type, description, value FROM system.merge_tree_settings ORDER BY name",
        "merge_tree_settings",
        false
      ),
    ]);
  }

  private static appendRows(
    connection: Connection,
    rows: unknown[][],
    category: ClickHouseSettingCategory,
    hasReadonly: boolean
  ): void {
    for (const row of rows) {
      const name = row[0];
      if (typeof name !== "string" || name.length === 0) {
        continue;
      }

      const setting: ClickHouseSetting = {
        name,
        type: typeof row[1] === "string" ? row[1] : "Unknown",
        description: typeof row[2] === "string" ? normalizeSettingDescriptionMarkdown(row[2]) : "",
        value: row[3] === null || row[3] === undefined ? "-" : String(row[3]),
        readonly: hasReadonly ? row[4] === 1 || row[4] === true : null,
        category,
      };

      connection.metadata.clickhouseSettings.set(name, setting);
    }
  }

  private static async loadSettingTable(
    connection: Connection,
    sql: string,
    category: ClickHouseSettingCategory,
    hasReadonly: boolean
  ): Promise<void> {
    try {
      const response = await connection.query(sql, {
        default_format: "JSONCompact",
      }).response;
      if (response.httpStatus !== 200) {
        return;
      }

      this.appendRows(
        connection,
        response.data.json<JSONCompactFormatResponse>().data,
        category,
        hasReadonly
      );
    } catch (error) {
      console.warn(`Failed to load ClickHouse ${category}:`, error);
    }
  }
}
