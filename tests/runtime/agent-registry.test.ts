import { describe, expect, it, vi } from "vitest";
import {
  buildChannelAgentMap,
  resolveInboundSlackRoute,
} from "../../src/runtime/agent-registry.js";
import type { InboundSlackMessage } from "../../src/runtime/slack-transport.js";

function createInboundMessage(overrides?: Partial<InboundSlackMessage>): InboundSlackMessage {
  return {
    surface: "message",
    sourceEventId: "event-1",
    channelId: "C123",
    threadTs: "1700000000.100",
    messageTs: "1700000000.100",
    userId: "U123",
    text: "hello",
    isDirectMessage: false,
    ...overrides,
  };
}

describe("buildChannelAgentMap", () => {
  it("keeps only non-empty channel mappings", () => {
    const routes = buildChannelAgentMap([
      { id: "agent-a", channel_id: "C111" },
      { id: "agent-b", channel_id: " C222 " },
      { id: "agent-c", channel_id: null },
      { id: "agent-d", channel_id: "   " },
    ]);

    expect(routes.size).toBe(2);
    expect(routes.get("C111")).toBe("agent-a");
    expect(routes.get("C222")).toBe("agent-b");
  });

  it("keeps first mapping when duplicates exist", () => {
    const log = vi.fn();

    const routes = buildChannelAgentMap(
      [
        { id: "agent-a", channel_id: "C111" },
        { id: "agent-b", channel_id: "C111" },
      ],
      log,
    );

    expect(routes.get("C111")).toBe("agent-a");
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0]?.[0]).toContain(
      "duplicate active channel route detected",
    );
  });
});

describe("resolveInboundSlackRoute", () => {
  it("returns a routed payload for mapped channels", () => {
    const channelMap = new Map<string, string>([["C123", "agent-a"]]);
    const routed = resolveInboundSlackRoute(createInboundMessage(), channelMap);

    expect(routed?.agentId).toBe("agent-a");
    expect(routed?.channelId).toBe("C123");
    expect(routed?.sourceEventId).toBe("event-1");
  });

  it("returns null for unmapped channels", () => {
    const channelMap = new Map<string, string>([["C123", "agent-a"]]);
    const routed = resolveInboundSlackRoute(
      createInboundMessage({
        channelId: "C999",
        sourceEventId: "event-2",
      }),
      channelMap,
    );

    expect(routed).toBeNull();
  });
});
