"use client";

import { ClickHouseSettingDescription } from "@/components/settings/query-context/settings-description";
import type { ClickHouseSetting } from "@/lib/clickhouse/clickhouse-setting-loader";
import type { DatabaseInfo, TableInfo } from "@/lib/connection/connection";
import * as React from "react";

function DescriptionField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-muted-foreground mb-0.5">{label}</div>
      <div className="text-foreground whitespace-pre-wrap break-all">{children}</div>
    </div>
  );
}

export function DatabaseDescription({
  database,
  className = "space-y-3 text-xs",
}: {
  database: DatabaseInfo;
  className?: string;
}) {
  return (
    <div className={className}>
      <DescriptionField label="Database">{database.name}</DescriptionField>
      <DescriptionField label="Engine">{database.engine}</DescriptionField>
      <DescriptionField label="Comment">{database.comment || "-"}</DescriptionField>
    </div>
  );
}

export function TableDescription({
  table,
  className = "space-y-3 text-xs",
}: {
  table: TableInfo;
  className?: string;
}) {
  return (
    <div className={className}>
      <DescriptionField label="Database">{table.database || "-"}</DescriptionField>
      <DescriptionField label="Table">{table.table}</DescriptionField>
      <DescriptionField label="Engine">{table.engine || "-"}</DescriptionField>
      <DescriptionField label="Comment">{table.comment || "-"}</DescriptionField>
    </div>
  );
}

export function SettingDescription({
  setting,
  className = "space-y-2 text-[11px]",
}: {
  setting: ClickHouseSetting;
  className?: string;
}) {
  const readonlyLabel = setting.readonly === null ? "-" : setting.readonly ? "Yes" : "No";

  return (
    <div className={className}>
      <DescriptionField label="Name">{setting.name}</DescriptionField>
      <DescriptionField label="Category">{setting.category}</DescriptionField>
      <DescriptionField label="Type">{setting.type}</DescriptionField>
      <DescriptionField label="Current value">{setting.value}</DescriptionField>
      <DescriptionField label="ReadOnly">{readonlyLabel}</DescriptionField>
      <div>
        <div className="text-muted-foreground mb-0.5">Description</div>
        <ClickHouseSettingDescription
          descriptionMarkdown={setting.description}
          className="text-[11px] [&_.admonition]:my-1 [&_p]:mb-1 [&_ul]:mb-1 [&_ol]:mb-1"
        />
      </div>
    </div>
  );
}
