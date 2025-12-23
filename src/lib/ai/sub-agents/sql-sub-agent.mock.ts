import type { SQLSubAgentInput, SQLSubAgentOutput } from './types';

/**
 * Mock SQL Sub-Agent
 * Returns predefined SQL without calling the LLM
 */
export async function mockSqlSubAgent(input: SQLSubAgentInput): Promise<SQLSubAgentOutput> {
  console.log('🎭 Mock SQL sub-agent called with:', input);
  
  // Return mock SQL response
  const mockResponse: SQLSubAgentOutput = {
    sql: `SELECT
  toStartOfInterval(event_time, INTERVAL 60 SECOND)::INT as t,
  avg(ProfileEvent_Query) AS query_qps
FROM system.metric_log
WHERE event_date >= toDate(now() - 3600)
  AND event_time >= now() - 3600
GROUP BY t
ORDER BY t WITH FILL STEP 60`,
    notes: "Query calculates average queries per second over 1-minute intervals for the last hour",
    assumptions: ["Using ProfileEvent_Query metric for QPS calculation", "Aggregating to 60-second intervals"],
    needs_clarification: false,
    questions: [],
  };
  
  console.log('✅ Mock SQL sub-agent returning:', mockResponse);
  return mockResponse;
}

