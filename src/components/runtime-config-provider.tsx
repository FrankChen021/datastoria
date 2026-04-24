"use client";

import type { SessionRepositoryType } from "@/lib/ai/ai-types";
import { createContext, useContext, useLayoutEffect, type ReactNode } from "react";

export interface RuntimeConfig {
  connectionProviderEnabled: boolean;
  sessionRepositoryType: SessionRepositoryType;
  allowEditSkill: boolean;
  autoSelectAvailable: boolean;
  codeAnalysisEnabled: boolean;
}

const DEFAULT_RUNTIME_CONFIG: RuntimeConfig = {
  connectionProviderEnabled: false,
  sessionRepositoryType: "local",
  allowEditSkill: false,
  autoSelectAvailable: false,
  codeAnalysisEnabled: false,
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
  // Update the escape-hatch singleton only after React commits the render so
  // that concurrent-mode double-invocations don't expose a mid-render value
  // to non-React callers of getRuntimeConfig().
  useLayoutEffect(() => {
    currentRuntimeConfig = value;
  }, [value]);
  return <RuntimeConfigContext.Provider value={value}>{children}</RuntimeConfigContext.Provider>;
}

export function useRuntimeConfig() {
  return useContext(RuntimeConfigContext);
}

export function getRuntimeConfig(): RuntimeConfig {
  return currentRuntimeConfig;
}
