import { QueryError } from "@/lib/connection/connection";
import type { ToolExecutor, ToolProgressCallback } from "../client-tool-types";
import {
  buildTimeFilter,
  handleUnknown,
  isStatusContextReusable,
  resolveScope,
  type CanonicalSymptom,
  type EvidenceGap,
  type RcaEvidenceInput,
  type RcaEvidenceOutput,
  type Scope,
  type SymptomContext,
  type SymptomHandler,
} from "./collect-rca-evidence-common";
import { collectHighPartCountEvidence } from "./collect-rca-evidence-high-part";
import { collectHighPartitionCountEvidence } from "./collect-rca-evidence-high-partition";
import { collectHighQueryLatencyEvidence } from "./collect-rca-evidence-high-query-latency";

const SYMPTOM_HANDLERS: Partial<Record<CanonicalSymptom, SymptomHandler>> = {
  high_query_latency: collectHighQueryLatencyEvidence,
  high_part_count: collectHighPartCountEvidence,
  high_partition_count: collectHighPartitionCountEvidence,
};

export const collectRcaEvidenceExecutor: ToolExecutor<RcaEvidenceInput, RcaEvidenceOutput> = async (
  input,
  connection,
  progressCallback?: ToolProgressCallback
) => {
  const gaps: EvidenceGap[] = [];
  const requestedScope: Scope = input.scope ?? "cluster";
  const resolvedScope = resolveScope(input.symptom, requestedScope, gaps);
  const { filter, minutes } = buildTimeFilter(input);

  try {
    if (
      input.symptom === "unknown" &&
      (!input.symptom_text || input.symptom_text.trim().length === 0)
    ) {
      return {
        schema_version: 1,
        success: false,
        symptom: input.symptom,
        scope: resolvedScope,
        target: input.target,
        related_symptoms: [],
        observations: [],
        candidates: [],
        possible_actions: [],
        gaps,
        generated_at: new Date().toISOString(),
        error: "symptom_text is required when symptom='unknown'",
      };
    }

    const reuseStatusContext = isStatusContextReusable(input, resolvedScope, gaps);
    if (reuseStatusContext) {
      progressCallback?.("validate status context", 10, "success");
    } else {
      progressCallback?.("validate status context", 10, "skipped");
    }

    const context: SymptomContext = {
      connection,
      scope: resolvedScope,
      target: input.target,
      timeFilter: filter,
      timeWindowMinutes: minutes,
      gaps,
      progressCallback,
    };

    progressCallback?.("collect rca evidence", 30, "started");

    const handler = SYMPTOM_HANDLERS[input.symptom];
    if (input.symptom !== "unknown" && !handler) {
      gaps.push({
        description: "symptom handler unavailable",
        reason: `symptom '${input.symptom}' is not implemented in Phase 1`,
      });
      progressCallback?.("collect rca evidence", 90, "skipped");
      return {
        schema_version: 1,
        success: false,
        symptom: input.symptom,
        scope: resolvedScope,
        target: input.target,
        related_symptoms: [],
        observations: [],
        candidates: [],
        possible_actions: [],
        gaps,
        generated_at: new Date().toISOString(),
        error: `symptom '${input.symptom}' is not implemented in Phase 1`,
      };
    }

    const result =
      input.symptom === "unknown"
        ? await handleUnknown(context, input.symptom_text || "")
        : await (handler as SymptomHandler)(context);

    progressCallback?.("collect rca evidence", 90, "success");

    return {
      schema_version: 1,
      success: true,
      symptom: input.symptom,
      scope: resolvedScope,
      target: result.target ?? input.target,
      related_symptoms: result.related_symptoms,
      observations: result.observations,
      candidates: result.candidates,
      possible_actions: result.possible_actions,
      gaps,
      generated_at: new Date().toISOString(),
    };
  } catch (error) {
    const message =
      error instanceof QueryError && error.data
        ? typeof error.data === "string"
          ? error.data
          : JSON.stringify(error.data)
        : error instanceof Error
          ? error.message
          : String(error);

    progressCallback?.("collect rca evidence", 90, "failed", message);

    return {
      schema_version: 1,
      success: false,
      symptom: input.symptom,
      scope: resolvedScope,
      target: input.target,
      related_symptoms: [],
      observations: [],
      candidates: [],
      possible_actions: [],
      gaps,
      generated_at: new Date().toISOString(),
      error: message,
    };
  }
};
