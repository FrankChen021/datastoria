import { z } from 'zod';

/**
 * SQL Sub-Agent Output Schema
 * 
 * Defines the structure of responses from the SQL generation sub-agent
 */
export const sqlSubAgentOutputSchema = z.object({
    sql: z.string().describe('Generated ClickHouse SQL query'),
    notes: z.string().describe('Explanation of the query logic'),
    assumptions: z.array(z.string()).describe('Assumptions made during query generation'),
    needs_clarification: z.boolean().describe('Whether user clarification is needed'),
    questions: z.array(z.string()).describe('Questions for the user if clarification needed'),
});

export type SQLSubAgentOutput = z.infer<typeof sqlSubAgentOutputSchema>;

/**
 * Visualization Sub-Agent Output Schema
 * 
 * Defines the structure for visualization intent
 * Matches TimeseriesDescriptor and TableDescriptor from dashboard-model.ts
 */
export const vizSubAgentOutputSchema = z.object({
    type: z.enum(['line', 'bar', 'area', 'table', 'none']).describe('Visualization type'),
    titleOption: z.object({
        title: z.string(),
        align: z.enum(['left', 'center', 'right']),
    }).optional().describe('Chart title configuration'),
    width: z.number().min(1).max(12).optional().describe('Grid width (1-12)'),
    legendOption: z.object({
        placement: z.enum(['none', 'bottom', 'right']),
        values: z.array(z.enum(['min', 'max', 'sum', 'avg', 'count'])).optional().describe('Statistics to show in legend (e.g., ["min", "max", "sum"])'),
    }).optional().describe('Legend configuration'),
    query: z.object({
        sql: z.string(),
    }).describe('SQL query that generated this data'),
    yAxis: z.array(z.object({
        min: z.number().optional(),
        max: z.number().optional(),
        minInterval: z.number().optional(),
    })).optional().describe('Y-axis configuration for timeseries'),
});

export type VizSubAgentOutput = z.infer<typeof vizSubAgentOutputSchema>;

/**
 * Run SQL Result Schema
 * 
 * Defines the structure of SQL execution results from client
 */
export const runSQLResultSchema = z.object({
    columns: z.array(z.object({
        name: z.string(),
        type: z.string(),
    })).describe('Column metadata'),
    rows: z.array(z.record(z.unknown())).optional().describe('Result rows'),
    rowCount: z.number().describe('Total number of rows'),
    sampleRow: z.record(z.unknown()).optional().describe('Sample row for analysis'),
    error: z.string().optional().describe('Error message if query failed'),
});

export type RunSQLResult = z.infer<typeof runSQLResultSchema>;

/**
 * SQL Sub-Agent Input
 */
export interface SQLSubAgentInput {
    userQuestion: string;
    schemaHints?: {
        database?: string;
        tables?: Array<{ name: string; columns: string[] }>;
    };
    history?: any[]; // CoreMessage[]
}

/**
 * Visualization Sub-Agent Input
 */
export interface VizSubAgentInput {
    userQuestion: string;
    sql: string;
}
