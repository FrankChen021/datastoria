import { Dialog } from "@/components/shared/use-dialog";
import { ConnectionSelector } from "./connection-selector";

export interface OpenConnectionSelectorDialogOptions {
  /**
   * Connection name to show as the default selected one in the selector.
   */
  defaultConnectionName?: string | null;
}

/**
 * Opens the connection selector in a dialog (centered on screen).
 * Use this as an event handler (e.g. onClick) instead of wrapping a trigger in a component.
 *
 * @example
 * <Button onClick={() => openConnectionSelectorDialog({ defaultConnectionName: connection?.name })}>
 *   Switch Connection
 * </Button>
 */
export function openConnectionSelectorDialog(options?: OpenConnectionSelectorDialogOptions): void {
  const { defaultConnectionName } = options ?? {};

  Dialog.showDialog({
    className:
      "w-[95vw] max-w-[calc(100vw-1rem)] min-w-0 md:min-w-[700px] md:w-auto md:max-w-none p-0 overflow-hidden gap-0",
    closeButtonClassName: "top-[10px]",
    mainContent: (
      <ConnectionSelector
        isOpen={true}
        onClose={() => Dialog.close()}
        defaultConnectionName={defaultConnectionName}
      />
    ),
    disableContentScroll: true,
  });
}
