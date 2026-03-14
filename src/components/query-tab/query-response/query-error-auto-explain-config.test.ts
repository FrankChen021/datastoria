import { AgentConfigurationManager } from "@/components/settings/agent/agent-manager";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { shouldAutoExplain } from "./query-error-auto-explain-config";

vi.mock("@/components/settings/agent/agent-manager", () => ({
  AgentConfigurationManager: {
    getConfiguration: vi.fn(),
  },
}));

describe("shouldAutoExplain", () => {
  beforeEach(() => {
    vi.mocked(AgentConfigurationManager.getConfiguration).mockReturnValue({
      autoExplainClickHouseErrors: true,
      autoExplainBlacklist: ["194", "241"],
    });
  });

  it("returns false for blacklisted error codes (194, 241) after trimming", () => {
    expect(shouldAutoExplain(" 194 ")).toBe(false);
    expect(shouldAutoExplain(241)).toBe(false);
  });

  it("returns true for non-blacklisted code when auto-explain is on", () => {
    expect(shouldAutoExplain("60")).toBe(true);
  });

  it("returns false for missing error code or when auto-explain is off", () => {
    expect(shouldAutoExplain(undefined)).toBe(false);

    vi.mocked(AgentConfigurationManager.getConfiguration).mockReturnValue({
      autoExplainClickHouseErrors: false,
      autoExplainBlacklist: ["62"],
    });
    expect(shouldAutoExplain(62)).toBe(false);
  });

  it("respects the configured blacklist", () => {
    vi.mocked(AgentConfigurationManager.getConfiguration).mockReturnValue({
      autoExplainClickHouseErrors: true,
      autoExplainBlacklist: ["60"],
    });

    expect(shouldAutoExplain(60)).toBe(false);
    expect(shouldAutoExplain(62)).toBe(true);
  });
});
