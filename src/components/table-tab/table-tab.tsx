import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PartitionSizeView } from "./partition-view";
import { TableMetadataView } from "./table-metadata-view";
import { TableSizeView } from "./table-size-view";

export interface TableTabProps {
  database: string;
  table: string;
  engine?: string;
  tabId?: string;
}

export function TableTab({ database, table, engine }: TableTabProps) {
  // Hide Table Size and Partitions tabs if engine starts with "System"
  const isSystemTable = engine?.startsWith("System") ?? false;

  return (
    <div className="h-full w-full flex flex-col overflow-hidden">
      <Tabs defaultValue="metadata" className="flex flex-col flex-1 overflow-hidden">
        <TabsList className="mx-2 mt-2 justify-start w-fit">
          <TabsTrigger value="metadata">Metadata</TabsTrigger>
          {!isSystemTable && <TabsTrigger value="table-size">Table Size</TabsTrigger>}
          {!isSystemTable && <TabsTrigger value="partitions">Partitions</TabsTrigger>}
          <TabsTrigger value="query-log">Query Log</TabsTrigger>
          <TabsTrigger value="part-log">Part Log</TabsTrigger>
        </TabsList>
        <TabsContent value="metadata" className="flex-1 overflow-auto p-2 space-y-2 mt-0">
          <TableMetadataView database={database} table={table} />
        </TabsContent>
        {!isSystemTable && (
          <TabsContent value="table-size" className="flex-1 overflow-auto p-2 mt-0">
            <TableSizeView database={database} table={table} />
          </TabsContent>
        )}
        {!isSystemTable && (
          <TabsContent value="partitions" className="flex-1 overflow-auto p-2 mt-0">
            <PartitionSizeView database={database} table={table} />
          </TabsContent>
        )}
        <TabsContent value="query-log" className="flex-1 overflow-auto p-4 mt-2">
          <div className="h-full flex items-center justify-center text-muted-foreground">
            Query Log content coming soon
          </div>
        </TabsContent>
        <TabsContent value="part-log" className="flex-1 overflow-auto p-4 mt-2">
          <div className="h-full flex items-center justify-center text-muted-foreground">
            Part Log content coming soon
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
