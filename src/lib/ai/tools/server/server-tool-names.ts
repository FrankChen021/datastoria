/**
 * Server tool name constants. Safe to import from client code (no Node.js or server-only deps).
 * Tool definitions and execution live in server-tools.ts and skill-tool.ts.
 */
export const SERVER_TOOL_NAMES = {
  GENERATE_SQL: "generate_sql",
  GENERATE_VISUALIZATION: "generate_visualization",
  OPTIMIZE_SQL: "optimize_sql",
  PLAN: "plan",
  SKILL: "skill",
  SKILL_RESOURCE: "skill_resource",
} as const;
