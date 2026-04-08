import { describe, expect, it } from "vitest";
import { buildOrchestratorSystemPrompt } from "./orchestrator-prompt";

describe("buildOrchestratorSystemPrompt", () => {
  it("keeps skill-loading guidance generic", () => {
    const prompt = buildOrchestratorSystemPrompt({});

    expect(prompt).toContain("Before any domain-specific task or specialized-tool workflow");
    expect(prompt).toContain(
      "Use the available skill names and descriptions to choose the best match"
    );
  });

  it("appends diagnosis context when present", () => {
    const prompt = buildOrchestratorSystemPrompt({
      clickHouseUser: "default",
      clusterName: "prod-eu",
      serverVersion: "24.8.1.1",
    });

    expect(prompt).toContain("## Diagnosis Context");
    expect(prompt).toContain("- Cluster name: prod-eu");
    expect(prompt).toContain("- Server version: 24.8.1.1");
    expect(prompt).toContain("- ClickHouse user: default");
  });

  it("returns the base prompt when diagnosis context is absent", () => {
    const prompt = buildOrchestratorSystemPrompt({});

    expect(prompt).not.toContain("## Diagnosis Context");
  });

  it("adds response language policy for non-English language", () => {
    const prompt = buildOrchestratorSystemPrompt({}, { responseLanguage: "zh-CN" });

    expect(prompt).toContain("## Response Language Policy");
    expect(prompt).toContain("Response language (BCP-47): zh-CN");
    expect(prompt).toContain("You MUST write all explanatory prose and headings in this language.");
  });
});
