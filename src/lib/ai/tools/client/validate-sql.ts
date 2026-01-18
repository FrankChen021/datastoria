import { QueryError } from "@/lib/connection/connection";
import type { ToolExecutor } from "./client-tool-types";

type ValidateSqlInput = {
  sql: string;
};

type ValidateSqlOutput = {
  success: boolean;
  error?: string;
};

/**
 * Extract ProfileEvents identifiers from SQL like ProfileEvents['xxx']
 */
function extractProfileEvents(sql: string): string[] {
  const pattern = /ProfileEvents\['([^']+)'\]/gi;
  const matches = new Set<string>();
  let match;

  while ((match = pattern.exec(sql)) !== null) {
    matches.add(match[1]);
  }

  return Array.from(matches);
}

/**
 * Validate ProfileEvents identifiers exist in system.events table.
 * Currently it only checks ProfileEvents['xxx'] pattern
 * for pattern like has(ProfileEvents.keys, 'xxx'), it's not supported now
 */
function validateProfileEvents(
  sql: string,
  availableEvents?: Set<string>
): { success: boolean; error?: string } {
  const inputEvents = extractProfileEvents(sql);

  if (inputEvents.length === 0) {
    return { success: true };
  }

  // If no cached events available, skip validation
  if (!availableEvents || availableEvents.size === 0) {
    return { success: true };
  }

  // Find missing events
  const missingEvents = inputEvents.filter((eventName) => !availableEvents.has(eventName));

  if (missingEvents.length > 0) {
    const eventNames = missingEvents.join(", ");

    // Suggest similar events if available
    let suggestion = "";
    if (missingEvents.length === 1) {
      const missing = missingEvents[0].toLowerCase();
      const similar = Array.from(availableEvents)
        .filter((e) => e.toLowerCase().includes(missing) || missing.includes(e.toLowerCase()))
        .slice(0, 5);
      if (similar.length > 0) {
        suggestion = ` Did you mean: ${similar.join(", ")}?`;
      }
    }

    return {
      success: false,
      error: `ProfileEvents not found in system.events table: ${eventNames}.${suggestion} Query system.events table to find the correct event names.`,
    };
  }

  return { success: true };
}

export const validateSqlExecutor: ToolExecutor<ValidateSqlInput, ValidateSqlOutput> = async (
  input,
  connection
) => {
  try {
    const { sql } = input;

    // First, validate SQL syntax
    const { response } = connection.query("EXPLAIN SYNTAX " + sql);
    await response;

    // Validate ProfileEvents using cached events from connection metadata
    const profileEventsResult = validateProfileEvents(sql, connection.metadata.profileEvents);
    if (!profileEventsResult.success) {
      return profileEventsResult;
    }

    return {
      success: true,
    };
  } catch (error) {
    if (error instanceof QueryError && (error as QueryError).data) {
      return {
        error: (error as QueryError).data,
        success: false,
      };
    }
    console.error("Error executing validate_sql tool:", error);
    return {
      error: error instanceof Error ? error.message : "Unknown error",
      success: false,
    };
  }
};
