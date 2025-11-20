import { Card, CardDescription, CardHeader } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";
import { type ReactNode, useState } from "react";

export interface CollapsibleSectionProps {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
  fullHeight?: boolean;
}

export function CollapsibleSection({ title, children, defaultOpen = true, className, fullHeight }: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <Card className={cn("@container/card relative overflow-hidden", fullHeight ? (isOpen ? "flex flex-col flex-1 min-h-0" : "flex-none") : "", className)}>
      <Collapsible
        open={isOpen}
        onOpenChange={setIsOpen}
        className={cn(fullHeight && "flex-1 flex flex-col min-h-0")}
      >
        <CardHeader className="p-0">
          <CollapsibleTrigger className="w-full">
            <div className={cn("flex items-center p-2 bg-muted/50 transition-colors gap-2 hover:bg-muted")}>
              <ChevronRight
                className={cn("h-4 w-4 transition-transform duration-200 shrink-0", isOpen && "rotate-90")}
              />
              <div className="flex-1 text-left">
                <CardDescription className={cn("font-semibold text-foreground m-0")}>{title}</CardDescription>
              </div>
            </div>
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent className={cn(fullHeight && "flex-1 flex flex-col min-h-0")}>
          {children}
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
