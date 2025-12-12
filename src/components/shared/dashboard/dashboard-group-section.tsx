import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";
import { type ReactNode, useState } from "react";

export interface DashboardGroupSectionProps {
  title: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
  titleClassName?: string;
}

export function DashboardGroupSection({
  title,
  children,
  defaultOpen = true,
  className,
  titleClassName,
}: DashboardGroupSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className={cn("w-full", className)}>
      <CollapsibleTrigger className="w-full cursor-pointer">
        <div
          className={cn(
            "flex items-center p-2 transition-colors gap-1",
            !isOpen && "bg-muted/50 hover:bg-muted/70"
          )}
        >
          <ChevronRight
            className={cn(
              "h-4 w-4 transition-transform duration-200 shrink-0",
              isOpen && "rotate-90"
            )}
          />
          <h3 className={cn("text-md font-semibold", titleClassName)}>{title}</h3>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent className="w-full py-1">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

