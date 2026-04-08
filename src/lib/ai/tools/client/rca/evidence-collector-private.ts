import type {
  CanonicalSymptom,
  CauseCandidate,
  EvidenceGap,
  Observation,
  PossibleAction,
  RcaContextExtension,
  Scope,
  Target,
} from "./evidence-collector-common";

export type CommercialRcaEnrichmentRequest = {
  version: 1;
  investigation: {
    symptom: CanonicalSymptom;
    scope: Scope;
    target?: Target;
    time_window?: number;
    time_range?: {
      from: string;
      to: string;
    };
  };
  deterministic: {
    observations: Observation[];
    candidates: CauseCandidate[];
    excluded_candidates?: Array<{
      cause: string;
      missing_required: string[];
      evidence_against: string[];
    }>;
    possible_actions: PossibleAction[];
    gaps: EvidenceGap[];
  };
  status_context?: {
    generated_at?: string;
    categories?: Record<string, unknown>;
  };
  local_context?: {
    dependency_hints?: unknown[];
    connection_metadata?: unknown;
  };
};

export type CommercialRcaEnrichmentResponse = {
  version: 1;
  available: boolean;
  observations?: Observation[];
  candidate_adjustments?: Array<{
    cause: string;
    support_score_delta?: number;
    evidence_for?: string[];
    evidence_against?: string[];
    provenance: string;
  }>;
  possible_actions?: PossibleAction[];
  related_symptoms?: CanonicalSymptom[];
};

/**
 * Private distributions can replace this stub with a real client that calls a
 * hosted or self-hosted RCA enrichment service and adapts the response into the
 * public `RcaContextExtension` contract.
 */
export function getPrivateRcaContextExtension(): RcaContextExtension | undefined {
  return undefined;
}
