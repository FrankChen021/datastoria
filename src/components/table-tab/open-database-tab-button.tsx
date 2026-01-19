import { Dialog } from "@/components/shared/use-dialog";
import { TabManager } from "@/components/tab-manager";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";
import { memo, useMemo } from "react";

export interface OpenDatabaseTabButtonProps {
  database: string;
  maxLength?: number;
  className?: string;
  variant?: "link" | "button" | "shadcn-link";
  showLinkIcon?: boolean;
}

/**
 * Truncates text to show first and last parts when it exceeds maxLength.
 * Example: "verylongdatabasenamethatexceedsmaxlength" with maxLength=20 becomes "verylongdatab...maxlength"
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
 * A reusable button component that opens a database tab when clicked.
 * Displays the database name with an external link icon.
 * Automatically truncates long names to show first and last parts.
 */
export const OpenDatabaseTabButton = memo(
  ({
    database,
    maxLength = 24,
    className = "",
    showLinkIcon = true,
  }: OpenDatabaseTabButtonProps) => {
    const handleClick = () => {
      TabManager.openTab({
        id: `database:${database}`,
        type: "database",
        database,
      });
      Dialog.close(); // Automatically close any parent dialog
    };

    const displayText = useMemo(() => {
      return truncateText(database, maxLength);
    }, [database, maxLength]);

    const title = `Open database ${database}`;

    return (
      <Button
        variant="link"
        className={`font-semibold h-auto p-0 text-left inline-flex items-center gap-1 ${className}`}
        onClick={handleClick}
        title={title}
      >
        {displayText}
        {showLinkIcon && <ExternalLink className="!h-3 !w-3 flex-shrink-0" />}
      </Button>
    );
  }
);

OpenDatabaseTabButton.displayName = "OpenDatabaseTabButton";
