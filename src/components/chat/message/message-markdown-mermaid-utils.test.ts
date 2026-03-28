import { describe, expect, it } from "vitest";
import {
  escapeSequenceMessageSemicolons,
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
    const escapedQuote = '\\"';

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
        `A["Line one\\n${escapedQuote}quoted${escapedQuote} line two"] --> B{"Question\\nwith punctuation?"}`,
        'A --> C[["double bracket label"]]',
      ].join("\n")
    );
  });
});
