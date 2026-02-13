import { ThemedSyntaxHighlighter } from "@/components/shared/themed-syntax-highlighter";
import { CopyButton } from "@/components/ui/copy-button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SqlUtils } from "@/lib/sql-utils";

export type SpanAttributeRenderFunction = (value: unknown) => React.ReactNode;

function toDisplayText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (value === null || value === undefined) {
    return "-";
  }
  return JSON.stringify(value, null, 2);
}

function renderDefaultAttribute(value: unknown): React.ReactNode {
  return (
    <div className="text-muted-foreground break-all whitespace-pre-wrap">
      {toDisplayText(value)}
    </div>
  );
}

function renderSqlAttribute(value: unknown): React.ReactNode {
  const valueText = toDisplayText(value);
  if (valueText === "-") {
    return renderDefaultAttribute(value);
  }
  const formatted = SqlUtils.prettyFormatQuery(valueText);

  return (
    <div className="relative rounded-sm">
      <CopyButton value={formatted} className="absolute top-1 right-1 z-10 h-6 w-6" />
      <ThemedSyntaxHighlighter
        language="sql"
        customStyle={{ margin: 0, padding: "2px", borderRadius: 0 }}
      >
        {formatted}
      </ThemedSyntaxHighlighter>
    </div>
  );
}

function renderClickhouseSettingsAttribute(value: unknown): React.ReactNode {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return renderDefaultAttribute(value);
  }
  const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
    left.localeCompare(right)
  );
  if (entries.length === 0) {
    return <div className="text-muted-foreground">No ClickHouse settings.</div>;
  }

  return (
    <div className="border rounded-sm overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-1/3">Setting</TableHead>
            <TableHead>Value</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map(([key, item]) => (
            <TableRow key={key}>
              <TableCell className="font-medium break-all">{key}</TableCell>
              <TableCell className="text-muted-foreground break-all whitespace-pre-wrap">
                {toDisplayText(item)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

const spanAttributeRenderers = new Map<string, SpanAttributeRenderFunction>([
  ["sql", renderSqlAttribute],
  ["db.statement", renderSqlAttribute],
  ["clickhouse.settings", renderClickhouseSettingsAttribute],
]);

export function getSpanAttributeRenderOrDefault(tagName: string): SpanAttributeRenderFunction {
  const renderer = spanAttributeRenderers.get(tagName);
  return renderer ?? renderDefaultAttribute;
}
