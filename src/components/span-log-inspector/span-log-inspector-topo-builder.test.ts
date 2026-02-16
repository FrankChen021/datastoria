import { describe, expect, it } from "vitest";
import {
  transformSpanRowsToTimelineTree,
  type SpanLogElement,
} from "./span-log-inspector-timeline-types";
import { buildTraceTopo } from "./span-log-inspector-topo-builder";

function createSpan(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    span_id: "span-default",
    parent_span_id: "",
    service_instance_id: "orders-1",
    start_time_us: 1000,
    finish_time_us: 2000,
    status_code: "OK",
    kind: "INTERNAL",
    ...overrides,
  };
}

function buildTopo(spans: Record<string, unknown>[]) {
  const timelineData = transformSpanRowsToTimelineTree(spans as SpanLogElement[]);
  return buildTraceTopo(timelineData.tree);
}

describe("span-log-inspector-topo-builder", () => {
  it("builds entry->server and server->remote for SERVER root with CLIENT child", () => {
    const serverSpan = createSpan({
      span_id: "s1",
      parent_span_id: "",
      kind: "SERVER",
      start_time_us: 1000,
      finish_time_us: 3000,
    });

    const clientSpan = createSpan({
      span_id: "s2",
      parent_span_id: "s1",
      kind: "CLIENT",
      start_time_us: 1500,
      finish_time_us: 2500,
      attribute: JSON.stringify({
        "http.client": "ok",
        "net.peer": "api.partner.internal:443",
      }),
    });

    const topo = buildTopo([serverSpan, clientSpan]);

    expect(topo.nodes).toHaveLength(3);
    expect(topo.nodes.map((node) => node.id).sort()).toEqual([
      "ClickHouse::",
      "entry::user",
      "http::api.partner.internal:443",
    ]);

    expect(topo.edges).toHaveLength(2);

    const entryToServer = topo.edges.find((edge) => edge.id === "entry::user->ClickHouse::");
    expect(entryToServer).toBeDefined();
    expect(entryToServer?.count).toBe(1);

    const serverToRemote = topo.edges.find(
      (edge) => edge.id === "ClickHouse::->http::api.partner.internal:443"
    );
    expect(serverToRemote).toBeDefined();
    expect(serverToRemote?.count).toBe(1);
  });

  it("builds entry->server and server->remote for SERVER->INTERNAL->CLIENT chain", () => {
    const serverSpan = createSpan({
      span_id: "a",
      parent_span_id: "",
      kind: "SERVER",
      start_time_us: 1000,
      finish_time_us: 4000,
    });

    const internalSpan = createSpan({
      span_id: "b",
      parent_span_id: "a",
      kind: "INTERNAL",
      start_time_us: 1500,
      finish_time_us: 3500,
    });

    const clientSpan = createSpan({
      span_id: "c",
      parent_span_id: "b",
      kind: "CLIENT",
      start_time_us: 2000,
      finish_time_us: 3000,
      attribute: JSON.stringify({
        "http.client": "ok",
        "net.peer": "inventory.service.svc:8443",
      }),
    });

    const topo = buildTopo([serverSpan, internalSpan, clientSpan]);

    expect(topo.nodes).toHaveLength(3);
    expect(topo.nodes.map((node) => node.id).sort()).toEqual([
      "ClickHouse::",
      "entry::user",
      "http::inventory.service.svc:8443",
    ]);

    expect(topo.edges).toHaveLength(2);
    expect(topo.edges.find((edge) => edge.id === "entry::user->ClickHouse::")).toBeDefined();
    expect(
      topo.edges.find((edge) => edge.id === "ClickHouse::->http::inventory.service.svc:8443")
    ).toBeDefined();
  });

  it("builds remote target when CLIENT uses server.address/server.port instead of net.peer", () => {
    const serverSpan = createSpan({
      span_id: "root",
      parent_span_id: "",
      kind: "SERVER",
      start_time_us: 1000,
      finish_time_us: 5000,
    });

    const internalSpan = createSpan({
      span_id: "mid",
      parent_span_id: "root",
      kind: "INTERNAL",
      start_time_us: 2000,
      finish_time_us: 4500,
    });

    const clientSpan = createSpan({
      span_id: "leaf",
      parent_span_id: "mid",
      kind: "CLIENT",
      start_time_us: 3000,
      finish_time_us: 3500,
      attribute: JSON.stringify({
        "db.system": "clickhouse",
        "server.address": "10.0.0.12",
        "server.port": "9000",
      }),
    });

    const topo = buildTopo([serverSpan, internalSpan, clientSpan]);

    expect(topo.nodes).toHaveLength(3);
    expect(topo.nodes.map((node) => node.id).sort()).toEqual([
      "ClickHouse::",
      "clickhouse::10.0.0.12:9000",
      "entry::user",
    ]);
    expect(
      topo.edges.find((edge) => edge.id === "ClickHouse::->clickhouse::10.0.0.12:9000")
    ).toBeDefined();
  });

  it("supports span_attributes and *_CLIENT kind variants for deep spans", () => {
    const serverSpan = createSpan({
      span_id: "r1",
      parent_span_id: "",
      kind: "SERVER",
      start_time_us: 1000,
      finish_time_us: 7000,
    });
    const midSpan = createSpan({
      span_id: "r2",
      parent_span_id: "r1",
      kind: "INTERNAL",
      start_time_us: 2000,
      finish_time_us: 6000,
    });
    const leafClient = createSpan({
      span_id: "r3",
      parent_span_id: "r2",
      kind: "CLIENT",
      start_time_us: 3000,
      finish_time_us: 3500,
      attribute: JSON.stringify({
        "db.system": "clickhouse",
        "server.address": "10.10.10.20",
        "server.port": "9440",
      }),
    });

    const topo = buildTopo([serverSpan, midSpan, leafClient]);
    expect(topo.nodes.map((node) => node.id).sort()).toEqual([
      "ClickHouse::",
      "clickhouse::10.10.10.20:9440",
      "entry::user",
    ]);
  });

  it("infers entry serviceName from http.user.agent", () => {
    const serverSpan = createSpan({
      span_id: "ua-root",
      parent_span_id: "",
      kind: "SERVER",
      attribute: JSON.stringify({
        "http.user.agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36",
      }),
    });

    const topo = buildTopo([serverSpan]);
    const entryNode = topo.nodes.find((node) => node.id === "entry::user");
    expect(entryNode).toBeDefined();
    expect(entryNode?.serviceName).toBe("Chrome (Macintosh; Intel Mac OS X 14_0)");
    expect(entryNode?.label).toBe("Chrome (Macintosh; Intel Mac OS X 14_0)");
  });

  it("uses ClickHouse as target service for CLIENT Connection::sendQuery()", () => {
    const serverSpan = createSpan({
      span_id: "ch-root",
      parent_span_id: "",
      kind: "SERVER",
    });
    const clientSpan = createSpan({
      span_id: "ch-client",
      parent_span_id: "ch-root",
      kind: "CLIENT",
      operation_name: "Connection::sendQuery()",
      attribute: JSON.stringify({
        "server.address": "10.20.30.40",
        "server.port": "9440",
      }),
    });

    const topo = buildTopo([serverSpan, clientSpan]);
    expect(
      topo.nodes.find(
        (node) => node.id === "ClickHouse::10.20.30.40:9440" && node.serviceName === "ClickHouse"
      )
    ).toBeDefined();
  });
});
