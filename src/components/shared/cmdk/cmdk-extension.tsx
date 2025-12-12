import { TextHighlighter } from "@/lib/text-highlighter";
import { useCommandState } from "cmdk";
import NumberFlow from '@number-flow/react';

export const CommandItemCount: React.FC<React.PropsWithChildren> = ({ children }) => {
    const filterCount = useCommandState((state) => state.filtered.count);
  
    return (
      <>
        {/* The style is from CommandItem */}
        {/* No set pb-1 because we want remove space between this component and the CommandItems below this component */}
        <div className="relative flex cursor-default select-none items-center rounded-sm px-2 pt-1 text-sm outline-none data-[disabled=true]:pointer-events-none data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground data-[disabled=true]:opacity-50 text-center text-xs text-muted-foreground">
          <NumberFlow value={filterCount} />
          &nbsp;item(s) found
          {children}
        </div>
      </>
    );
  };

export const HighlightableCommandItem: React.FC<{ text: string }> = ({ text }) => {
  const search = useCommandState((state) => state.search);
  return TextHighlighter.highlight(text, search, "text-yellow-500");
};