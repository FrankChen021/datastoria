import type { InputModel } from "@/lib/ai/agent/plan/sub-agent-registry";

export class PrivateSessionTitleGenerator {
  static resolveModel(modelConfig: InputModel): InputModel {
    return modelConfig;
  }
}
