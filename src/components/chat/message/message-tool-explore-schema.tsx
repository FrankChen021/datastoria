import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AppUIMessage } from "@/lib/ai/common-types";
import type {
  ExploreSchemaInput,
  ExploreSchemaOutput,
  TableSchemaInput,
} from "@/lib/ai/tools/client/explore-schema";
import { memo } from "react";
import type { ToolPart } from "../chat-message-types";
import { CollapsiblePart } from "./collapsible-part";

export const MessageToolExploreSchema = memo(function MessageToolExploreSchema({
  part,
}: {
  part: AppUIMessage["parts"][0];
}) {
  const toolPart = part as ToolPart & {
    input?: ExploreSchemaInput;
    output?: ExploreSchemaOutput;
  };
  const state = toolPart.state;
  const input = toolPart.input;
  const output = toolPart.output;

  return (
    <CollapsiblePart toolName={"Explore Schema"} state={state}>
      {input && input.tables && (
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
                  <TableHead className="h-7 px-2 font-bold text-muted-foreground border-r last:border-r-0">
                    columns(optional)
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {input.tables.map((t: TableSchemaInput, idx: number) => (
                  <TableRow key={idx} className="hover:bg-muted/30 border-b last:border-0">
                    <TableCell className="py-1 px-2 whitespace-nowrap border-r last:border-r-0">
                      {t.database}
                    </TableCell>
                    <TableCell className="py-1 px-2 whitespace-nowrap border-r last:border-r-0">
                      {t.table}
                    </TableCell>
                    <TableCell className="py-1 px-2 whitespace-nowrap border-r last:border-r-0">
                      {t.columns ? t.columns.join(", ") : ""}
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
              {output.map((table, tableIdx: number) => (
                <div key={tableIdx} className="mb-2 last:mb-0">
                  <div className="bg-muted/50 px-2 py-1 text-[10px] font-bold border-b">
                    {table.database}.{table.table} ({table.columns?.length || 0} columns)
                  </div>
                  {(table.primaryKey || table.partitionBy) && (
                    <div className="bg-muted/30 px-2 py-1.5 border-b text-[10px] space-y-0.5">
                      {table.primaryKey && (
                        <div className="flex gap-2">
                          <span className="font-semibold text-muted-foreground">Primary Key:</span>
                          <code className="text-xs bg-muted px-1 rounded">{table.primaryKey}</code>
                        </div>
                      )}
                      {table.partitionBy && (
                        <div className="flex gap-2">
                          <span className="font-semibold text-muted-foreground">Partition By:</span>
                          <code className="text-xs bg-muted px-1 rounded">{table.partitionBy}</code>
                        </div>
                      )}
                    </div>
                  )}
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
                      {table.columns?.map((col, colIdx: number) => (
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
