"use client";

import { Button } from "@/components/ui/button";
import {
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Dialog as DialogUI,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";

export interface DialogButton {
  text?: string;
  icon?: React.ReactNode;
  default: boolean;
  onClick: () => Promise<boolean>;
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
  content?: React.ReactNode | (() => React.ReactNode);
  disabled?: boolean; // Control button disabled state
}

export interface DialogProps {
  title?: string;
  description?: string;
  mainContent?: React.ReactNode;
  className?: string;
  /**
   * Optional className for the dialog close (X) button. Use to adjust position (e.g. vertically center with first row).
   */
  closeButtonClassName?: string;
  onCancel?: () => void;
  dialogButtons?: DialogButton[];
  /**
   * A callback function that determines whether the dialog can be closed.
   * If it returns true, the dialog will not be closed.
   * If it returns false or is not provided, the dialog can be closed normally.
   */
  canClose?: () => boolean;
  /**
   * If true, disables the backdrop overlay and prevents closing by clicking outside.
   */
  disableBackdrop?: boolean;
  /**
   * If true, disables the content scroll (removes overflow-auto from content wrapper).
   * Default is false (content is scrollable).
   */
  disableContentScroll?: boolean;
}

interface InternalDialogProps extends DialogProps {
  dispose: () => void;
  registerClose?: (closeFn: () => void) => void;
}

const AlertDialogComponent = (dialogProps: InternalDialogProps) => {
  const [open, setOpen] = useState(true);
  const closeFnRef = useRef<(() => void) | null>(null);

  // Register the close function with the parent
  useEffect(() => {
    const closeFn = () => setOpen(false);
    closeFnRef.current = closeFn;

    if (dialogProps.registerClose) {
      dialogProps.registerClose(closeFn);
    }

    // Cleanup: remove the close callback when dialog unmounts
    return () => {
      if (closeFnRef.current) {
        Dialog._unregisterCloseCallback(closeFnRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!open) {
      // Delay disposing the dialog to allow the animation to finish
      setTimeout(() => {
        dialogProps.dispose();
      }, 100);
    }
  }, [open, dialogProps]);

  const handleOpenChange = (newOpen: boolean) => {
    // If closing and disableClose callback returns true, prevent closing
    if (!newOpen && dialogProps.canClose && !dialogProps.canClose()) {
      return;
    }
    setOpen(newOpen);
  };

  const handleInteractOutside = (event: Event) => {
    // If backdrop is disabled, always prevent interaction
    if (dialogProps.disableBackdrop) {
      event.preventDefault();
      return;
    }
    // If disableClose callback returns true, prevent default behavior
    if (dialogProps.canClose && !dialogProps.canClose()) {
      event.preventDefault();
      return;
    }
    // Call the onCancel callback if provided
    if (dialogProps.onCancel) {
      dialogProps.onCancel();
    }
  };

  return (
    <DialogUI open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        // We set it to 10001 to make sure it's on top of the settings dialog (z-[9999]).
        className={cn("flex flex-col gap-1 p-5 justify-between z-[10001]", dialogProps.className)}
        closeButtonClassName={dialogProps.closeButtonClassName}
        overlayClassName="z-[10001]"
        disableBackdrop={dialogProps.disableBackdrop}
        onInteractOutside={handleInteractOutside}
        onEscapeKeyDown={(event) => {
          // Prevent closing on Escape key if disableClose callback returns true or backdrop is disabled
          if (dialogProps.disableBackdrop || (dialogProps.canClose && !dialogProps.canClose())) {
            event.preventDefault();
          }
        }}
      >
        {(dialogProps.title || dialogProps.description) && (
          <DialogHeader>
            <DialogTitle>{dialogProps.title}</DialogTitle>
            <DialogDescription>{dialogProps.description}</DialogDescription>
          </DialogHeader>
        )}
        <div
          className={cn(
            "flex-grow ",
            !dialogProps.disableContentScroll && "overflow-auto",
            dialogProps.disableContentScroll && "flex flex-col min-h-0"
          )}
        >
          {dialogProps.mainContent}
        </div>
        {dialogProps.dialogButtons && dialogProps.dialogButtons.length > 0 && (
          <DialogFooter className="mt-auto">
            {dialogProps.dialogButtons.map((button, index) => {
              const variant = button.variant || (button.default ? "default" : "outline");

              // Determine button content: icon + text, icon only, or text only
              let content: React.ReactNode;

              if (button.content) {
                content = typeof button.content === "function" ? button.content() : button.content;
              } else if (button.icon && button.text) {
                // Icon + text combination
                content = (
                  <>
                    {button.icon}
                    {button.text}
                  </>
                );
              } else if (button.icon) {
                // Icon only
                content = button.icon;
              } else {
                // Text only (fallback)
                content = button.text;
              }

              return (
                <Button
                  key={index}
                  variant={variant}
                  disabled={button.disabled}
                  className="px-3"
                  onClick={async () => {
                    const shouldClose = await button.onClick();
                    if (shouldClose) {
                      setOpen(false);
                    }
                  }}
                >
                  {content}
                </Button>
              );
            })}
          </DialogFooter>
        )}
      </DialogContent>
    </DialogUI>
  );
};

// Module-level handler for the static method
let showDialogFn: ((props: DialogProps) => void) | undefined;

/**
 * A provider that renders dialogs within the main React component tree.
 *
 * Background:
 * Previously, dialogs were created using `ReactDOM.createRoot` in a separate DOM node.
 * This caused an issue where the dialogs could not inherit Contexts (like ConnectionContext, ThemeContext)
 * from the main application because they existed in a separate React root.
 *
 * By using this provider, dialogs are rendered as descendants of the main app's providers,
 * ensuring they have access to all global contexts (e.g., the currently selected connection).
 */
export function DialogProvider() {
  const [dialogs, setDialogs] = useState<Array<DialogProps & { id: string }>>([]);

  useEffect(() => {
    showDialogFn = (props: DialogProps) => {
      const id = Math.random().toString(36).substring(7);
      setDialogs((prev) => [...prev, { ...props, id }]);
    };

    return () => {
      showDialogFn = undefined;
    };
  }, []);

  const handleDispose = (id: string) => {
    setDialogs((prev) => prev.filter((d) => d.id !== id));
  };

  const handleRegisterClose = (closeFn: () => void) => {
    Dialog._registerCloseCallback(closeFn);
  };

  return (
    <>
      {dialogs.map((dialog) => (
        <AlertDialogComponent
          key={dialog.id}
          {...dialog}
          dispose={() => handleDispose(dialog.id)}
          registerClose={handleRegisterClose}
        />
      ))}
    </>
  );
}

export class Dialog {
  private static closeCallbacks: (() => void)[] = [];

  /**
   * Closes the most recently opened dialog.
   */
  public static close() {
    const closeFn = Dialog.closeCallbacks.pop();
    if (closeFn) {
      closeFn();
    }
  }

  /**
   * Closes all open dialogs.
   */
  public static closeAll() {
    while (Dialog.closeCallbacks.length > 0) {
      const closeFn = Dialog.closeCallbacks.pop();
      if (closeFn) {
        closeFn();
      }
    }
  }

  /**
   * Internal method to register a close callback.
   * @internal
   */
  public static _registerCloseCallback(closeFn: () => void) {
    Dialog.closeCallbacks.push(closeFn);
  }

  /**
   * Internal method to unregister a close callback.
   * @internal
   */
  public static _unregisterCloseCallback(closeFn: () => void) {
    const index = Dialog.closeCallbacks.indexOf(closeFn);
    if (index > -1) {
      Dialog.closeCallbacks.splice(index, 1);
    }
  }

  public static alert(dialogProps: DialogProps) {
    const dialogButtons = dialogProps.dialogButtons ?? [
      { text: "OK", onClick: async () => true, default: true },
    ];
    Dialog.showDialog({ ...dialogProps, dialogButtons: dialogButtons });
  }

  public static confirm(dialogProps: DialogProps) {
    const dialogButtons = dialogProps.dialogButtons ?? [
      { text: "Confirm", onClick: async () => true, default: true },
      { text: "Cancel", onClick: async () => true, default: false },
    ];

    Dialog.showDialog({ ...dialogProps, dialogButtons: dialogButtons });
  }

  public static showDialog(dialogProps: DialogProps) {
    if (showDialogFn) {
      showDialogFn(dialogProps);
    } else {
      console.error("DialogProvider is not mounted. Cannot show dialog.");
    }
  }
}
