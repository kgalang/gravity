import { describe, expect, it } from "vitest";
import {
  resolveMessageIngress,
  type ActiveAgentIngressRow,
} from "../../src/runtime/ingress-binding-resolver.js";
import type { InboundSlackMessage } from "../../src/runtime/slack-transport.js";

function createBaseMessage(
  overrides: Partial<InboundSlackMessage> = {},
): InboundSlackMessage {
  return {
    surface: "app_mention",
    sourceEventId: "evt-1",
    channelId: "C123",
    threadTs: "1700000000.1",
    messageTs: "1700000000.1",
    userId: "U123",
    text: "hello",
    isDirectMessage: false,
    ...overrides,
  };
}

function createAgent(
  overrides: Partial<ActiveAgentIngressRow> = {},
): ActiveAgentIngressRow {
  return {
    id: "data-analyst",
    channel_id: "C123",
    config: {},
    ...overrides,
  };
}

describe("resolveMessageIngress", () => {
  it("uses ingress bindings for app mentions", () => {
    const message = createBaseMessage();
    const agents: ActiveAgentIngressRow[] = [
      createAgent({
        config: {
          ingressBindings: [
            {
              kind: "message",
              surface: "slack",
              entrypoint: "app_mention",
              sessionMode: "thread",
              enabled: true,
            },
          ],
        },
      }),
    ];

    expect(resolveMessageIngress(message, agents)).toEqual({
      agentId: "data-analyst",
      entrypoint: "app_mention",
      sessionMode: "thread",
      route: "binding",
    });
  });

  it("uses direct message binding with main session mode", () => {
    const message = createBaseMessage({
      surface: "message",
      isDirectMessage: true,
      channelId: "D123",
      threadTs: "1700000001.1",
      messageTs: "1700000001.1",
    });
    const agents: ActiveAgentIngressRow[] = [
      createAgent({
        config: {
          ingressBindings: [
            {
              kind: "message",
              surface: "slack",
              entrypoint: "direct_message",
              sessionMode: "main",
              enabled: true,
              match: { userId: "U123" },
            },
          ],
        },
      }),
    ];

    expect(resolveMessageIngress(message, agents)).toEqual({
      agentId: "data-analyst",
      entrypoint: "direct_message",
      sessionMode: "main",
      route: "binding",
    });
  });

  it("treats DM thread replies as thread_reply entrypoint", () => {
    const message = createBaseMessage({
      surface: "message",
      isDirectMessage: true,
      channelId: "D123",
      threadTs: "1700000001.1",
      messageTs: "1700000001.2",
    });
    const agents: ActiveAgentIngressRow[] = [
      createAgent({
        id: "data-analyst",
        channel_id: null,
        config: {
          ingressBindings: [
            {
              kind: "message",
              surface: "slack",
              entrypoint: "thread_reply",
              sessionMode: "thread",
              enabled: true,
              match: { threadOwnedByAgent: true },
            },
          ],
        },
      }),
    ];

    expect(
      resolveMessageIngress(message, agents, { threadOwnerAgentId: "data-analyst" }),
    ).toEqual({
      agentId: "data-analyst",
      entrypoint: "thread_reply",
      sessionMode: "thread",
      route: "binding",
    });
  });

  it("returns null for thread replies when no binding exists", () => {
    const message = createBaseMessage({
      surface: "message",
      threadTs: "1700000000.1",
      messageTs: "1700000000.2",
    });
    const agents: ActiveAgentIngressRow[] = [createAgent()];

    expect(resolveMessageIngress(message, agents)).toBeNull();
  });

  it("prefers channel-affinity agent when multiple bindings match", () => {
    const message = createBaseMessage({
      surface: "app_mention",
      channelId: "C-WIGGS",
    });
    const agents: ActiveAgentIngressRow[] = [
      createAgent({
        id: "compliance-helper",
        channel_id: "C-COMPLIANCE",
        config: {
          ingressBindings: [
            {
              kind: "message",
              surface: "slack",
              entrypoint: "app_mention",
              sessionMode: "thread",
              enabled: true,
            },
          ],
        },
      }),
      createAgent({
        id: "data-analyst",
        channel_id: "C-WIGGS",
        config: {
          ingressBindings: [
            {
              kind: "message",
              surface: "slack",
              entrypoint: "app_mention",
              sessionMode: "thread",
              enabled: true,
            },
          ],
        },
      }),
    ];

    expect(resolveMessageIngress(message, agents)).toMatchObject({
      agentId: "data-analyst",
      entrypoint: "app_mention",
      route: "binding",
    });
  });

  it("enforces threadOwnedByAgent against known thread owner", () => {
    const message = createBaseMessage({
      surface: "message",
      channelId: "C-WIGGS",
      threadTs: "1700000000.1",
      messageTs: "1700000000.2",
    });
    const agents: ActiveAgentIngressRow[] = [
      createAgent({
        id: "compliance-helper",
        channel_id: "C-COMPLIANCE",
        config: {
          ingressBindings: [
            {
              kind: "message",
              surface: "slack",
              entrypoint: "thread_reply",
              sessionMode: "thread",
              enabled: true,
              match: { threadOwnedByAgent: true },
            },
          ],
        },
      }),
      createAgent({
        id: "data-analyst",
        channel_id: "C-WIGGS",
        config: {
          ingressBindings: [
            {
              kind: "message",
              surface: "slack",
              entrypoint: "thread_reply",
              sessionMode: "thread",
              enabled: true,
              match: { threadOwnedByAgent: true },
            },
          ],
        },
      }),
    ];

    expect(
      resolveMessageIngress(message, agents, { threadOwnerAgentId: "data-analyst" }),
    ).toMatchObject({
      agentId: "data-analyst",
      entrypoint: "thread_reply",
      route: "binding",
    });
  });

  it("returns null for unsupported top-level channel message events", () => {
    const message = createBaseMessage({
      surface: "message",
      threadTs: "1700000000.1",
      messageTs: "1700000000.1",
    });
    const agents: ActiveAgentIngressRow[] = [createAgent()];

    expect(resolveMessageIngress(message, agents)).toBeNull();
  });

  it("ignores malformed binding entries without throwing", () => {
    const message = createBaseMessage();
    const agents: ActiveAgentIngressRow[] = [
      createAgent({
        config: {
          ingressBindings: [
            null,
            {
              kind: "message",
              surface: "slack",
              entrypoint: "app_mention",
              sessionMode: "thread",
              enabled: true,
            },
          ],
        } as unknown as ActiveAgentIngressRow["config"],
      }),
    ];

    expect(() => resolveMessageIngress(message, agents)).not.toThrow();
    expect(resolveMessageIngress(message, agents)).toEqual({
      agentId: "data-analyst",
      entrypoint: "app_mention",
      sessionMode: "thread",
      route: "binding",
    });
  });
});
