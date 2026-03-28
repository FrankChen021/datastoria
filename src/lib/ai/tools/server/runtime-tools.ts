import { ClientTools } from "@/lib/ai/tools/client/client-tools";
import { SERVER_TOOL_NAMES } from "@/lib/ai/tools/server/server-tool-names";

export function getRuntimeAvailableToolNames(options: { codeSearchEnabled: boolean }): Set<string> {
  const toolNames = new Set<string>([
    ...Object.keys(ClientTools),
    SERVER_TOOL_NAMES.SKILL,
    SERVER_TOOL_NAMES.SKILL_RESOURCE,
  ]);

  if (options.codeSearchEnabled) {
    toolNames.add(SERVER_TOOL_NAMES.SEARCH_FILE);
    toolNames.add(SERVER_TOOL_NAMES.READ_FILE);
  }

  return toolNames;
}
