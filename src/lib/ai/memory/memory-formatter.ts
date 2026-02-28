import type { MemoryKind, MemoryRecord } from "./memory-types";

function getSectionLabel(kind: MemoryKind): string {
  switch (kind) {
    case "preference":
      return "Known user preferences";
    case "connection_fact":
      return "Known connection facts";
    case "workflow_note":
      return "Known workflow notes";
    case "investigation_finding":
      return "Relevant prior findings";
  }
}

export function formatMemoryBlock(records: MemoryRecord[]): string {
  if (records.length === 0) {
    return "";
  }

  const grouped = new Map<string, string[]>();

  for (const record of records) {
    const section = getSectionLabel(record.kind);
    if (!grouped.has(section)) {
      grouped.set(section, []);
    }
    grouped.get(section)!.push(`- ${record.content}`);
  }

  return Array.from(grouped.entries())
    .map(([section, items]) => `${section}:\n${items.join("\n")}`)
    .join("\n\n");
}
