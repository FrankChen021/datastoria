"use client";

import type { ModelProps } from "@/lib/ai/llm/llm-provider-factory";
import { createContext, useContext, type ReactNode } from "react";

export type ChatPersistenceMode = "local" | "remote";

export interface RuntimeConfig {
  connectionProviderEnabled: boolean;
  systemModels: ModelProps[];
  chatPersistenceMode: ChatPersistenceMode;
}

const DEFAULT_RUNTIME_CONFIG: RuntimeConfig = {
  connectionProviderEnabled: false,
  systemModels: [],
  chatPersistenceMode: "local",
};

const RuntimeConfigContext = createContext<RuntimeConfig>(DEFAULT_RUNTIME_CONFIG);
let currentRuntimeConfig = DEFAULT_RUNTIME_CONFIG;

export function RuntimeConfigProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: RuntimeConfig;
}) {
  currentRuntimeConfig = value;
  return <RuntimeConfigContext.Provider value={value}>{children}</RuntimeConfigContext.Provider>;
}

export function useRuntimeConfig() {
  return useContext(RuntimeConfigContext);
}

export function getRuntimeConfig(): RuntimeConfig {
  return currentRuntimeConfig;
}
