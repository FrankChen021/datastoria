"use client";

import type { SessionRepositoryType } from "@/lib/ai/chat-types";
import { createContext, useContext, type ReactNode } from "react";

export interface RuntimeConfig {
  connectionProviderEnabled: boolean;
  sessionRepositoryType: SessionRepositoryType;
  allowEditSkill: boolean;
}

const DEFAULT_RUNTIME_CONFIG: RuntimeConfig = {
  connectionProviderEnabled: false,
  sessionRepositoryType: "local",
  allowEditSkill: false,
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
