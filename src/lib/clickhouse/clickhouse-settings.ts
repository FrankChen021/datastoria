import { normalizeSettingDescriptionMarkdown } from "@/components/settings/query-context/settings-description";
import type { Connection, JSONCompactFormatResponse } from "@/lib/connection/connection";

export type ClickHouseSettingSource = "settings" | "server_settings" | "merge_tree_settings";
export const CLICKHOUSE_SETTINGS_CACHE_VERSION = 2;

export interface ClickHouseSettingInfo {
  name: string;
  type: string;
  description: string;
  value: string;
  readonly: boolean | null;
  source: ClickHouseSettingSource;
}

const pendingLoads = new WeakMap<Connection, Promise<Map<string, ClickHouseSettingInfo>>>();

function normalizeSettingValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "-";
  }
  return String(value);
}

export async function loadClickHouseSettings(
  connection: Connection
): Promise<Map<string, ClickHouseSettingInfo>> {
  const cachedSettings = connection.metadata.clickhouseSettings;
  if (
    cachedSettings &&
    connection.metadata.clickhouseSettingsCacheVersion === CLICKHOUSE_SETTINGS_CACHE_VERSION
  ) {
    return cachedSettings;
  }

  const pending = pendingLoads.get(connection);
  if (pending) {
    return pending;
  }

  const nextLoad = Promise.allSettled([
    connection.query(
      "SELECT name, type, description, value, readonly FROM system.settings ORDER BY name",
      {
        default_format: "JSONCompact",
      }
    ).response,
    connection.query(
      "SELECT name, type, description, value FROM system.server_settings ORDER BY name",
      {
        default_format: "JSONCompact",
      }
    ).response,
    connection.query(
      "SELECT name, type, description, value FROM system.merge_tree_settings ORDER BY name",
      {
        default_format: "JSONCompact",
      }
    ).response,
  ])
    .then(([settingsResult, serverSettingsResult, mergeTreeSettingsResult]) => {
      const settingsByName = new Map<string, ClickHouseSettingInfo>();

      const appendRows = (
        rows: unknown[][],
        source: ClickHouseSettingSource,
        hasReadonly: boolean
      ) => {
        for (const row of rows) {
          const name = row[0];
          if (typeof name !== "string" || name.length === 0) {
            continue;
          }

          const settingInfo: ClickHouseSettingInfo = {
            name,
            type: typeof row[1] === "string" ? row[1] : "Unknown",
            description:
              typeof row[2] === "string" ? normalizeSettingDescriptionMarkdown(row[2]) : "",
            value: normalizeSettingValue(row[3]),
            readonly: hasReadonly ? row[4] === 1 || row[4] === true : null,
            source,
          };

          if (!settingsByName.has(name)) {
            settingsByName.set(name, settingInfo);
          }
        }
      };

      if (settingsResult.status === "fulfilled") {
        appendRows(
          settingsResult.value.data.json<JSONCompactFormatResponse>().data,
          "settings",
          true
        );
      }
      if (serverSettingsResult.status === "fulfilled") {
        appendRows(
          serverSettingsResult.value.data.json<JSONCompactFormatResponse>().data,
          "server_settings",
          false
        );
      }
      if (mergeTreeSettingsResult.status === "fulfilled") {
        appendRows(
          mergeTreeSettingsResult.value.data.json<JSONCompactFormatResponse>().data,
          "merge_tree_settings",
          false
        );
      }

      connection.metadata.clickhouseSettings = settingsByName;
      connection.metadata.clickhouseSettingsCacheVersion = CLICKHOUSE_SETTINGS_CACHE_VERSION;

      return settingsByName;
    })
    .finally(() => {
      pendingLoads.delete(connection);
    });

  pendingLoads.set(connection, nextLoad);
  return nextLoad;
}
