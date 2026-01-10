import { Card, CardDescription, CardHeader } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { DependencyView } from "./dependency-view";

export interface CollapsibleDependencyViewProps {
  database: string;
  defaultOpen?: boolean;
  className?: string;
}

export function CollapsibleDependencyView({
  database,
  defaultOpen = false,
  className,
}: CollapsibleDependencyViewProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <Card className={cn("@container/card relative overflow-hidden", className)}>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CardHeader className="p-0">
          <CollapsibleTrigger className="w-full">
            <div
              className={cn(
                "flex items-center p-3 bg-muted/50 transition-colors gap-2 hover:bg-muted"
              )}
            >
              <ChevronRight
                className={cn(
                  "h-4 w-4 transition-transform duration-200 shrink-0",
                  isOpen && "rotate-90"
                )}
              />
              <div className="flex-1 text-left">
                <CardDescription className={cn("font-semibold text-foreground m-0")}>
                  Table Dependencies
                </CardDescription>
              </div>
            </div>
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent>
          {isOpen && (
            <div className="h-[800px]">
              <DependencyView database={database} />
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
