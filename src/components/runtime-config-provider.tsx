"use client";

import type { ModelProps } from "@/lib/ai/llm/llm-provider-factory";
import { createContext, useContext, type ReactNode } from "react";

export interface RuntimeConfig {
  connectionProviderEnabled: boolean;
  systemModels: ModelProps[];
}

const DEFAULT_RUNTIME_CONFIG: RuntimeConfig = {
  connectionProviderEnabled: false,
  systemModels: [],
};

const RuntimeConfigContext = createContext<RuntimeConfig>(DEFAULT_RUNTIME_CONFIG);

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
  return useContext(RuntimeConfigContext);
}
