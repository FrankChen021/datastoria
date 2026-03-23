import { describe, expect, it } from "vitest";
import { buildOrchestratorSystemPrompt } from "./orchestrator-prompt";

describe("buildOrchestratorSystemPrompt", () => {
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
});
