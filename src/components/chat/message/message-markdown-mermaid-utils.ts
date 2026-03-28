export function normalizeMermaidChart(chart: string) {
  const isFlowchart = chart
    .split("\n")
    .some((line) => line.trim().length > 0 && /^(?:flowchart|graph)\b/i.test(line.trim()));

  return chart
    .split("\n")
    .map((line) => {
      const quotedParticipantLine = quoteSequenceAliasLabel(line);
      const escapedSequenceLine = escapeSequenceMessageSemicolons(quotedParticipantLine);

      if (!isFlowchart) {
        return escapedSequenceLine;
      }

      return quoteFlowchartNodeLabels(escapedSequenceLine);
    })
    .join("\n");
}

export function quoteSequenceAliasLabel(line: string) {
  const match = line.match(/^(\s*(?:actor|participant)\s+\S+\s+as\s+)(.+)$/);
  if (!match) {
    return line;
  }

  const [, prefix, label] = match;
  const trimmedLabel = label.trim();

  if (
    trimmedLabel.length === 0 ||
    (trimmedLabel.startsWith('"') && trimmedLabel.endsWith('"')) ||
    !/[()/:;]/.test(trimmedLabel)
  ) {
    return line;
  }

  const escapedLabel = trimmedLabel.replaceAll('"', '\\"');
  return `${prefix}"${escapedLabel}"`;
}

export function escapeSequenceMessageSemicolons(line: string) {
  if (!/(->>|-->>|->|-->|-x|--x)/.test(line)) {
    return line;
  }

  const colonIndex = line.indexOf(":");
  if (colonIndex === -1) {
    return line;
  }

  const prefix = line.slice(0, colonIndex + 1);
  const label = line.slice(colonIndex + 1);

  if (!label.includes(";")) {
    return line;
  }

  return `${prefix}${label.replaceAll(";", "#59;")}`;
}

export function quoteFlowchartNodeLabels(line: string) {
  let normalizedLine = line.replace(/\[(?!")([^\]\n]+)\]/g, (match, label) =>
    quoteFlowchartLabel(match, label, "[", "]")
  );

  normalizedLine = normalizedLine.replace(/(^|[^@])\{(?!")([^}\n]+)\}/g, (match, prefix, label) => {
    const quoted = quoteFlowchartLabel(`{${label}}`, label, "{", "}");
    return `${prefix}${quoted}`;
  });

  return normalizedLine;
}

function quoteFlowchartLabel(match: string, label: string, open: string, close: string) {
  const trimmedLabel = label.trim();

  if (!shouldQuoteFlowchartLabel(trimmedLabel)) {
    return match;
  }

  const escapedLabel = trimmedLabel.replaceAll('"', '\\"');
  return `${open}"${escapedLabel}"${close}`;
}

function shouldQuoteFlowchartLabel(label: string) {
  if (label.length === 0) {
    return false;
  }

  if (label.startsWith('"') && label.endsWith('"')) {
    return false;
  }

  return /[^A-Za-z0-9_-]/.test(label);
}
