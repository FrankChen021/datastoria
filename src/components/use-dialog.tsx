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
import { ConnectionProvider } from "@/lib/connection/ConnectionContext";
import { cn } from "@/lib/utils";
import { ThemeProvider } from "next-themes";
import { useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom/client";

export interface DialogButton {
  text: string;
  default: boolean;
  onClick: () => Promise<boolean>;
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
  content?: React.ReactNode | (() => React.ReactNode); // Custom content to render instead of text (e.g., spinner + text)
  disabled?: boolean; // Explicitly control button disabled state
}

export interface DialogProps {
  title?: string;
  description?: string;
  mainContent?: React.ReactNode;
  className?: string;
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
        // The full-screen mode of MUI table has z-index of 1300, so we have to set a larger z-index to make sure the dialog is on top of the table.
        className={cn("flex flex-col gap-1 p-5 justify-between z-[2000]", dialogProps.className)}
        disableBackdrop={dialogProps.disableBackdrop}
        onInteractOutside={handleInteractOutside}
        onEscapeKeyDown={(event) => {
          // Prevent closing on Escape key if disableClose callback returns true or backdrop is disabled
          if (dialogProps.disableBackdrop || (dialogProps.canClose && !dialogProps.canClose())) {
            event.preventDefault();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{dialogProps.title}</DialogTitle>
          <DialogDescription>{dialogProps.description}</DialogDescription>
        </DialogHeader>
        <div
          className={cn(
            "flex-grow my-2",
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
              const content = button.content !== undefined 
                ? (typeof button.content === 'function' ? button.content() : button.content)
                : button.text;
              // Use explicit disabled prop if provided, otherwise disable if content is defined (for loading state)
              const isDisabled = button.disabled !== undefined ? button.disabled : (button.content !== undefined);
              return (
                <Button
                  key={index}
                  variant={variant}
                  disabled={isDisabled}
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
    const dialogButtons = dialogProps.dialogButtons ?? [{ text: "OK", onClick: async () => true, default: true }];
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
    const rootElement = document.createElement("div");
    const root = ReactDOM.createRoot(rootElement);

    const dispose = () => {
      root.unmount();
      if (rootElement.parentNode) {
        rootElement.parentNode.removeChild(rootElement);
      }
    };

    const registerClose = (closeFn: () => void) => {
      Dialog.closeCallbacks.push(closeFn);
    };

    // Get current theme from document to match the existing theme state
    // Check multiple ways the theme might be set
    const currentTheme = document.documentElement.classList.contains("dark")
      ? "dark"
      : document.documentElement.getAttribute("data-theme") === "dark"
        ? "dark"
        : localStorage.getItem("theme") === "dark"
          ? "dark"
          : "light";

    // Apply the theme class to the dialog root element to ensure proper theming
    rootElement.className = currentTheme;

    // Append to document body so it inherits body styles
    document.body.appendChild(rootElement);

    root.render(
      <ThemeProvider
        attribute="class"
        defaultTheme={currentTheme}
        forcedTheme={currentTheme}
        enableSystem={false}
        disableTransitionOnChange={false}
      >
        <ConnectionProvider>
          <AlertDialogComponent {...dialogProps} dispose={dispose} registerClose={registerClose} />
        </ConnectionProvider>
      </ThemeProvider>
    );
  }
}
