import { describe, expect, it } from "vitest";
import {
  escapeSequenceMessageSemicolons,
  isLikelyCompleteMermaidChart,
  normalizeMermaidChart,
  quoteFlowchartNodeLabels,
  quoteSequenceAliasLabel,
} from "./message-markdown-mermaid-utils";

describe("message-markdown-mermaid-utils", () => {
  it("quotes sequence alias labels that contain punctuation Mermaid rejects", () => {
    expect(quoteSequenceAliasLabel("participant DB as Customer DB (Primary): West")).toBe(
      'participant DB as "Customer DB (Primary): West"'
    );
  });

  it("escapes semicolons in sequence messages", () => {
    expect(escapeSequenceMessageSemicolons("A->>B: first; second")).toBe("A->>B: first#59; second");
  });

  it("quotes flowchart square and decision labels with spaces or punctuation", () => {
    expect(
      quoteFlowchartNodeLabels(
        "A[Start: you got UNKNOWN_TABLE (code 60)] --> B{Which database engine is db using?}"
      )
    ).toBe(
      'A["Start: you got UNKNOWN_TABLE (code 60)"] --> B{"Which database engine is db using?"}'
    );
  });

  it("quotes flowchart edge labels with punctuation", () => {
    expect(
      normalizeMermaidChart(
        [
          "flowchart TD",
          "A -->|tryGetTable() returns StoragePtr| B[Table exists -> proceed]",
          "A -->|No| C[Simple branch]",
        ].join("\n")
      )
    ).toBe(
      [
        "flowchart TD",
        'A -->|"tryGetTable() returns StoragePtr"| B["Table exists -> proceed"]',
        'A -->|No| C["Simple branch"]',
      ].join("\n")
    );
  });

  it("does not double-quote labels that are already valid", () => {
    expect(quoteFlowchartNodeLabels('A["Already quoted"] --> B[Atomic]')).toBe(
      'A["Already quoted"] --> B[Atomic]'
    );
  });

  it("normalizes flowchart diagrams without touching Mermaid object literals", () => {
    expect(
      normalizeMermaidChart(
        [
          "flowchart TD",
          "A[Start: fail here] --> B{Check db.table}",
          "C@{ shape: rect, label: plain }",
        ].join("\n")
      )
    ).toBe(
      [
        "flowchart TD",
        'A["Start: fail here"] --> B{"Check db.table"}',
        "C@{ shape: rect, label: plain }",
      ].join("\n")
    );
  });

  it("quotes multiline flowchart labels across the whole chart", () => {
    expect(
      normalizeMermaidChart(
        [
          "flowchart TD",
          'A[Line one\\n"quoted" line two] --> B{Question\\nwith punctuation?}',
          "A --> C[[double bracket label]]",
        ].join("\n")
      )
    ).toBe(
      [
        "flowchart TD",
        'A["Line one\\n&quot;quoted&quot; line two"] --> B{"Question\\nwith punctuation?"}',
        'A --> C[["double bracket label"]]',
      ].join("\n")
    );
  });

  it("replaces embedded double quotes inside labels with Mermaid-safe entities", () => {
    expect(
      normalizeMermaidChart(
        [
          "flowchart TD",
          'A[Start] --> B{Error message contains\\n"Cannot alter table" and "different UUID"?}',
          'B -->|"message says \\"was not found\\""| C[Done]',
        ].join("\n")
      )
    ).toBe(
      [
        "flowchart TD",
        'A[Start] --> B{"Error message contains\\n&quot;Cannot alter table&quot; and &quot;different UUID&quot;?"}',
        'B -->|"message says &quot;was not found&quot;"| C[Done]',
      ].join("\n")
    );
  });

  it("treats truncated streaming diagrams as incomplete", () => {
    expect(
      isLikelyCompleteMermaidChart(
        [
          "flowchart TD",
          'A[UNKNOWN_TABLE (Code 60)] --> B{Error text contains\\n"metadata file ... different UUID"?}',
          "B -- Yes -->",
        ].join("\n")
      )
    ).toBe(false);
  });

  it("treats balanced flowcharts as complete", () => {
    expect(
      isLikelyCompleteMermaidChart(
        [
          "flowchart TD",
          'A[UNKNOWN_TABLE (Code 60)] --> B{Error text contains\\n"metadata file ... different UUID"?}',
          'B -- Yes --> C["Investigate metadata on disk"]',
          "classDef src fill:#f6f6f6,stroke:#999,stroke-width:1px;",
        ].join("\n")
      )
    ).toBe(true);
  });

  it("quotes subgraph titles that contain spaces", () => {
    expect(
      normalizeMermaidChart(
        [
          "flowchart TD",
          "subgraph Common root causes",
          "  A[Wrong database/table name]",
          "end",
        ].join("\n")
      )
    ).toBe(
      [
        "flowchart TD",
        'subgraph "Common root causes"',
        '  A["Wrong database/table name"]',
        "end",
      ].join("\n")
    );
  });
});
