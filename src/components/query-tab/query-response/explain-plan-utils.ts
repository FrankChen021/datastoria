export interface ExplainPlanIndex {
  type: string;
  condition?: string;
  initialParts?: number;
  selectedParts?: number;
  initialGranules?: number;
  selectedGranules?: number;
  raw: Record<string, unknown>;
}

export interface ExplainPlanExpressionItem {
  name: string;
  type: string;
}

export interface ExplainPlanExpressionAction {
  nodeType: string;
  resultType?: string;
  resultName?: string;
  arguments: number[];
  removedArguments: number[];
  result?: number;
  raw: Record<string, unknown>;
}

export interface ExplainPlanExpression {
  inputs: ExplainPlanExpressionItem[];
  outputs: ExplainPlanExpressionItem[];
  actions: ExplainPlanExpressionAction[];
  positions: number[];
  raw: Record<string, unknown>;
}

export interface ExplainPlanPrewhereInfo {
  filter?: ExplainPlanExpression;
  raw: Record<string, unknown>;
}

export interface ExplainPlanAggregate {
  name: string;
  functionName?: string;
  argumentTypes: string[];
  resultType?: string;
  arguments: string[];
  raw: Record<string, unknown>;
}

export interface ExplainPlanStats {
  parts?: number;
  granules?: number;
  readType?: string;
  initialParts?: number;
  selectedParts?: number;
  initialGranules?: number;
  selectedGranules?: number;
  indexCount: number;
  primaryKeyCondition?: string;
}

export interface ExplainPlanNode {
  id: string;
  nodeType: string;
  title: string;
  subtitle?: string;
  description?: string;
  sourceName?: string;
  keys: string[];
  aggregates: ExplainPlanAggregate[];
  expression?: ExplainPlanExpression;
  prewhere?: ExplainPlanPrewhereInfo;
  indexes: ExplainPlanIndex[];
  stats: ExplainPlanStats;
  skipMerging?: boolean;
  children: ExplainPlanNode[];
  raw: Record<string, unknown>;
}

export interface ExplainPlanParseResult {
  rootNodes: ExplainPlanNode[];
  nodeMap: Map<string, ExplainPlanNode>;
  parentMap: Map<string, string | undefined>;
  rawJsonText: string;
  parseError?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringProp(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function numberProp(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function booleanProp(record: Record<string, unknown>, key: string): boolean | undefined {
  const value = record[key];
  return typeof value === "boolean" ? value : undefined;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

function numberArray(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is number => typeof item === "number" && Number.isFinite(item));
}

function recordArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(isRecord);
}

function maxNumber(...values: Array<number | undefined>): number | undefined {
  const defined = values.filter((value): value is number => value !== undefined);
  if (defined.length === 0) {
    return undefined;
  }
  return Math.max(...defined);
}

function pluralize(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function parseExpression(record: Record<string, unknown>): ExplainPlanExpression | undefined {
  return parseExpressionRecord(record["Expression"]);
}

function parseExpressionRecord(expressionRecord: unknown): ExplainPlanExpression | undefined {
  if (!isRecord(expressionRecord)) {
    return undefined;
  }

  const inputs = recordArray(expressionRecord["Inputs"]).map((item) => ({
    name: stringProp(item, "Name") || "",
    type: stringProp(item, "Type") || "",
  }));
  const outputs = recordArray(expressionRecord["Outputs"]).map((item) => ({
    name: stringProp(item, "Name") || "",
    type: stringProp(item, "Type") || "",
  }));
  const actions = recordArray(expressionRecord["Actions"]).map((item) => ({
    nodeType: stringProp(item, "Node Type") || "UNKNOWN",
    resultType: stringProp(item, "Result Type"),
    resultName: stringProp(item, "Result Name"),
    arguments: numberArray(item["Arguments"]),
    removedArguments: numberArray(item["Removed Arguments"]),
    result: numberProp(item, "Result"),
    raw: item,
  }));
  const positions = numberArray(expressionRecord["Positions"]);

  return {
    inputs,
    outputs,
    actions,
    positions,
    raw: expressionRecord,
  };
}

function parsePrewhere(record: Record<string, unknown>): ExplainPlanPrewhereInfo | undefined {
  const prewhereRecord =
    (isRecord(record["Prewhere"]) && record["Prewhere"]) ||
    (isRecord(record["Prewhere info"]) && record["Prewhere info"]) ||
    (isRecord(record["Prewhere Info"]) && record["Prewhere Info"]);
  if (!prewhereRecord) {
    return undefined;
  }

  const filterRecord =
    (isRecord(prewhereRecord["Prewhere filter"]) && prewhereRecord["Prewhere filter"]) ||
    (isRecord(prewhereRecord["Filter"]) && prewhereRecord["Filter"]);
  const filterExpression =
    (filterRecord &&
      ((isRecord(filterRecord["Prewhere filter expression"]) &&
        filterRecord["Prewhere filter expression"]) ||
        (isRecord(filterRecord["Expression"]) && filterRecord["Expression"]))) ||
    (isRecord(prewhereRecord["Prewhere filter expression"]) &&
      prewhereRecord["Prewhere filter expression"]);

  const filter = parseExpressionRecord(filterExpression);
  if (!filter) {
    return undefined;
  }

  return {
    filter,
    raw: prewhereRecord,
  };
}

function parseAggregates(record: Record<string, unknown>): ExplainPlanAggregate[] {
  return recordArray(record["Aggregates"]).map((item) => {
    const functionRecord = isRecord(item["Function"]) ? item["Function"] : undefined;
    return {
      name: stringProp(item, "Name") || "",
      functionName: functionRecord ? stringProp(functionRecord, "Name") : undefined,
      argumentTypes: functionRecord ? stringArray(functionRecord["Argument Types"]) : [],
      resultType: functionRecord ? stringProp(functionRecord, "Result Type") : undefined,
      arguments: stringArray(item["Arguments"]),
      raw: item,
    };
  });
}

function parseIndexes(record: Record<string, unknown>): ExplainPlanIndex[] {
  return recordArray(record["Indexes"]).map((item) => ({
    type: stringProp(item, "Type") || "Unknown",
    condition: stringProp(item, "Condition"),
    initialParts: numberProp(item, "Initial Parts"),
    selectedParts: numberProp(item, "Selected Parts"),
    initialGranules: numberProp(item, "Initial Granules"),
    selectedGranules: numberProp(item, "Selected Granules"),
    raw: item,
  }));
}

function deriveSubtitle(
  nodeType: string,
  description: string | undefined,
  keys: string[],
  sourceName: string | undefined
): string | undefined {
  if (nodeType === "Aggregating" && keys.length > 0) {
    return `by ${keys.join(", ")}`;
  }

  if (description) {
    return `on ${description}`;
  }

  if (sourceName) {
    return `on ${sourceName}`;
  }

  return undefined;
}

function extractRoots(parsed: unknown): Record<string, unknown>[] {
  if (Array.isArray(parsed)) {
    return parsed.flatMap((item) => extractRoots(item));
  }

  if (!isRecord(parsed)) {
    return [];
  }

  const plan = parsed["Plan"];
  if (isRecord(plan)) {
    return [plan];
  }

  if (typeof parsed["Node Type"] === "string") {
    return [parsed];
  }

  return [];
}

function normalizeNode(
  rawNode: Record<string, unknown>,
  path: string,
  nodeMap: Map<string, ExplainPlanNode>,
  parentMap: Map<string, string | undefined>,
  parentId?: string
): ExplainPlanNode {
  const nodeType = stringProp(rawNode, "Node Type") || "Unknown";
  const description = stringProp(rawNode, "Description");
  const sourceName = nodeType === "ReadFromMergeTree" ? description : undefined;
  const keys = stringArray(rawNode["Keys"]);
  const indexes = parseIndexes(rawNode);
  const expression = parseExpression(rawNode);
  const prewhere = parsePrewhere(rawNode);
  const aggregates = parseAggregates(rawNode);
  const rawId = stringProp(rawNode, "Node Id") || `${nodeType}_${path}`;
  const id = nodeMap.has(rawId) ? `${rawId}_${path}` : rawId;

  const stats: ExplainPlanStats = {
    parts: numberProp(rawNode, "Parts"),
    granules: numberProp(rawNode, "Granules"),
    readType: stringProp(rawNode, "Read Type"),
    initialParts: maxNumber(...indexes.map((index) => index.initialParts)),
    selectedParts: maxNumber(
      numberProp(rawNode, "Parts"),
      ...indexes.map((index) => index.selectedParts)
    ),
    initialGranules: maxNumber(...indexes.map((index) => index.initialGranules)),
    selectedGranules: maxNumber(
      numberProp(rawNode, "Granules"),
      ...indexes.map((index) => index.selectedGranules)
    ),
    indexCount: indexes.length,
    primaryKeyCondition: indexes.find((index) => index.type === "PrimaryKey")?.condition,
  };

  const childNodes = recordArray(rawNode["Plans"]).map((child, index) =>
    normalizeNode(child, `${path}.${index}`, nodeMap, parentMap, id)
  );

  const node: ExplainPlanNode = {
    id,
    nodeType,
    title: nodeType,
    subtitle: deriveSubtitle(nodeType, description, keys, sourceName),
    description,
    sourceName,
    keys,
    aggregates,
    expression,
    prewhere,
    indexes,
    stats,
    skipMerging: booleanProp(rawNode, "Skip merging"),
    children: childNodes,
    raw: rawNode,
  };

  nodeMap.set(id, node);
  parentMap.set(id, parentId);

  return node;
}

export function parseExplainPlanResponse(data: unknown): ExplainPlanParseResult {
  const initialRawJsonText =
    typeof data === "string" ? data : data === undefined ? "" : JSON.stringify(data, null, 2);

  if (data === undefined || data === null || initialRawJsonText.trim().length === 0) {
    return {
      rootNodes: [],
      nodeMap: new Map(),
      parentMap: new Map(),
      rawJsonText: initialRawJsonText,
      parseError: "No plan data returned.",
    };
  }

  let parsed: unknown = data;
  if (typeof data === "string") {
    try {
      parsed = JSON.parse(data);
    } catch {
      return {
        rootNodes: [],
        nodeMap: new Map(),
        parentMap: new Map(),
        rawJsonText: initialRawJsonText,
        parseError: "The EXPLAIN PLAN response is not valid JSON.",
      };
    }
  }

  const roots = extractRoots(parsed);
  if (roots.length === 0) {
    return {
      rootNodes: [],
      nodeMap: new Map(),
      parentMap: new Map(),
      rawJsonText: JSON.stringify(parsed, null, 2),
      parseError: "The EXPLAIN PLAN response does not contain a Plan node.",
    };
  }

  const nodeMap = new Map<string, ExplainPlanNode>();
  const parentMap = new Map<string, string | undefined>();
  const rootNodes = roots.map((root, index) =>
    normalizeNode(root, `root.${index}`, nodeMap, parentMap)
  );

  return {
    rootNodes,
    nodeMap,
    parentMap,
    rawJsonText: JSON.stringify(parsed, null, 2),
  };
}

export function getExplainPlanNodeMetricLabel(node: ExplainPlanNode): string | undefined {
  const parts = node.stats.initialParts ?? node.stats.parts ?? node.stats.selectedParts;
  const granules = node.stats.initialGranules ?? node.stats.granules ?? node.stats.selectedGranules;

  if (parts !== undefined && granules !== undefined) {
    return `${pluralize(parts, "part", "parts")} / ${pluralize(granules, "granule", "granules")}`;
  }

  if (parts !== undefined) {
    return pluralize(parts, "part", "parts");
  }

  if (granules !== undefined) {
    return pluralize(granules, "granule", "granules");
  }

  return undefined;
}

export function getExplainPlanEdgeLabel(node: ExplainPlanNode): string | undefined {
  const parts = node.stats.parts ?? node.stats.selectedParts;
  const granules = node.stats.granules ?? node.stats.selectedGranules;

  if (parts !== undefined && granules !== undefined) {
    return `${pluralize(parts, "part", "parts")} / ${pluralize(granules, "granule", "granules")}`;
  }

  if (granules !== undefined) {
    return pluralize(granules, "granule", "granules");
  }

  if (parts !== undefined) {
    return pluralize(parts, "part", "parts");
  }

  return undefined;
}

export function getExplainPlanInitialEdgeLabel(node: ExplainPlanNode): string | undefined {
  const parts = node.stats.initialParts ?? node.stats.parts ?? node.stats.selectedParts;
  const granules = node.stats.initialGranules ?? node.stats.granules ?? node.stats.selectedGranules;

  if (parts !== undefined && granules !== undefined) {
    return `${pluralize(parts, "part", "parts")} / ${pluralize(granules, "granule", "granules")}`;
  }

  if (parts !== undefined) {
    return pluralize(parts, "part", "parts");
  }

  if (granules !== undefined) {
    return pluralize(granules, "granule", "granules");
  }

  return undefined;
}

export function getExplainPlanSummaryBadges(node: ExplainPlanNode): string[] {
  const summary: string[] = [];
  const metricLabel = getExplainPlanNodeMetricLabel(node);
  if (metricLabel) {
    summary.push(metricLabel);
  }
  if (node.stats.indexCount > 0) {
    summary.push(pluralize(node.stats.indexCount, "index", "indexes"));
  }
  if (node.stats.readType) {
    summary.push(node.stats.readType);
  }
  return summary;
}

export function getExplainPlanAncestorIds(
  nodeId: string | undefined,
  parentMap: Map<string, string | undefined>
): string[] {
  const ancestors: string[] = [];
  let current = nodeId ? parentMap.get(nodeId) : undefined;
  while (current) {
    ancestors.push(current);
    current = parentMap.get(current);
  }
  return ancestors;
}

export function countExplainPlanNodes(nodes: ExplainPlanNode[]): number {
  return nodes.reduce((count, node) => count + 1 + countExplainPlanNodes(node.children), 0);
}

export function getDefaultExpandedNodeIds(nodes: ExplainPlanNode[]): string[] {
  const totalNodes = countExplainPlanNodes(nodes);
  const expanded: string[] = [];

  function visit(currentNodes: ExplainPlanNode[], depth: number) {
    currentNodes.forEach((node) => {
      if (node.children.length === 0) {
        return;
      }
      if (totalNodes <= 12 || depth < 2) {
        expanded.push(node.id);
        visit(node.children, depth + 1);
      }
    });
  }

  visit(nodes, 0);
  return expanded;
}
