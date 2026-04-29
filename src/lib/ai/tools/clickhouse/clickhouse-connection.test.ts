import { describe, expect, it } from "vitest";
import {
  getClickHouseConnectionValidationError,
  hasClickHouseConnection,
} from "./clickhouse-connection";

describe("ClickHouse connection payload", () => {
  it("accepts empty password strings", () => {
    expect(
      hasClickHouseConnection({
        url: "https://clickhouse.example.com",
        user: "default",
        password: "",
      })
    ).toBe(true);
  });

  it("accepts public https URLs", () => {
    expect(
      getClickHouseConnectionValidationError({
        url: "https://clickhouse.example.com",
        user: "default",
        password: "",
        cluster: "prod_cluster",
      })
    ).toBeNull();
  });

  it("rejects non-https URLs", () => {
    expect(
      getClickHouseConnectionValidationError({
        url: "http://clickhouse.example.com",
        user: "default",
        password: "secret",
      })
    ).toContain("https");
  });

  it("rejects localhost and private-network URLs", () => {
    for (const url of [
      "https://localhost:8123",
      "https://127.0.0.1:8123",
      "https://10.0.0.1:8123",
      "https://192.168.1.10:8123",
      "https://[::1]:8123",
    ]) {
      expect(
        getClickHouseConnectionValidationError({
          url,
          user: "default",
          password: "secret",
        })
      ).toContain("private-network");
    }
  });

  it("rejects embedded URL credentials", () => {
    expect(
      getClickHouseConnectionValidationError({
        url: "https://default:secret@clickhouse.example.com",
        user: "default",
        password: "secret",
      })
    ).toContain("embedded credentials");
  });
});
