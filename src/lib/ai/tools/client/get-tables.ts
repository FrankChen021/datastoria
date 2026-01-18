import { escapeSqlString, type ToolExecutor } from "./client-tool-types";

export type GetTablesInput = {
  name_pattern?: string;
  database?: string;
  engine?: string;
  partition_key?: string;
  limit?: number;
};

export type GetTablesOutput = Array<{
  database: string;
  table: string;
  engine: string;
  partition_key?: string;
}>;

type JsonCompactResponse = {
  data: unknown[][];
};

export const getTablesExecutor: ToolExecutor<GetTablesInput, GetTablesOutput> = async (
  input,
  connection
) => {
  const { name_pattern, database, engine, partition_key, limit = 100 } = input;

  // Build WHERE clause with filters
  const whereClauses: string[] = ["NOT startsWith(table, '.inner')"];
  
  if (name_pattern) {
    whereClauses.push(`name LIKE '${escapeSqlString(name_pattern)}'`);
  }
  if (database) {
    whereClauses.push(`database = '${escapeSqlString(database)}'`);
  }
  if (engine) {
    whereClauses.push(`engine LIKE '${escapeSqlString(engine)}%'`);
  }
  if (partition_key) {
    whereClauses.push(`partition_key LIKE '${escapeSqlString(partition_key)}'`);
  }

  const whereClause = whereClauses.join(' AND ');

  // Build SQL query to get tables with metadata
  const sql = `
SELECT 
  database,
  name as table,
  engine,
  partition_key
FROM system.tables
WHERE ${whereClause}
ORDER BY database, name
LIMIT ${limit}`;

  try {
    const { response } = connection.query(sql, { default_format: "JSONCompact" });
    const apiResponse = await response;
    const responseData = apiResponse.data.json() as JsonCompactResponse;

    // Validate response structure
    // JSONCompact format returns { data: [[...], [...]] }
    if (!responseData || !Array.isArray(responseData.data)) {
      console.error("Unexpected response format from get_tables:", responseData);
      return [];
    }

    const data = responseData.data;
    const tables = data.map((row: unknown) => {
      const rowArray = row as unknown[];
      return {
        database: String(rowArray[0] || ""),
        table: String(rowArray[1] || ""),
        engine: String(rowArray[2] || ""),
        partition_key: rowArray[3] ? String(rowArray[3]) : undefined,
      };
    });

    return tables;
  } catch (error) {
    console.error("Error executing get_tables tool:", error);
    return [];
  }
};
