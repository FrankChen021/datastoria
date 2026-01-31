/**
 * Server tool name constants. Safe to import from client code (no Node.js or server-only deps).
 * Tool definitions and execution live in server-tools.ts and skill-tool.ts.
 */
export const SERVER_TOOL_NAMES = {
  SKILL: "skill",
} as const;
