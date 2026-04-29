import { beforeEach, describe, expect, it, vi } from "vitest";

const collectSpy = vi.fn();
const getRcaTemplateMetadataSpy = vi.fn();

vi.mock("./evidence-collector-factory", () => ({
  EvidenceCollectorFactory: {
    create: () => ({
      collect: collectSpy,
    }),
  },
  isDeterministicRcaSymptom: (symptom: string) => symptom === "unknown",
}));

vi.mock("./impl/template-based-collector", () => ({
  getRcaTemplateMetadata: getRcaTemplateMetadataSpy,
}));

describe("collectRcaEvidenceExecutor", () => {
  beforeEach(() => {
    collectSpy.mockReset();
    getRcaTemplateMetadataSpy.mockReset();
  });

  it("does not load RCA template metadata for unknown symptoms", async () => {
    collectSpy.mockResolvedValue({
      observations: [],
      candidates: [],
      excluded_candidates: [],
      possible_actions: [],
      related_symptoms: [],
      target: undefined,
    });

    const { collectRcaEvidenceExecutor } = await import("./tool-collect-rca-evidence");

    const result = await collectRcaEvidenceExecutor(
      {
        symptom: "unknown",
        symptom_text: "cluster is weird",
        scope: "cluster",
      },
      {} as never
    );

    expect(getRcaTemplateMetadataSpy).not.toHaveBeenCalled();
    expect(collectSpy).toHaveBeenCalledOnce();
    expect(result.success).toBe(true);
  });
});
