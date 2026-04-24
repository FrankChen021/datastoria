import * as React from "react";

type CommandPartProps = React.HTMLAttributes<HTMLDivElement> & {
  heading?: React.ReactNode;
  onSelect?: (value?: string) => void;
  shouldFilter?: boolean;
  value?: string;
};

function createCommandPart(displayName: string) {
  const CommandPart = React.forwardRef<HTMLDivElement, CommandPartProps>(
    (
      { children, heading, onClick, onSelect, shouldFilter: _shouldFilter, value, ...props },
      ref
    ) => (
      <div
        {...props}
        ref={ref}
        onClick={(event) => {
          onClick?.(event);
          onSelect?.(value);
        }}
      >
        {heading ? <div>{heading}</div> : null}
        {children}
      </div>
    )
  );
  CommandPart.displayName = displayName;
  return CommandPart;
}

const CommandRoot = createCommandPart("Command");

export const Command = Object.assign(CommandRoot, {
  Dialog: createCommandPart("CommandDialog"),
  Empty: createCommandPart("CommandEmpty"),
  Group: createCommandPart("CommandGroup"),
  Input: createCommandPart("CommandInput"),
  Item: createCommandPart("CommandItem"),
  List: createCommandPart("CommandList"),
  Separator: createCommandPart("CommandSeparator"),
});
