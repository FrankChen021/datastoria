import { AgentConfigurationManager } from "@/components/settings/agent/agent-manager";
import { ModelManager } from "@/components/settings/models/model-manager";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AutoExplainState, getAutoExplainState } from "./query-error-auto-explain-config";

vi.mock("@/components/settings/agent/agent-manager", () => ({
  AgentConfigurationManager: {
    getConfiguration: vi.fn(),
  },
}));

vi.mock("@/components/settings/models/model-manager", () => ({
  ModelManager: {
    getInstance: vi.fn(() => ({
      getAvailableModels: vi.fn(),
    })),
  },
}));

describe("getAutoExplainState", () => {
  beforeEach(() => {
    vi.mocked(ModelManager.getInstance).mockReturnValue({
      getAvailableModels: vi.fn().mockReturnValue([{ id: "model-1" }]),
    } as unknown as ReturnType<typeof ModelManager.getInstance>);
    vi.mocked(AgentConfigurationManager.getConfiguration).mockReturnValue({
      mode: "v2",
      autoExplainClickHouseErrors: true,
      autoExplainBlacklist: ["194", "241"],
    });
  });

  it("returns UNAVAILABLE when getAvailableModels returns 0 models", () => {
    vi.mocked(ModelManager.getInstance).mockReturnValue({
      getAvailableModels: vi.fn().mockReturnValue([]),
    } as unknown as ReturnType<typeof ModelManager.getInstance>);
    expect(getAutoExplainState("60")).toBe(AutoExplainState.UNAVAILABLE);
    expect(getAutoExplainState(62)).toBe(AutoExplainState.UNAVAILABLE);
  });

  it("returns DISABLED for blacklisted error codes (194, 241) after trimming", () => {
    expect(getAutoExplainState(" 194 ")).toBe(AutoExplainState.DISABLED);
    expect(getAutoExplainState(241)).toBe(AutoExplainState.DISABLED);
  });

  it("returns ENABLED for non-blacklisted code when auto-explain is on", () => {
    expect(getAutoExplainState("60")).toBe(AutoExplainState.ENABLED);
  });

  it("returns DISABLED for missing error code or when auto-explain is off", () => {
    expect(getAutoExplainState(undefined)).toBe(AutoExplainState.DISABLED);

    vi.mocked(AgentConfigurationManager.getConfiguration).mockReturnValue({
      mode: "v2",
      autoExplainClickHouseErrors: false,
      autoExplainBlacklist: ["62"],
    });
    expect(getAutoExplainState(62)).toBe(AutoExplainState.DISABLED);
  });

  it("respects the configured blacklist", () => {
    vi.mocked(AgentConfigurationManager.getConfiguration).mockReturnValue({
      mode: "v2",
      autoExplainClickHouseErrors: true,
      autoExplainBlacklist: ["60"],
    });

    expect(getAutoExplainState(60)).toBe(AutoExplainState.DISABLED);
    expect(getAutoExplainState(62)).toBe(AutoExplainState.ENABLED);
  });
});
