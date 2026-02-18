import { describe, expect, it } from "vitest";
import {
  buildSlashSessionKey,
  buildMessageSessionKey,
  buildProactiveSessionKey,
  buildSlashThreadSessionKey,
} from "../../src/runtime/session-key.js";

describe("buildSlashThreadSessionKey", () => {
  it("uses canonical thread session pattern for slash command runs", () => {
    expect(
      buildSlashThreadSessionKey("data-analyst", "1740000000.123456"),
    ).toBe("data-analyst:1740000000.123456");
  });
});

describe("buildSlashSessionKey", () => {
  it("uses main mode pattern", () => {
    expect(
      buildSlashSessionKey({
        agentId: "data-analyst",
        channelId: "C123",
        threadTs: "1740000000.123456",
        sourceEventId: "slash:1",
        sessionMode: "main",
      }),
    ).toBe("data-analyst:main");
  });

  it("uses isolated mode pattern", () => {
    expect(
      buildSlashSessionKey({
        agentId: "data-analyst",
        channelId: "C123",
        threadTs: "1740000000.123456",
        sourceEventId: "slash:2",
        sessionMode: "isolated",
      }),
    ).toBe("data-analyst:slash:2");
  });

  it("uses thread mode pattern", () => {
    expect(
      buildSlashSessionKey({
        agentId: "data-analyst",
        channelId: "C123",
        threadTs: "1740000000.123456",
        sourceEventId: "slash:3",
        sessionMode: "thread",
      }),
    ).toBe("data-analyst:1740000000.123456");
  });

  it("falls back to channel affinity key when threadTs is blank", () => {
    expect(
      buildSlashSessionKey({
        agentId: "data-analyst",
        channelId: "C123",
        threadTs: "   ",
        sourceEventId: "slash:4",
        sessionMode: "thread",
      }),
    ).toBe("data-analyst:C123");
  });
});

describe("buildMessageSessionKey", () => {
  it("uses main mode pattern", () => {
    expect(
      buildMessageSessionKey({
        agentId: "data-analyst",
        channelId: "D123",
        threadTs: "1740000000.1",
        sourceEventId: "evt-1",
        sessionMode: "main",
        isDirectMessage: true,
      }),
    ).toBe("data-analyst:main");
  });

  it("uses isolated mode pattern", () => {
    expect(
      buildMessageSessionKey({
        agentId: "data-analyst",
        channelId: "C123",
        threadTs: "1740000000.1",
        sourceEventId: "evt-2",
        sessionMode: "isolated",
        isDirectMessage: false,
      }),
    ).toBe("data-analyst:evt-2");
  });

  it("uses thread mode threadTs pattern for channel threads", () => {
    expect(
      buildMessageSessionKey({
        agentId: "data-analyst",
        channelId: "C123",
        threadTs: "1740000000.1",
        sourceEventId: "evt-3",
        sessionMode: "thread",
        isDirectMessage: false,
      }),
    ).toBe("data-analyst:1740000000.1");
  });

  it("uses DM thread fallback channel pattern when in thread mode", () => {
    expect(
      buildMessageSessionKey({
        agentId: "data-analyst",
        channelId: "D123",
        threadTs: "1740000000.1",
        sourceEventId: "evt-4",
        sessionMode: "thread",
        isDirectMessage: true,
      }),
    ).toBe("data-analyst:D123");
  });
});

describe("buildProactiveSessionKey", () => {
  it("uses main mode proactive session pattern", () => {
    expect(
      buildProactiveSessionKey({
        agentId: "data-analyst",
        triggerId: "heartbeat",
        sourceEventId: "proactive:1",
        sessionMode: "main",
      }),
    ).toBe("data-analyst:main");
  });

  it("uses thread mode proactive session pattern", () => {
    expect(
      buildProactiveSessionKey({
        agentId: "data-analyst",
        triggerId: "heartbeat",
        sourceEventId: "proactive:2",
        sessionMode: "thread",
      }),
    ).toBe("data-analyst:proactive:heartbeat:thread");
  });

  it("uses isolated mode proactive session pattern", () => {
    expect(
      buildProactiveSessionKey({
        agentId: "data-analyst",
        triggerId: "heartbeat",
        sourceEventId: "proactive:3",
        sessionMode: "isolated",
      }),
    ).toBe("data-analyst:proactive:heartbeat:proactive:3");
  });
});
