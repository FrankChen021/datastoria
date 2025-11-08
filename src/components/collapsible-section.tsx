import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";
import { type ReactNode, useState } from "react";

export interface CollapsibleSectionProps {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}

export function CollapsibleSection({ title, children, defaultOpen = true, className }: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className={cn("border rounded-md", className)}>
        <CollapsibleTrigger className="w-full">
          <div className="flex items-center p-3 bg-muted/50 transition-colors gap-2 hover:bg-muted rounded-md">
            <ChevronRight className={`h-4 w-4 transition-transform duration-200 shrink-0 ${isOpen ? "rotate-90" : ""}`} />
            <h3 className="text-md font-semibold">{title}</h3>
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>{children}</CollapsibleContent>
      </div>
    </Collapsible>
  );
}
