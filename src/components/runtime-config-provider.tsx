"use client";

import { createContext, useContext, type ReactNode } from "react";

export interface RuntimeConfig {
  connectionProviderEnabled: boolean;
}

const RuntimeConfigContext = createContext<RuntimeConfig | null>(null);

export function RuntimeConfigProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: RuntimeConfig;
}) {
  return <RuntimeConfigContext.Provider value={value}>{children}</RuntimeConfigContext.Provider>;
}

export function useRuntimeConfig() {
  const value = useContext(RuntimeConfigContext);
  if (value === null) {
    throw new Error("useRuntimeConfig must be used within RuntimeConfigProvider");
  }
  return value;
}
