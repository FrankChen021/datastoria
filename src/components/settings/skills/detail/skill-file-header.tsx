"use client";

import { StatusPopover } from "@/components/connection/connection-edit-component";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { AlertCircle, FileText, Trash2 } from "lucide-react";
import { memo } from "react";

export const SkillFileHeader = memo(function SkillFileHeader({
  displayedFilename,
  currentSource,
  renderMode,
  canEditSelectedReference,
  showDeleteSelectedReference,
  canDeleteSelectedReference,
  showRenderToggle,
  isDeleteReferenceConfirmOpen,
  onRenderModeChange,
  onDeleteReference,
  onDeleteReferenceConfirmOpenChange,
}: {
  displayedFilename: string;
  currentSource: "disk" | "database" | null;
  renderMode: "rendered" | "raw";
  canEditSelectedReference: boolean;
  showDeleteSelectedReference: boolean;
  canDeleteSelectedReference: boolean;
  showRenderToggle: boolean;
  isDeleteReferenceConfirmOpen: boolean;
  onRenderModeChange: (value: "rendered" | "raw") => void;
  onDeleteReference: () => void;
  onDeleteReferenceConfirmOpenChange: (open: boolean) => void;
}) {
  const sourceLabel =
    currentSource === "disk" ? "Built-in" : currentSource === "database" ? "User-Provided" : null;

  return (
    <div className="flex h-10 flex-shrink-0 items-center justify-between gap-2 border-b px-4">
      <div className="flex items-center gap-1.5 min-w-0">
        <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="text-xs font-medium text-muted-foreground truncate">
          {displayedFilename}
        </span>
        {sourceLabel ? (
          <Badge variant="secondary" className="text-[10px] rounded-lg px-1.5 py-0 h-5 capitalize">
            {sourceLabel}
          </Badge>
        ) : null}
      </div>
      <div className="flex items-center gap-1">
        <ToggleGroup
          type="single"
          value={renderMode}
          onValueChange={(value) => value && onRenderModeChange(value as "rendered" | "raw")}
          size="sm"
          variant="outline"
          className={showRenderToggle ? undefined : "invisible pointer-events-none"}
        >
          <ToggleGroupItem value="rendered" className="text-xs h-6 px-2">
            Preview
          </ToggleGroupItem>
          <ToggleGroupItem value="raw" className="text-xs h-6 px-2">
            {canEditSelectedReference ? "Edit" : "Raw"}
          </ToggleGroupItem>
        </ToggleGroup>
        {showDeleteSelectedReference ? (
          canDeleteSelectedReference ? (
            <StatusPopover
              open={isDeleteReferenceConfirmOpen}
              onOpenChange={onDeleteReferenceConfirmOpenChange}
              side="bottom"
              align="end"
              className="w-72"
              icon={<AlertCircle className="mt-0.5 h-4 w-4 text-amber-500" />}
              title="Delete this reference?"
              trigger={
                <Button variant="outline" size="sm" className="h-6 px-2 text-xs">
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </Button>
              }
            >
              <p className="mb-3 text-xs text-muted-foreground">
                This keeps the removal local until you publish. You can still revert the change
                before then.
              </p>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => onDeleteReferenceConfirmOpenChange(false)}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => {
                    onDeleteReference();
                    onDeleteReferenceConfirmOpenChange(false);
                  }}
                >
                  Delete
                </Button>
              </div>
            </StatusPopover>
          ) : (
            <Button variant="outline" size="sm" className="h-6 px-2 text-xs" disabled>
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </Button>
          )
        ) : null}
      </div>
    </div>
  );
});
