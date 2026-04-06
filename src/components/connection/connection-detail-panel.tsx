"use client";

import { Button } from "@/components/ui/button";
import type { ConnectionConfig } from "@/lib/connection/connection-config";
import { cn } from "@/lib/utils";
import { Eye, EyeOff, Pencil } from "lucide-react";
import { useEffect, useState } from "react";

interface ConnectionDetailPanelProps {
  conn: ConnectionConfig | null;
  onEdit?: (c: ConnectionConfig) => void;
}

interface ConnectionDetailContentProps {
  conn: ConnectionConfig | null;
  className?: string;
}

export function ConnectionDetailContent({ conn, className }: ConnectionDetailContentProps) {
  const [showPassword, setShowPassword] = useState(false);
  const connectionFingerprint = conn
    ? `${conn.name}|${conn.url}|${conn.user}|${conn.cluster}|${conn.editable}`
    : "";

  useEffect(() => {
    setShowPassword(false);
  }, [connectionFingerprint]);

  if (!conn) {
    return null;
  }

  return (
    <div className={cn("px-2 py-2 text-[10px] text-popover-foreground", className)}>
      <div className="flex flex-col gap-y-2">
        <div>
          <div className="text-xs text-muted-foreground">Name</div>
          <div className="text-xs font-medium break-all">{conn.name}</div>
        </div>

        <div>
          <div className="text-xs text-muted-foreground">URL</div>
          <div className="text-xs break-all">{conn.url}</div>
        </div>

        <div>
          <div className="text-xs text-muted-foreground">User</div>
          <div className="text-xs break-all">{conn.user}</div>
        </div>

        <div>
          <div className="text-xs text-muted-foreground">Password</div>
          <div className="flex items-center gap-2">
            {conn.password && (
              <Button
                variant="ghost"
                size="icon"
                className="h-4 w-4 p-0"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="!h-3 !w-3" /> : <Eye className="!h-3 !w-3" />}
              </Button>
            )}
            <div className="text-xs break-all">
              {conn.password ? (showPassword ? conn.password : "••••••") : "No password"}
            </div>
          </div>
        </div>

        <div>
          <div className="text-xs text-muted-foreground">Cluster</div>
          <div className="text-xs break-all">{conn.cluster || "N/A"}</div>
        </div>
      </div>
    </div>
  );
}

export function ConnectionDetailPanel({ conn, onEdit }: ConnectionDetailPanelProps) {
  if (!conn) {
    return null;
  }

  return (
    <div
      data-panel="right"
      className="w-[260px] h-full min-h-0 flex-shrink-0 flex flex-col p-0 bg-popover rounded-sm text-popover-foreground shadow-md"
    >
      <ConnectionDetailContent conn={conn} className="flex-1 min-h-0 overflow-auto" />
      <div className="h-px bg-border" />
      <div className="h-9 shrink-0 flex items-center">
        <Button
          variant="ghost"
          size="sm"
          className="px-2 font-normal text-sm w-full h-9 rounded-none"
          onClick={() => onEdit?.(conn)}
        >
          <Pencil className="h-4 w-4 mr-2" />
          Edit Connection
        </Button>
      </div>
    </div>
  );
}
