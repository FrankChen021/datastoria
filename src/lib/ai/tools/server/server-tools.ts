/**
 * Server-Side Tools for the skill-based agent (chat-v2).
 * Tool definitions live here; execution is implemented in the corresponding modules.
 */
import type { SkillProvider } from "@/lib/ai/skills/skill-provider";
import type { SkillCatalogItem } from "@/lib/ai/skills/skill-types";
import type { CodeSearchContext } from "@/lib/code-search/code-search-factory";
import { tool } from "ai";
import { z } from "zod";
import { createCodeSearchTools } from "./code-search-tools";
import {
  buildSkillResourceToolDescription,
  buildSkillToolDescription,
  createSkillResourceToolExecutor,
  createSkillToolExecutor,
} from "./skill-tool";

type BaseServerTools = ReturnType<typeof createBaseServerTools>;
type OptionalCodeSearchTools = Partial<ReturnType<typeof createCodeSearchTools>>;

function createBaseServerTools(provider: SkillProvider, skills: SkillCatalogItem[]) {
  return {
    skill: tool({
      description: buildSkillToolDescription(skills),
      inputSchema: z.object({
        names: z
          .array(z.string())
          .min(1)
          .describe(
            "Skill name(s) to load (e.g. ['optimization'] or ['optimization', 'visualization'])."
          ),
      }),
      execute: createSkillToolExecutor(provider),
    }),

    skill_resource: tool({
      description: buildSkillResourceToolDescription(),
      inputSchema: z.object({
        resources: z
          .array(
            z.object({
              skill: z
                .string()
                .describe(
                  "Skill name (frontmatter `name` or folder name), e.g. 'clickhouse-best-practices'."
                ),
              paths: z
                .array(z.string())
                .min(1)
                .describe(
                  "Relative paths within that skill, e.g. ['AGENTS.md', 'rules/schema-pk-plan-before-creation.md']."
                ),
            })
          )
          .min(1)
          .describe("Resource requests: each has a skill name and relative paths to load."),
      }),
      execute: createSkillResourceToolExecutor(provider),
    }),
  };
}

export function createServerTools(
  provider: SkillProvider,
  skills: SkillCatalogItem[],
  codeSearchContext?: CodeSearchContext | null
): BaseServerTools & OptionalCodeSearchTools {
  const baseTools = createBaseServerTools(provider, skills);

  if (!codeSearchContext) {
    return baseTools;
  }

  return {
    ...baseTools,
    ...createCodeSearchTools({
      provider: codeSearchContext.provider,
      maxSearchResults: codeSearchContext.config.maxSearchResults,
    }),
  };
}
