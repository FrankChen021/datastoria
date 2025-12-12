"use client";

import { CheckIcon, ClipboardIcon } from "lucide-react";
import * as React from "react";

import { Button, type ButtonProps } from "@/components/ui/button";
import { toastManager } from "@/lib/toast";
import { cn } from "@/lib/utils";

export interface CopyButtonProps extends ButtonProps {
  value: string;
}

export async function copyToClipboardWithMeta(value: string): Promise<void> {
  await navigator.clipboard.writeText(value);
}

export function CopyButton({ value, className, variant = "ghost", ...props }: CopyButtonProps) {
  const [hasCopied, setHasCopied] = React.useState(false);

  React.useEffect(() => {
    if (!hasCopied) {
      return;
    }
    const timeout = setTimeout(() => {
      setHasCopied(false);
    }, 3000);
    return () => clearTimeout(timeout);
  }, [hasCopied]);

  const handleCopy = async () => {
    try {
      await copyToClipboardWithMeta(value);
      setHasCopied(true);
    } catch {
      toastManager.show("Failed to copy to clipboard", "error");
    }
  };

  return (
    <Button
      size="icon"
      variant={variant}
      className={cn("absolute top-0 right-0 z-10 h-6 w-6 [&_svg]:h-3 [&_svg]:w-3", className)}
      onClick={handleCopy}
      type="button"
      {...props}
    >
      {hasCopied ? <CheckIcon /> : <ClipboardIcon />}
    </Button>
  );
}



