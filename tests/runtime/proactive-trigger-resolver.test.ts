import { describe, expect, it } from "vitest";
import {
  resolveProactiveTriggers,
  type ActiveAgentProactiveRow,
} from "../../src/runtime/proactive-trigger-resolver.js";

describe("resolveProactiveTriggers", () => {
  it("resolves cron and heartbeat triggers with explicit delivery targets", () => {
    const triggers = resolveProactiveTriggers([
      {
        id: "data-analyst",
        channel_id: "C123",
        config: {
          proactiveTriggers: [
            {
              id: "daily-metrics",
              kind: "cron",
              schedule: "0 9 * * *",
              prompt: "Run daily metrics check",
              sessionMode: "isolated",
              delivery: {
                surface: "slack",
                mode: "channel_thread",
                channelId: "C555",
              },
            },
            {
              id: "founder-heartbeat",
              kind: "heartbeat",
              intervalSeconds: 1800,
              prompt: "Check anomalies",
              sessionMode: "thread",
              delivery: {
                surface: "slack",
                mode: "dm",
                userId: "U123",
              },
            },
          ],
        },
      } satisfies ActiveAgentProactiveRow,
    ]);

    expect(triggers).toEqual([
      {
        agentId: "data-analyst",
        triggerId: "daily-metrics",
        kind: "cron",
        schedule: "0 9 * * *",
        prompt: "Run daily metrics check",
        sessionMode: "isolated",
        delivery: {
          surface: "slack",
          mode: "channel_thread",
          channelId: "C555",
        },
      },
      {
        agentId: "data-analyst",
        triggerId: "founder-heartbeat",
        kind: "heartbeat",
        intervalSeconds: 1800,
        prompt: "Check anomalies",
        // thread sessions are invalid for DM delivery and should fall back to main
        sessionMode: "main",
        delivery: {
          surface: "slack",
          mode: "dm",
          userId: "U123",
        },
      },
    ]);
  });

  it("uses delivery defaults and channel fallback when trigger delivery is omitted", () => {
    const triggers = resolveProactiveTriggers([
      {
        id: "with-defaults",
        channel_id: "C111",
        config: {
          deliveryDefaults: {
            surface: "slack",
            mode: "dm",
            userId: "U999",
          },
          proactiveTriggers: [
            {
              id: "heartbeat-defaults",
              kind: "heartbeat",
              intervalSeconds: 900,
              prompt: "Monitor queue depth",
            },
          ],
        },
      } satisfies ActiveAgentProactiveRow,
      {
        id: "channel-fallback",
        channel_id: "C222",
        config: {
          proactiveTriggers: [
            {
              id: "cron-fallback",
              kind: "cron",
              schedule: "*/10 * * * *",
              prompt: "Post summary",
            },
          ],
        },
      } satisfies ActiveAgentProactiveRow,
    ]);

    expect(triggers).toEqual([
      {
        agentId: "with-defaults",
        triggerId: "heartbeat-defaults",
        kind: "heartbeat",
        intervalSeconds: 900,
        prompt: "Monitor queue depth",
        sessionMode: "isolated",
        delivery: {
          surface: "slack",
          mode: "dm",
          userId: "U999",
        },
      },
      {
        agentId: "channel-fallback",
        triggerId: "cron-fallback",
        kind: "cron",
        schedule: "*/10 * * * *",
        prompt: "Post summary",
        sessionMode: "isolated",
        delivery: {
          surface: "slack",
          mode: "channel_thread",
          channelId: "C222",
        },
      },
    ]);
  });

  it("ignores disabled and invalid proactive trigger entries", () => {
    const triggers = resolveProactiveTriggers([
      {
        id: "data-analyst",
        channel_id: null,
        config: {
          proactiveTriggers: [
            {
              id: "disabled-trigger",
              kind: "heartbeat",
              intervalSeconds: 300,
              prompt: "skip",
              enabled: false,
            },
            {
              id: "missing-delivery-and-channel",
              kind: "cron",
              schedule: "0 * * * *",
              prompt: "skip",
            },
            {
              id: "bad-heartbeat",
              kind: "heartbeat",
              intervalSeconds: 2,
              prompt: "skip",
              delivery: {
                surface: "slack",
                mode: "dm",
                userId: "U123",
              },
            },
          ],
        },
      } satisfies ActiveAgentProactiveRow,
    ]);

    expect(triggers).toEqual([]);
  });

  it("ignores malformed trigger entries without throwing", () => {
    const triggers = resolveProactiveTriggers([
      {
        id: "data-analyst",
        channel_id: "C123",
        config: {
          proactiveTriggers: [
            null,
            {
              id: "hourly",
              kind: "heartbeat",
              intervalSeconds: 900,
              prompt: "Run heartbeat check",
            },
          ],
        } as unknown as ActiveAgentProactiveRow["config"],
      } satisfies ActiveAgentProactiveRow,
    ]);

    expect(triggers).toEqual([
      {
        agentId: "data-analyst",
        triggerId: "hourly",
        kind: "heartbeat",
        intervalSeconds: 900,
        prompt: "Run heartbeat check",
        sessionMode: "isolated",
        delivery: {
          surface: "slack",
          mode: "channel_thread",
          channelId: "C123",
        },
      },
    ]);
  });
});
