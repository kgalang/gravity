import { describe, expect, it, vi } from "vitest";
import {
  normalizeAppMentionEvent,
  normalizeMessageEvent,
  SlackTransport,
  type SocketModeClientLike,
  type WebClientLike,
} from "../../src/runtime/slack-transport.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class FakeSocketModeClient implements SocketModeClientLike {
  private handlers = new Map<
    "app_mention" | "message",
    Array<(payload: unknown) => void | Promise<void>>
  >();

  started = false;

  on(
    eventName: "app_mention" | "message",
    handler: (payload: unknown) => void | Promise<void>,
  ): void {
    const current = this.handlers.get(eventName) ?? [];
    current.push(handler);
    this.handlers.set(eventName, current);
  }

  async start(): Promise<void> {
    this.started = true;
  }

  async disconnect(): Promise<void> {
    this.started = false;
  }

  async emit(
    eventName: "app_mention" | "message",
    payload: unknown,
  ): Promise<void> {
    const handlers = this.handlers.get(eventName) ?? [];

    for (const handler of handlers) {
      await handler(payload);
    }
  }
}

class FakeWebClient implements WebClientLike {
  readonly auth: WebClientLike["auth"];
  readonly chat: WebClientLike["chat"];

  constructor(botUserId: string) {
    this.auth = {
      test: vi.fn(async () => ({ user_id: botUserId })),
    };
    this.chat = {
      postMessage: vi.fn(async () => ({ ts: "reply-ts" })),
    };
  }
}

describe("normalizeAppMentionEvent", () => {
  it("normalizes channel mentions into routed payloads", () => {
    const normalized = normalizeAppMentionEvent({
      channel: "C123",
      user: "U456",
      text: "<@UBOT> summarize this",
      ts: "1700000000.123",
      thread_ts: "1700000000.001",
      client_msg_id: "client-123",
    });

    expect(normalized).toEqual({
      surface: "app_mention",
      sourceEventId: "client-123",
      channelId: "C123",
      threadTs: "1700000000.001",
      messageTs: "1700000000.123",
      userId: "U456",
      text: "summarize this",
      isDirectMessage: false,
    });
  });

  it("ignores DM app_mention events", () => {
    const normalized = normalizeAppMentionEvent({
      channel: "D123",
      user: "U456",
      text: "<@UBOT> hello",
      ts: "1700000000.123",
    });

    expect(normalized).toBeNull();
  });
});

describe("normalizeMessageEvent", () => {
  it("dedupes channel mention events that will arrive via app_mention", () => {
    const normalized = normalizeMessageEvent(
      {
        channel: "C123",
        channel_type: "channel",
        user: "U456",
        text: "hey <@UBOT>",
        ts: "1700000000.123",
      },
      { botUserId: "UBOT" },
    );

    expect(normalized).toBeNull();
  });

  it("keeps DM messages and normalizes thread fallback", () => {
    const normalized = normalizeMessageEvent(
      {
        channel: "D123",
        channel_type: "im",
        user: "U456",
        text: "help me",
        ts: "1700000000.123",
      },
      { botUserId: "UBOT" },
    );

    expect(normalized).toEqual({
      surface: "message",
      sourceEventId: "D123:1700000000.123:U456",
      channelId: "D123",
      threadTs: "1700000000.123",
      messageTs: "1700000000.123",
      userId: "U456",
      text: "help me",
      isDirectMessage: true,
    });
  });
});

describe("SlackTransport", () => {
  it("processes inbound events sequentially per channel", async () => {
    const socket = new FakeSocketModeClient();
    const web = new FakeWebClient("UBOT");
    const calls: string[] = [];

    let resolveDone: (() => void) | null = null;
    const done = new Promise<void>((resolve) => {
      resolveDone = resolve;
    });

    const transport = new SlackTransport({
      appToken: "xapp-test",
      botToken: "xoxb-test",
      socketClient: socket,
      webClient: web,
      onInboundMessage: async (message) => {
        calls.push(`start:${message.messageTs}`);

        if (message.messageTs === "1.000") {
          await sleep(25);
        }

        calls.push(`end:${message.messageTs}`);

        if (calls.length === 4 && resolveDone) {
          resolveDone();
          resolveDone = null;
        }
      },
      log: () => {
        // no-op for tests
      },
    });

    await transport.start();

    const ackOne = vi.fn(async () => undefined);
    const ackTwo = vi.fn(async () => undefined);

    await socket.emit("app_mention", {
      event: {
        channel: "C123",
        user: "U456",
        text: "<@UBOT> first",
        ts: "1.000",
      },
      ack: ackOne,
    });

    await socket.emit("app_mention", {
      event: {
        channel: "C123",
        user: "U456",
        text: "<@UBOT> second",
        ts: "2.000",
      },
      ack: ackTwo,
    });

    await done;

    expect(calls).toEqual([
      "start:1.000",
      "end:1.000",
      "start:2.000",
      "end:2.000",
    ]);
    expect(ackOne).toHaveBeenCalledTimes(1);
    expect(ackTwo).toHaveBeenCalledTimes(1);
  });

  it("ignores message envelopes that do not contain Slack message fields", async () => {
    const socket = new FakeSocketModeClient();
    const web = new FakeWebClient("UBOT");
    const onInboundMessage = vi.fn(async () => undefined);
    const ack = vi.fn(async () => undefined);

    const transport = new SlackTransport({
      appToken: "xapp-test",
      botToken: "xoxb-test",
      socketClient: socket,
      webClient: web,
      onInboundMessage,
      log: () => {
        // no-op for tests
      },
    });

    await transport.start();

    await socket.emit("message", {
      body: {
        type: "message",
      },
      ack,
    });

    await sleep(10);

    expect(ack).toHaveBeenCalledTimes(1);
    expect(onInboundMessage).not.toHaveBeenCalled();
  });
});
