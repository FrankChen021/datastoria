import { Dialog } from "@/components/shared/use-dialog";
import { useCallback, type ReactNode } from "react";
import { ConnectionSelector } from "./connection-selector";

interface ConnectionSelectorDialogProps {
  /**
   * Custom trigger element. If provided, this will be used instead of the default button.
   */
  trigger?: ReactNode;
  /**
   * Custom className for the dialog content.
   */
  dialogClassName?: string;
  /**
   * Connection name to show as the default selected one in the selector.
   */
  defaultConnectionName?: string | null;
}

/**
 * Dialog-based connection selector component.
 * Used in contexts where the selector should appear centered on screen (e.g., "Switch Connection" button).
 *
 * This is a wrapper component that shows the dialog when the trigger is clicked.
 */
export function ConnectionSelectorDialog({
  trigger,
  dialogClassName = "w-[95vw] max-w-[calc(100vw-1rem)] min-w-0 md:min-w-[700px] md:w-auto md:max-w-none p-0",
  defaultConnectionName,
}: ConnectionSelectorDialogProps) {
  const handleClose = useCallback(() => {
    Dialog.close();
  }, []);

  const handleClick = useCallback(() => {
    Dialog.showDialog({
      className: `${dialogClassName} overflow-hidden gap-0`,
      // Vertically center close button with search input (h-9 = 36px → center 18px; icon 16px → top 10px)
      closeButtonClassName: "top-[10px]",
      mainContent: (
        <ConnectionSelector
          isOpen={true}
          onClose={handleClose}
          defaultConnectionName={defaultConnectionName}
        />
      ),
      disableContentScroll: true,
    });
  }, [dialogClassName, handleClose, defaultConnectionName]);

  return (
    <div className="flex items-center gap-1" onClick={handleClick}>
      {trigger}
    </div>
  );
}
