"use client";

import { ModelSelectorImpl, type ModelSelectorImplProps } from "./model-selector-impl";

export type ModelSelectorProps = ModelSelectorImplProps;

export function ModelSelector(props: ModelSelectorProps) {
  return <ModelSelectorImpl {...props} />;
}
