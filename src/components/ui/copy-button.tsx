"use client";

import { CheckIcon, ClipboardIcon } from "lucide-react";
import * as React from "react";

import { Button, type ButtonProps } from "@/components/ui/button";
import { toastManager } from "@/lib/toast";
import { cn } from "@/lib/utils";

export interface CopyButtonProps extends ButtonProps {
  children?: React.ReactNode;
  value: string;
}

export async function copyToClipboardWithMeta(value: string): Promise<void> {
  await navigator.clipboard.writeText(value);
}

export function CopyButton({
  children,
  value,
  className,
  variant = "ghost",
  size,
  ...props
}: CopyButtonProps) {
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
      size={size ?? (children ? "sm" : "icon")}
      variant={variant}
      className={cn(
        children
          ? "gap-1"
          : "absolute top-0 right-0 z-10 h-6 w-6 [&_svg]:h-3 [&_svg]:w-3",
        className
      )}
      onClick={handleCopy}
      type="button"
      {...props}
    >
      {hasCopied ? <CheckIcon /> : <ClipboardIcon />}
      {children}
    </Button>
  );
}


