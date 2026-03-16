"use client";

import { useModelConfig } from "@/hooks/use-model-config";

export function ModelConfigBootstrap() {
  useModelConfig();
  return null;
}
