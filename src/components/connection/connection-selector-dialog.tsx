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
}

/**
 * Dialog-based connection selector component.
 * Used in contexts where the selector should appear centered on screen (e.g., "Switch Connection" button).
 *
 * This is a wrapper component that shows the dialog when the trigger is clicked.
 */
export function ConnectionSelectorDialog({
  trigger,
  dialogClassName = "w-[500px] max-w-[90vw] p-0",
}: ConnectionSelectorDialogProps) {
  const handleClose = useCallback(() => {
    Dialog.close();
  }, []);

  const handleClick = useCallback(() => {
    Dialog.showDialog({
      className: `${dialogClassName} overflow-hidden gap-0`,
      mainContent: <ConnectionSelector isOpen={true} onClose={handleClose} />,
      disableContentScroll: true,
    });
  }, [dialogClassName, handleClose]);

  return (
    <div className="flex items-center gap-1" onClick={handleClick}>
      {trigger}
    </div>
  );
}
