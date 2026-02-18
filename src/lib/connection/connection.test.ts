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
    });

    await connection.queryRawResponse("SELECT 1").response;

    const fetchUrl = fetchMock.mock.calls[0][0] as string;
    const url = new URL(fetchUrl);
    expect(url.searchParams.get("max_execution_time")).toBe("60");
    expect(url.searchParams.get("output_format_pretty_row_numbers")).toBe("true");
  });
});
