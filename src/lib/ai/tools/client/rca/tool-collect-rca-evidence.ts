import { QueryError } from "@/lib/connection/connection";
import type { ToolExecutor, ToolProgressCallback } from "../client-tool-types";
import {
  buildTimeFilter,
  createCachedRcaConnection,
  getDefaultSupportedScopes,
  isStatusContextReusable,
  resolveRcaThresholds,
  resolveScope,
  type EvidenceGap,
  type RcaEvidenceInput,
  type RcaEvidenceOutput,
  type Scope,
  type SymptomContext,
} from "./evidence-collector-common";
import { createRcaEvidenceProvider } from "./evidence-collector-factory";
import { getRcaTemplateMetadata } from "./template-runtime";

const RCA_EVIDENCE_PROVIDER = createRcaEvidenceProvider();

export const collectRcaEvidenceExecutor: ToolExecutor<RcaEvidenceInput, RcaEvidenceOutput> = async (
  input,
  connection,
  progressCallback?: ToolProgressCallback
) => {
  const gaps: EvidenceGap[] = [];
  const requestedScope: Scope = input.scope ?? "cluster";
  const { filter, minutes } = buildTimeFilter(input);
  let resolvedScope: Scope = requestedScope;

  try {
    const metadata = await getRcaTemplateMetadata(input.symptom);
    resolvedScope = resolveScope(
      requestedScope,
      metadata?.scopes ?? getDefaultSupportedScopes(input.symptom),
      input.symptom,
      gaps
    );

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
        excluded_candidates: [],
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
      connection: createCachedRcaConnection(connection),
      scope: resolvedScope,
      target: input.target,
      symptomText: input.symptom_text,
      thresholds: resolveRcaThresholds(input.thresholds),
      timeFilter: filter,
      timeWindowMinutes: minutes,
      gaps,
      progressCallback,
    };

    progressCallback?.("collect rca evidence", 30, "started");

    const result = await RCA_EVIDENCE_PROVIDER.collect(input.symptom, context);
    if (!result) {
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
        excluded_candidates: [],
        possible_actions: [],
        gaps,
        generated_at: new Date().toISOString(),
        error: `symptom '${input.symptom}' is not implemented in Phase 1`,
      };
    }

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
      excluded_candidates: result.excluded_candidates,
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
      excluded_candidates: [],
      possible_actions: [],
      gaps,
      generated_at: new Date().toISOString(),
      error: message,
    };
  }
};
