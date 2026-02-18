import { describe, expect, it } from "vitest";
import { parseAgentConfig } from "../../src/runtime/agent-config.js";

describe("parseAgentConfig", () => {
  it("normalizes and trims supported config blocks", () => {
    const parsed = parseAgentConfig({
      connector: " duckdb ",
      duckdb_path: " /tmp/example.duckdb ",
      ingressBindings: [
        {
          id: " binding-1 ",
          kind: "message",
          surface: "slack",
          entrypoint: "direct_message",
          match: {
            channelId: " D123 ",
            userId: " U123 ",
            isDirectMessage: true,
          },
        },
      ],
      deliveryDefaults: {
        surface: "slack",
        mode: "channel_thread",
        channelId: " C555 ",
      },
      proactiveTriggers: [
        {
          id: " hourly ",
          kind: "heartbeat",
          intervalSeconds: 900.9,
          prompt: " ping ",
          delivery: {
            surface: "slack",
            mode: "dm",
            userId: " U777 ",
          },
        },
      ],
      policy: {
        quietHours: {
          timezone: " America/Los_Angeles ",
          startHour: 22,
          endHour: 7,
          daysOfWeek: [1, 2, 2, 3],
        },
      },
    });

    expect(parsed).toEqual({
      connector: "duckdb",
      duckdb_path: "/tmp/example.duckdb",
      ingressBindings: [
        {
          id: "binding-1",
          kind: "message",
          surface: "slack",
          entrypoint: "direct_message",
          enabled: true,
          match: {
            channelId: "D123",
            userId: "U123",
            isDirectMessage: true,
          },
        },
      ],
      deliveryDefaults: {
        surface: "slack",
        mode: "channel_thread",
        channelId: "C555",
      },
      proactiveTriggers: [
        {
          id: "hourly",
          kind: "heartbeat",
          intervalSeconds: 900,
          prompt: "ping",
          enabled: true,
          delivery: {
            surface: "slack",
            mode: "dm",
            userId: "U777",
          },
        },
      ],
      policy: {
        quietHours: {
          enabled: true,
          timezone: "America/Los_Angeles",
          startHour: 22,
          endHour: 7,
          daysOfWeek: [1, 2, 3],
        },
      },
    });
  });

  it("fails closed when any config block is invalid", () => {
    const warnings: string[] = [];

    const parsed = parseAgentConfig(
      {
        ingressBindings: [
          {
            kind: "message",
            surface: "slack",
            entrypoint: "app_mention",
          },
          {
            kind: "bad-kind",
            surface: "slack",
            entrypoint: "app_mention",
          },
        ],
        proactiveTriggers: [
          {
            id: "ok-cron",
            kind: "cron",
            schedule: "0 9 * * *",
            prompt: "run",
          },
          {
            id: "bad-heartbeat",
            kind: "heartbeat",
            intervalSeconds: 2,
            prompt: "skip",
          },
        ],
      },
      {
        warn: (line) => {
          warnings.push(line);
        },
        context: "agentId=test-agent",
      },
    );

    expect(parsed).toEqual({});
    expect(warnings.length).toBeGreaterThanOrEqual(1);
    expect(warnings[0]).toContain("agentId=test-agent");
  });

  it("returns an empty config for non-object values", () => {
    expect(parseAgentConfig(null)).toEqual({});
    expect(parseAgentConfig("invalid")).toEqual({});
    expect(parseAgentConfig(42)).toEqual({});
  });

  it("fails closed for invalid quiet-hours policy", () => {
    const parsed = parseAgentConfig({
      policy: {
        quietHours: {
          timezone: "   ",
          startHour: 22,
          endHour: 7,
        },
      },
    });

    expect(parsed).toEqual({});
  });
});
