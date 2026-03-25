/**
 * @vitest-environment jsdom
 */

import { RuntimeConfigProvider } from "@/components/runtime-config-provider";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SkillsEdit } from "./skills-edit";

vi.mock("./skills-card", () => ({
  SkillsCard: ({ skill, onClick }: { skill: { name: string }; onClick: () => void }) => (
    <button type="button" onClick={onClick}>
      {skill.name}
    </button>
  ),
}));

vi.mock("./skills-detail-view", () => ({
  SkillsDetailView: ({ skillId }: { skillId: string }) => (
    <div data-testid="skill-detail-view">{skillId}</div>
  ),
}));

describe("SkillsEdit", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [],
      })
    );
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.unstubAllGlobals();
  });

  it("opens the requested skill detail immediately when initialSkillId is provided", async () => {
    await act(async () => {
      root.render(<SkillsEdit initialSkillId="review" />);
    });

    expect(container.querySelector("[data-testid='skill-detail-view']")?.textContent).toBe(
      "review"
    );
  });

  it("loads skills from the published catalog endpoint", async () => {
    const fetchMock = vi.mocked(fetch);

    await act(async () => {
      root.render(
        <RuntimeConfigProvider
          value={{
            connectionProviderEnabled: false,
            sessionRepositoryType: "local",
            allowEditSkill: true,
          }}
        >
          <SkillsEdit />
        </RuntimeConfigProvider>
      );
    });

    const calledUrls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(calledUrls.some((url) => url.includes("/api/ai/skills"))).toBe(true);
    expect(calledUrls.some((url) => url.includes("/api/ai/skills?includeDraft=1"))).toBe(false);
  });
});
