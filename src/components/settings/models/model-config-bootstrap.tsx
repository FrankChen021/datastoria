"use client";

import { useRuntimeConfig } from "@/components/runtime-config-provider";
import { ModelManager } from "@/components/settings/models/model-manager";
import { useEffect } from "react";

export function ModelConfigBootstrap() {
  const { systemModels } = useRuntimeConfig();

  useEffect(() => {
    ModelManager.getInstance().setSystemModels(systemModels, false);
  }, [systemModels]);

  return null;
}
