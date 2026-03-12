import type { ComponentPropsWithoutRef } from "react";

export default function NumberFlow({ children, ...rest }: ComponentPropsWithoutRef<"span">) {
  return <span {...rest}>{children}</span>;
}
