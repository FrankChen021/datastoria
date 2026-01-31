/**
 * Server-Side Tools for the skill-based agent (chat-v2).
 * Tool definitions live here; execution is implemented in the corresponding modules (e.g. skill-tool).
 */
import { tool } from "ai";
import { z } from "zod";
import { SkillTool } from "./skill-tool";

export const ServerTools = {
  skill: tool({
    description: SkillTool.getToolDescription(),
    inputSchema: z.object({
      names: z
        .array(z.string())
        .min(1)
        .describe(
          "Skill name(s) to load (e.g. ['sql-generation'] or ['sql-generation', 'visualization'])"
        ),
    }),
    execute: SkillTool.execute,
  }),
};
