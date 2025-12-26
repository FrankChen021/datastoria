import { AlertDescription } from "@/components/ui/alert";
import { memo } from "react";

/**
 * Display error message
 */
export const ErrorMessageDisplay = memo(function ErrorMessageDisplay({ errorText }: { errorText: string }) {
  return (
    <div className="flex items-start gap-2 text-destructive">
      <AlertDescription className="mt-2 break-words overflow-wrap-anywhere whitespace-pre-wrap text-xs">
        {errorText}
      </AlertDescription>
    </div>
  );
});
