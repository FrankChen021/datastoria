import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CLIENT_TOOL_NAMES } from "@/lib/ai/client-tools";
import type { AppUIMessage } from "@/lib/ai/common-types";
import { memo } from "react";
import type { ToolPart } from "../chat-message-types";
import { CollapsiblePart } from "./collapsible-part";

type TableInput = {
  database: string;
  table: string;
};

type TableColumnOutput = Array<{
  database: string;
  table: string;
  columns: Array<{ name: string; type: string }>;
}>;

export const MessageToolGetTableColumns = memo(function MessageToolGetTableColumns({
  part,
}: {
  part: AppUIMessage["parts"][0];
}) {
  const toolPart = part as ToolPart & {
    input?: { tablesAndSchemas: TableInput[] };
    output?: TableColumnOutput;
  };
  const state = toolPart.state;
  const input = toolPart.input;
  const output = toolPart.output;
  const inputTables = input?.tablesAndSchemas ?? null;

  return (
    <CollapsiblePart toolName={CLIENT_TOOL_NAMES.GET_TABLE_COLUMNS} state={state}>
      {inputTables && (
        <>
          <div className="mb-0.5 text-[10px] text-muted-foreground">input:</div>
          <div className="border rounded-md overflow-hidden bg-background ml-[0.5rem]">
            <Table className="text-[11px]">
              <TableHeader className="bg-muted/50">
                <TableRow className="hover:bg-transparent border-b">
                  <TableHead className="h-7 px-2 font-bold text-muted-foreground border-r last:border-r-0">
                    database
                  </TableHead>
                  <TableHead className="h-7 px-2 font-bold text-muted-foreground border-r last:border-r-0">
                    table
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {inputTables.map((t: TableInput, idx: number) => (
                  <TableRow key={idx} className="hover:bg-muted/30 border-b last:border-0">
                    <TableCell className="py-1 px-2 whitespace-nowrap border-r last:border-r-0">
                      {t.database}
                    </TableCell>
                    <TableCell className="py-1 px-2 whitespace-nowrap border-r last:border-r-0">
                      {t.table}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
      {output && Array.isArray(output) && (
        <>
          <div className="mt-2 text-[10px] text-muted-foreground">output:</div>
          <div className="border rounded-md overflow-hidden bg-background ml-[0.5rem]">
            <div className="max-h-[300px] overflow-auto">
              {output.map((tableGroup, tableIdx: number) => (
                <div key={tableIdx} className="mb-2 last:mb-0">
                  <div className="bg-muted/50 px-2 py-1 text-[10px] font-bold border-b">
                    {tableGroup.database}.{tableGroup.table} ({tableGroup.columns?.length || 0}{" "}
                    columns)
                  </div>
                  <Table className="text-[11px]">
                    <TableHeader className="bg-muted/30">
                      <TableRow className="hover:bg-transparent border-b">
                        <TableHead className="h-7 px-2 font-bold text-muted-foreground border-r last:border-r-0">
                          name
                        </TableHead>
                        <TableHead className="h-7 px-2 font-bold text-muted-foreground border-r last:border-r-0">
                          type
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tableGroup.columns?.map((col, colIdx: number) => (
                        <TableRow key={colIdx} className="hover:bg-muted/30 border-b last:border-0">
                          <TableCell className="py-1 px-2 whitespace-nowrap border-r last:border-r-0">
                            {col.name}
                          </TableCell>
                          <TableCell className="py-1 px-2 whitespace-nowrap border-r last:border-r-0">
                            {col.type}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </CollapsiblePart>
  );
});
