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

type TableOutput = Array<{
  database: string;
  table: string;
  engine: string;
  comment: string | null;
}>;

export const MessageToolGetTables = memo(function MessageToolGetTables({
  part,
}: {
  part: AppUIMessage["parts"][0];
}) {
  const toolPart = part as ToolPart & {
    input?: { database?: string };
    output?: TableOutput;
  };
  const state = toolPart.state;
  const input = toolPart.input;
  const output = toolPart.output;

  return (
    <CollapsiblePart toolName={CLIENT_TOOL_NAMES.GET_TABLES} state={state}>
      {input && (
        <div className="mb-0.5 text-[10px] text-muted-foreground">input: {input.database}</div>
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
                      comment
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {output.map((row, idx: number) => (
                    <TableRow key={idx} className="hover:bg-muted/30 border-b last:border-0">
                      <TableCell className="py-1 px-2 font-mono whitespace-nowrap">
                        {row.database}
                      </TableCell>
                      <TableCell className="py-1 px-2 font-mono whitespace-nowrap">
                        {row.table}
                      </TableCell>
                      <TableCell className="py-1 px-2 font-mono whitespace-nowrap text-muted-foreground">
                        {row.engine}
                      </TableCell>
                      <TableCell className="py-1 px-2 text-muted-foreground min-w-[100px]">
                        {row.comment || "-"}
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
