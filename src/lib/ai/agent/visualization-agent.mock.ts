import type { VisualizationAgentInput, VisualizationAgentOutput } from "./visualization-agent";

/**
 * Mock Visualization Agent
 * Returns predefined visualization config without calling the LLM
 */
export async function mockVisualizationAgent(
  input: VisualizationAgentInput
): Promise<VisualizationAgentOutput> {
  console.log("🎭 Mock Visualization agent called with:", input);

  // Return mock visualization response
  const mockResponse: VisualizationAgentOutput = {
    type: "line",
    titleOption: {
      title: "Queries/second",
      align: "center",
    },
    width: 6,
    legendOption: {
      placement: "none",
    },
    datasource: {
      sql: input.sql,
    },
  };

  console.log("✅ Mock Visualization agent returning:", mockResponse);
  return mockResponse;
}
