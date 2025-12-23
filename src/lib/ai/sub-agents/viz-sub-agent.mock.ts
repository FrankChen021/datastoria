import type { VizSubAgentInput, VizSubAgentOutput } from './types';

/**
 * Mock Visualization Sub-Agent
 * Returns predefined visualization config without calling the LLM
 */
export async function mockVizSubAgent(input: VizSubAgentInput): Promise<VizSubAgentOutput> {
  console.log('🎭 Mock Viz sub-agent called with:', input);
  
  // Return mock visualization response
  const mockResponse: VizSubAgentOutput = {
    type: "line",
    titleOption: {
      title: "Queries/second",
      align: "center",
    },
    width: 6,
    legendOption: {
      placement: "none",
    },
    query: {
      sql: input.sql,
    },
  };
  
  console.log('✅ Mock Viz sub-agent returning:', mockResponse);
  return mockResponse;
}

