"use client";

import { useConnection } from "@/components/connection/connection-context";
import {
  CLICKHOUSE_SETTINGS_CACHE_VERSION,
  loadClickHouseSettings,
  type ClickHouseSettingInfo,
} from "@/lib/clickhouse/clickhouse-settings";
import * as React from "react";

export function useClickHouseSettings() {
  const { connection } = useConnection();
  const [settingsByName, setSettingsByName] = React.useState<Map<string, ClickHouseSettingInfo>>(
    () => connection?.metadata.clickhouseSettings ?? new Map()
  );
  const settings = React.useMemo(() => Array.from(settingsByName.values()), [settingsByName]);
  const [isLoading, setIsLoading] = React.useState(() =>
    Boolean(
      connection &&
      (!connection.metadata.clickhouseSettings ||
        connection.metadata.clickhouseSettingsCacheVersion !== CLICKHOUSE_SETTINGS_CACHE_VERSION)
    )
  );

  React.useEffect(() => {
    let cancelled = false;

    if (!connection) {
      setSettingsByName(new Map());
      setIsLoading(false);
      return;
    }

    const cachedSettings = connection.metadata.clickhouseSettings;
    if (
      cachedSettings &&
      connection.metadata.clickhouseSettingsCacheVersion === CLICKHOUSE_SETTINGS_CACHE_VERSION
    ) {
      setSettingsByName(cachedSettings);
      setIsLoading(false);
      return;
    }

    setSettingsByName(new Map());
    setIsLoading(true);

    loadClickHouseSettings(connection)
      .then((loadedSettingsByName) => {
        if (!cancelled) {
          setSettingsByName(loadedSettingsByName);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSettingsByName(new Map());
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [connection]);

  return {
    settings,
    settingsByName,
    isLoading,
  };
}
