import { CollapsibleSection } from "@/components/shared/collapsible-section";
import type { FieldOption } from "@/components/shared/dashboard/dashboard-model";
import { DataTable } from "@/components/shared/dashboard/data-table";
import { QueryIdLink } from "@/components/shared/query-id-link";
import { ThemedSyntaxHighlighter } from "@/components/shared/themed-syntax-highlighter";
import type { TimelineNode } from "@/components/shared/timeline/timeline-types";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Formatter } from "@/lib/formatter";
import { SqlUtils } from "@/lib/sql-utils";
import { X } from "lucide-react";
import type { SpanLogElement } from "./span-log-inspector-timeline-types";
import { parseAttributes } from "./span-log-utils";

function parseUriQueryParams(uri: string): { name: string; value: string }[] {
  try {
    const url =
      uri.startsWith("http://") || uri.startsWith("https://")
        ? new URL(uri)
        : new URL(uri, "http://dummy");
    const entries: { name: string; value: string }[] = [];
    url.searchParams.forEach((value, name) => {
      entries.push({ name, value });
    });
    return entries;
  } catch {
    return [];
  }
}

export function renderSpanLogTimelineDetailPane(selectedNode: TimelineNode, onClose: () => void) {
  const spanLog = selectedNode.data as SpanLogElement;
  const attributes = spanLog.attribute ? spanLog.attribute : {};
  const sqlValueRaw = attributes["db.statement"];
  const sqlValue = typeof sqlValueRaw === "string" ? sqlValueRaw : "";
  const formattedSql = sqlValue !== "" ? SqlUtils.prettyFormatQuery(sqlValue) : "";
  const clickhouseQueryRaw = attributes["clickhouse.query"];
  const clickhouseQuery = typeof clickhouseQueryRaw === "string" ? clickhouseQueryRaw : "";
  const formattedClickhouseQuery =
    clickhouseQuery !== "" ? SqlUtils.prettyFormatQuery(clickhouseQuery) : "";
  const clickhouseSettings = parseAttributes(attributes["clickhouse.settings"]) ?? {};

  const basicProperties = Object.entries(spanLog)
    .filter(([key]) => key !== "attribute" && key !== "attributes")
    .map(([field, value]) => ({ field, value }));
  const timestampFormatter = Formatter.getInstance().getFormatter("yyyyMMddHHmmssSSS");
  const basicMeta = [{ name: "field" }, { name: "value" }];
  const basicFieldOptions: FieldOption[] = [
    {
      name: "value",
      format: (v: unknown, _args?: unknown[], context?: Record<string, unknown>) => {
        const fieldName = typeof context?.field === "string" ? context.field : "";
        if (fieldName === "start_time_us" || fieldName === "finish_time_us") {
          return timestampFormatter(v, [1000], context);
        }
        if (v !== null && typeof v === "object") {
          return JSON.stringify(v, null, 2);
        }
        return String(v);
      },
    },
  ];

  const attributeEntries = Object.entries(attributes).filter(
    ([key]) => key !== "clickhouse.settings" && key !== "db.statement" && key !== "clickhouse.query"
  );
  const attributeData = attributeEntries
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, value]) => ({ name, value }));
  const binarySizeFormatter = Formatter.getInstance().getFormatter("binary_size");
  const shortNumberFormatter = Formatter.getInstance().getFormatter("short_number");
  const binarySizeAttributes = new Set([
    "clickhouse.memory_usage",
    "clickhouse.read_bytes",
    "clickhouse.written_bytes",
  ]);
  const shortNumberAttributes = new Set(["clickhouse.read_rows", "clickhouse.written_rows"]);
  const attributeMeta = [{ name: "name" }, { name: "value" }];
  const attributeFieldOptions: FieldOption[] = [
    {
      name: "value",
      format: (v: unknown, _args?: unknown[], context?: Record<string, unknown>) => {
        const attributeName = typeof context?.name === "string" ? context.name : "";
        if (attributeName === "clickhouse.query_id") {
          const queryId = String(v);
          return <QueryIdLink displayQueryId={queryId} queryId={queryId} showIcon={true} />;
        }
        if (attributeName === "clickhouse.uri") {
          const uri = String(v);
          const params = parseUriQueryParams(uri);
          if (params.length === 0) {
            return uri;
          }
          return (
            <div className="space-y-0">
              <span className="text-muted-foreground break-all">{uri}</span>
              <Table className="mt-2">
                <TableHeader className="border-t border-b">
                  <TableRow>
                    <TableHead className="w-[min(12rem,30%)] py-1">query parameter name</TableHead>
                    <TableHead className="py-1">query parameter value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {params.map(({ name, value }) => (
                    <TableRow key={name}>
                      <TableCell className="py-1 text-xs align-top break-all">{name}</TableCell>
                      <TableCell className="py-1 text-xs align-top break-all">{value}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          );
        }
        if (binarySizeAttributes.has(attributeName)) {
          return binarySizeFormatter(v);
        }
        if (shortNumberAttributes.has(attributeName)) {
          return shortNumberFormatter(v);
        }
        if (v !== null && typeof v === "object") {
          return JSON.stringify(v, null, 2);
        }
        return String(v);
      },
    },
  ];
  const clickhouseSettingsData = Object.entries(clickhouseSettings)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([setting, value]) => ({ setting, value }));
  const clickhouseSettingsMeta = [{ name: "setting" }, { name: "value" }];
  const clickhouseSettingsFieldOptions: FieldOption[] = [
    {
      name: "value",
      format: (v: unknown) => {
        if (v !== null && typeof v === "object") {
          return JSON.stringify(v, null, 2);
        }
        return String(v);
      },
    },
  ];

  return (
    <div className="h-full min-h-0 flex flex-col border-t rounded-none">
      <div className="h-8 px-2 border-b bg-muted/20 flex items-center justify-between">
        <div className="text-sm font-medium">Span Details</div>
        <Button variant={"link"} size="icon" onClick={onClose} className="h-6 w-6">
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pb-32">
        <CollapsibleSection
          title="Basic Properties"
          className="border-0 rounded-none"
          defaultOpen={true}
        >
          <div className="px-3 py-1">
            {basicProperties.length > 0 ? (
              <DataTable
                data={basicProperties}
                meta={basicMeta}
                fieldOptions={basicFieldOptions}
                className="h-auto"
              />
            ) : (
              <div className="text-sm text-muted-foreground">No basic properties found.</div>
            )}
          </div>
        </CollapsibleSection>

        <CollapsibleSection title="attribute" className="border-0 rounded-none" defaultOpen={true}>
          <div className="px-3 py-1">
            {attributeData.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                No attributes found for this span.
              </div>
            ) : (
              <DataTable
                data={attributeData}
                meta={attributeMeta}
                fieldOptions={attributeFieldOptions}
                className="h-auto"
              />
            )}
          </div>
        </CollapsibleSection>

        {sqlValue !== "" && (
          <CollapsibleSection
            title="attribute['db.statement']"
            className="border-0 rounded-none"
            defaultOpen={true}
          >
            <div className="overflow-x-auto relative group">
              <CopyButton
                value={formattedSql}
                className="absolute top-1 right-2 z-10 h-6 w-6 opacity-0 transition-opacity group-hover:opacity-100"
              />
              <ThemedSyntaxHighlighter
                customStyle={{ fontSize: "14px", margin: 0, paddingLeft: "1rem", paddingTop: 0 }}
                language="sql"
              >
                {formattedSql}
              </ThemedSyntaxHighlighter>
            </div>
          </CollapsibleSection>
        )}
        {clickhouseQuery !== "" && (
          <CollapsibleSection
            title="attribute['clickhouse.query']"
            className="border-0 rounded-none"
            defaultOpen={true}
          >
            <div className="overflow-x-auto relative group">
              <CopyButton
                value={formattedClickhouseQuery}
                className="absolute top-1 right-2 z-10 h-6 w-6 opacity-0 transition-opacity group-hover:opacity-100"
              />
              <ThemedSyntaxHighlighter
                customStyle={{ fontSize: "14px", margin: 0, paddingLeft: "1rem", paddingTop: 0 }}
                language="sql"
              >
                {formattedClickhouseQuery}
              </ThemedSyntaxHighlighter>
            </div>
          </CollapsibleSection>
        )}

        {clickhouseSettingsData.length > 0 && (
          <CollapsibleSection
            title="attribute['clickhouse.settings.x']"
            className="border-0 rounded-none"
            defaultOpen={false}
          >
            <div className="px-3 py-1">
              <DataTable
                data={clickhouseSettingsData}
                meta={clickhouseSettingsMeta}
                fieldOptions={clickhouseSettingsFieldOptions}
                className="h-auto"
              />
            </div>
          </CollapsibleSection>
        )}
      </div>
    </div>
  );
}
