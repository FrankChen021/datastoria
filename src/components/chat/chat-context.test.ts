import { describe, expect, it } from "vitest";
import {
  formatDatabaseContextFacts,
  getDatabaseContextFromConnection,
  hasDatabaseContextFacts,
} from "./chat-context";

describe("chat-context database facts", () => {
  it("formats known database context facts and marks missing values as unknown", () => {
    expect(
      formatDatabaseContextFacts({
        clusterName: "prod-eu",
        serverVersion: "24.8.1.1",
        clickHouseUser: "default",
      })
    ).toContain("- ClickHouse user: default");
  });

  it("derives database context facts from connection metadata when available", () => {
    const context = getDatabaseContextFromConnection({
      cluster: "prod-eu",
      metadata: {
        serverVersion: "24.8.1.1",
        internalUser: "default",
      },
    } as never);

    expect(context).toEqual({
      clusterName: "prod-eu",
      serverVersion: "24.8.1.1",
      clickHouseUser: "default",
    });
  });

  it("returns undefined when no relevant database context facts are available", () => {
    expect(
      getDatabaseContextFromConnection({
        cluster: "",
        metadata: {},
      } as never)
    ).toBeUndefined();
    expect(hasDatabaseContextFacts(undefined)).toBe(false);
  });
});
