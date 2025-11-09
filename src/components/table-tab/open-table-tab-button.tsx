import { TabManager } from "@/components/tab-manager";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";
import { memo, useMemo } from "react";

export interface OpenTableTabButtonProps {
  database: string;
  table: string;
  engine?: string;
  showDatabase?: boolean;
  maxLength?: number;
  className?: string;
  variant?: "link" | "button" | "shadcn-link";
}

/**
 * Truncates text to show first and last parts when it exceeds maxLength.
 * Example: "verylongtablenamethatexceedsmaxlength" with maxLength=20 becomes "verylongtabl...maxlength"
 */
function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }

  // Reserve space for ellipsis (3 chars) and ensure we have meaningful parts
  const ellipsisLength = 3;
  const minPartLength = 4; // Minimum length for first and last parts

  // If maxLength is too small, just truncate with ellipsis
  if (maxLength < minPartLength * 2 + ellipsisLength) {
    return text.slice(0, maxLength - ellipsisLength) + "...";
  }

  // Calculate how much space we have for each part
  const availableLength = maxLength - ellipsisLength;
  const firstPartLength = Math.floor(availableLength / 2);
  const lastPartLength = availableLength - firstPartLength;

  const firstPart = text.slice(0, firstPartLength);
  const lastPart = text.slice(-lastPartLength);

  return `${firstPart}...${lastPart}`;
}

/**
 * A reusable button component that opens a table tab when clicked.
 * Displays the table name (optionally with database) with an external link icon.
 * Automatically truncates long names to show first and last parts.
 */
export const OpenTableTabButton = memo(
  ({
    database,
    table,
    engine,
    showDatabase = false,
    maxLength = 40,
    className = "",
    variant = "link",
  }: OpenTableTabButtonProps) => {
    const handleClick = () => {
      TabManager.sendOpenTableTabRequest(database, table, engine);
    };

    const displayText = useMemo(() => {
      const fullName = showDatabase ? `${database}.${table}` : table;
      return truncateText(fullName, maxLength);
    }, [database, table, showDatabase, maxLength]);

    const title = `Open table ${database}.${table}`;

    if (variant === "shadcn-link") {
      return (
        <Button
          variant="link"
          className={`font-semibold h-auto p-0 text-left flex items-center ${className}`}
          onClick={handleClick}
          title={title}
        >
          {displayText}
          <ExternalLink className="h-4 w-4 flex-shrink-0" />
        </Button>
      );
    }

    // Default variant: link (plain button with underline)
    return (
      <button
        onClick={handleClick}
        className={`text-left text-primary underline decoration-dotted cursor-pointer flex items-center gap-1 ${className}`}
        title={title}
      >
        {displayText}
        <ExternalLink className="h-4 w-4 flex-shrink-0" />
      </button>
    );
  }
);

OpenTableTabButton.displayName = "OpenTableTabButton";

