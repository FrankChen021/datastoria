import { tool } from 'ai';
import { z } from 'zod';
import { sqlSubAgent } from './sub-agents/sql-sub-agent';
import { vizSubAgent } from './sub-agents/viz-sub-agent';
import { mockSqlSubAgent } from './sub-agents/sql-sub-agent.mock';
import { mockVizSubAgent } from './sub-agents/viz-sub-agent.mock';
import { runSQLResultSchema } from './sub-agents/types';
import { isMockMode } from './provider';

/**
 * Server-Side Tools
 * 
 * These tools are executed on the server and can call sub-agents
 * for complex reasoning tasks.
 */

/**
 * Server-side tool: SQL Generation
 * Calls the SQL sub-agent to generate ClickHouse queries
 */
export const generateSqlTool = tool({
    description: 'Generate ClickHouse SQL query based on user question and schema context',
    inputSchema: z.object({
        userQuestion: z.string().describe('The user\'s question or data request'),
        schemaHints: z.object({
            database: z.string().optional().describe('Current database name'),
            tables: z.array(z.object({
                name: z.string(),
                columns: z.array(z.string()),
            })).optional().describe('Available tables and their columns'),
        }).optional().describe('Schema context to help generate accurate SQL'),
        history: z.array(z.object({
            role: z.string(),
            content: z.string(),
        })).optional().describe('Previous turns of the SQL generation/discovery process'),
    }),
    execute: async ({ userQuestion, schemaHints, history }) => {
        console.log('🔧 generate_sql tool called:', userQuestion);
        console.log('📚 History received:', history ? `${history.length} messages` : 'none');
        if (history && history.length > 0) {
            console.log('📜 Last history item:', JSON.stringify(history[history.length - 1]).substring(0, 300));
        }
        // Use mock sub-agent in mock mode to avoid recursive LLM calls
        const result = isMockMode 
            ? await mockSqlSubAgent({ userQuestion, schemaHints, history })
            : await sqlSubAgent({ userQuestion, schemaHints, history });
        console.log('✅ generate_sql tool result:', result);
        return result;
    },
});


/**
 * Server-side tool: Visualization Planning
 * Calls the viz sub-agent to determine appropriate visualization
 */
export const generateVisualizationTool = tool({
    description: 'Analyze query logic and determine the best visualization type',
    inputSchema: z.object({
        userQuestion: z.string().describe('The original user question'),
        sql: z.string().describe('The SQL query to visualize'),
    }),
    execute: async ({ userQuestion, sql }) => {
        console.log('🔧 generate_visualization tool called for SQL:', sql);
        // Use mock sub-agent in mock mode to avoid recursive LLM calls
        const result = isMockMode
            ? await mockVizSubAgent({ userQuestion, sql })
            : await vizSubAgent({ userQuestion, sql });
        console.log('✅ generate_visualization tool result:', result);
        return result;
    },
});
