import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AppUIMessage } from "@/lib/ai/common-types";
import type { GetTablesInput, GetTablesOutput } from "@/lib/ai/tools/client/get-tables";
import { memo } from "react";
import type { ToolPart } from "../chat-message-types";
import { CollapsiblePart } from "./collapsible-part";

export const MessageToolGetTables = memo(function MessageToolGetTables({
  part,
}: {
  part: AppUIMessage["parts"][0];
}) {
  const toolPart = part as ToolPart & {
    input?: GetTablesInput;
    output?: GetTablesOutput;
  };
  const state = toolPart.state;
  const input = toolPart.input;
  const output = toolPart.output;

  return (
    <CollapsiblePart toolName={"Get Tables"} state={state}>
      {input &&
        (input.name_pattern ||
          input.database ||
          input.engine ||
          input.partition_key ||
          input.limit !== undefined) && (
          <div className="mb-2 text-[10px]">
            <div className="text-muted-foreground">input:</div>
            <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0 ml-2">
              {input.name_pattern && (
                <>
                  <div className="text-muted-foreground font-medium">name_pattern:</div>
                  <div className="">{input.name_pattern}</div>
                </>
              )}
              {input.database && (
                <>
                  <div className="text-muted-foreground font-medium">database:</div>
                  <div className="">{input.database}</div>
                </>
              )}
              {input.engine && (
                <>
                  <div className="text-muted-foreground font-medium">engine:</div>
                  <div className="">{input.engine}</div>
                </>
              )}
              {input.partition_key && (
                <>
                  <div className="text-muted-foreground font-medium">partition_key:</div>
                  <div className="">{input.partition_key}</div>
                </>
              )}
              {input.limit !== undefined && (
                <>
                  <div className="text-muted-foreground font-medium">limit:</div>
                  <div className="">{input.limit}</div>
                </>
              )}
            </div>
          </div>
        )}
      {output && Array.isArray(output) && (
        <>
          <div className="mt-1 text-[10px] text-muted-foreground">
            output: {output.length} tables
          </div>
          <div className="border rounded-md overflow-hidden bg-background">
            <div className="max-h-[300px] overflow-auto">
              <Table className="text-[11px]">
                <TableHeader className="bg-muted/50 sticky top-0 z-10">
                  <TableRow className="hover:bg-transparent border-b">
                    <TableHead className="h-7 px-2 font-bold text-muted-foreground">
                      database
                    </TableHead>
                    <TableHead className="h-7 px-2 font-bold text-muted-foreground">
                      table
                    </TableHead>
                    <TableHead className="h-7 px-2 font-bold text-muted-foreground">
                      engine
                    </TableHead>
                    <TableHead className="h-7 px-2 font-bold text-muted-foreground">
                      partition_key
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {output.map((row, idx: number) => (
                    <TableRow key={idx} className="hover:bg-muted/30 border-b last:border-0">
                      <TableCell className="py-1 px-2 whitespace-nowrap">{row.database}</TableCell>
                      <TableCell className="py-1 px-2 whitespace-nowrap">{row.table}</TableCell>
                      <TableCell className="py-1 px-2 whitespace-nowrap">{row.engine}</TableCell>
                      <TableCell className="py-1 px-2 text-xs">
                        {row.partition_key || "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </>
      )}
    </CollapsiblePart>
  );
});
