import { Dialog } from "@/components/shared/use-dialog";
import { TabManager } from "@/components/tab-manager";
import { Button } from "@/components/ui/button";
import { hostNameManager } from "@/lib/host-name-manager";
import { ExternalLink } from "lucide-react";
import { memo, useMemo } from "react";

export interface OpenNodeTabButtonProps {
  host: string;
  maxLength?: number;
  className?: string;
  showLinkIcon?: boolean;
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }

  const ellipsisLength = 3;
  const minPartLength = 4;

  if (maxLength < minPartLength * 2 + ellipsisLength) {
    return text.slice(0, maxLength - ellipsisLength) + "...";
  }

  const availableLength = maxLength - ellipsisLength;
  const firstPartLength = Math.floor(availableLength / 2);
  const lastPartLength = availableLength - firstPartLength;

  return `${text.slice(0, firstPartLength)}...${text.slice(-lastPartLength)}`;
}

export const OpenNodeTabButton = memo(
  ({ host, maxLength = 32, className = "", showLinkIcon = true }: OpenNodeTabButtonProps) => {
    const shortHost = useMemo(() => hostNameManager.getShortHostname(host), [host]);

    const handleClick = () => {
      TabManager.openTab({
        id: `node:${host}`,
        type: "node",
        host: shortHost,
      });
      Dialog.close();
    };

    const displayText = useMemo(() => truncateText(shortHost, maxLength), [maxLength, shortHost]);

    return (
      <Button
        variant="link"
        className={`font-semibold h-auto p-0 text-left inline-flex items-center gap-1 ${className}`}
        onClick={handleClick}
        title={`Open node ${host}`}
      >
        {displayText}
        {showLinkIcon && <ExternalLink className="!h-3 !w-3 flex-shrink-0" />}
      </Button>
    );
  }
);

OpenNodeTabButton.displayName = "OpenNodeTabButton";
