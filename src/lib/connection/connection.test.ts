import { beforeEach, describe, expect, it, vi } from "vitest";
import { Connection } from "./connection";

const mockGetContext = vi.fn();

vi.mock("@/components/settings/query-context/query-context-manager", () => ({
  QueryContextManager: {
    getInstance: () => ({
      getContext: mockGetContext,
    }),
  },
}));

describe("Connection session ids", () => {
  it("keeps the legacy connection id for non-cluster connections", () => {
    const connection = Connection.create({
      name: "test",
      url: "http://localhost:8123",
      user: "default",
      password: "",
      cluster: "",
      editable: true,
    });

    expect(connection.connectionId).toBe("default@http://localhost:8123");
    expect(connection.legacyConnectionId).toBe("default@http://localhost:8123");
    expect(connection.matchesSessionConnectionId("default@http://localhost:8123")).toBe(true);
  });

  it("includes cluster in the connection id and still matches the legacy id", () => {
    const connection = Connection.create({
      name: "prod",
      url: "https://clickhouse.example.com:8443/path",
      user: "default",
      password: "",
      cluster: "prod_cluster",
      editable: true,
    });

    expect(connection.connectionId).toBe(
      "default@https://clickhouse.example.com:8443#cluster=prod_cluster"
    );
    expect(connection.legacyConnectionId).toBe("default@https://clickhouse.example.com:8443");
    expect(
      connection.matchesSessionConnectionId(
        "default@https://clickhouse.example.com:8443#cluster=prod_cluster"
      )
    ).toBe(true);
    expect(
      connection.matchesSessionConnectionId(
        "default-prod_cluster@https://clickhouse.example.com:8443"
      )
    ).toBe(true);
    expect(
      connection.matchesSessionConnectionId("default@https://clickhouse.example.com:8443")
    ).toBe(true);
  });

  it("encodes connection id components to avoid user and cluster delimiter collisions", () => {
    const connectionA = Connection.create({
      name: "prod-a",
      url: "https://clickhouse.example.com:8443",
      user: "a-b",
      password: "",
      cluster: "c",
      editable: true,
    });
    const connectionB = Connection.create({
      name: "prod-b",
      url: "https://clickhouse.example.com:8443",
      user: "a",
      password: "",
      cluster: "b-c",
      editable: true,
    });

    expect(connectionA.connectionId).toBe("a-b@https://clickhouse.example.com:8443#cluster=c");
    expect(connectionB.connectionId).toBe("a@https://clickhouse.example.com:8443#cluster=b-c");
    expect(connectionA.connectionId).not.toBe(connectionB.connectionId);
  });
});

describe("Connection query context parameters", () => {
  beforeEach(() => {
    mockGetContext.mockReset();
    mockGetContext.mockReturnValue({
      max_execution_time: 60,
      output_format_pretty_row_numbers: true,
      default_format: "JSONCompactEachRow",
    });
    vi.restoreAllMocks();
  });

  it("adds query context key-values as query parameters for query()", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response('{"data":[]}', { status: 200 }));
    const connection = Connection.create({
      name: "test",
      url: "http://localhost:8123",
      user: "default",
      password: "",
      cluster: "",
      editable: true,
    });

    await connection.query("SELECT 1").response;

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const fetchUrl = fetchMock.mock.calls[0][0] as string;
    const url = new URL(fetchUrl);
    expect(url.searchParams.get("max_execution_time")).toBe("60");
    expect(url.searchParams.get("output_format_pretty_row_numbers")).toBe("true");
    expect(url.searchParams.get("default_format")).toBe("JSONCompactEachRow");
  });

  it("keeps request params as highest precedence over query context", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response('{"data":[]}', { status: 200 }));
    const connection = Connection.create({
      name: "test",
      url: "http://localhost:8123?max_execution_time=5",
      user: "default",
      password: "",
      cluster: "",
      editable: true,
    });

    await connection.query("SELECT 1", {
      max_execution_time: 10,
      default_format: "JSON",
    }).response;

    const fetchUrl = fetchMock.mock.calls[0][0] as string;
    const url = new URL(fetchUrl);
    expect(url.searchParams.get("max_execution_time")).toBe("10");
    expect(url.searchParams.get("default_format")).toBe("JSON");
  });

  it("adds query context key-values for queryRawResponse()", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("stream", { status: 200 }));
    const connection = Connection.create({
      name: "test",
      url: "http://localhost:8123",
      user: "default",
      password: "",
      cluster: "",
      editable: true,
    });

    await connection.queryRawResponse("SELECT 1").response;

    const fetchUrl = fetchMock.mock.calls[0][0] as string;
    const url = new URL(fetchUrl);
    expect(url.searchParams.get("max_execution_time")).toBe("60");
    expect(url.searchParams.get("output_format_pretty_row_numbers")).toBe("true");
  });
});
