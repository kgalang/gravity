import { defineAgent } from "../contracts.js";

export const dataAnalystAgent = defineAgent({
  id: "data-analyst",
  name: "Wiggs",
  description: "Data analyst proof-of-concept agent.",
  model: "claude-sonnet-4-5-20250929",
  runtime: "host",
  resources: [
    {
      id: "warehouse",
      kind: "duckdb",
      path: "/Users/kevingalang/code/jaffle_shop_duckdb/jaffle_shop.duckdb",
    },
  ],
  session: {
    defaultMode: "thread",
  },
  listen: [
    {
      id: "slack-wiggs-slash",
      kind: "message",
      surface: "slack",
      entrypoint: "slash_command",
      sessionMode: "thread",
      match: {
        command: "/wiggs",
      },
      enabled: true,
    },
    {
      id: "slack-wiggs-mention",
      kind: "message",
      surface: "slack",
      entrypoint: "app_mention",
      sessionMode: "thread",
      enabled: true,
    },
    {
      id: "slack-wiggs-thread",
      kind: "message",
      surface: "slack",
      entrypoint: "thread_reply",
      match: {
        threadOwnedByAgent: true,
      },
      sessionMode: "thread",
      enabled: true,
    },
    {
      id: "slack-wiggs-dm",
      kind: "message",
      surface: "slack",
      entrypoint: "direct_message",
      sessionMode: "main",
      enabled: true,
    },
  ],
  proactive: {
    deliveryDefaults: {
      surface: "slack",
      mode: "channel_thread",
      channelId: "C0AFKMMDV4J",
    },
    triggers: [
      {
        id: "daily-metrics",
        kind: "cron",
        schedule: "0 9 * * *",
        sessionMode: "isolated",
        prompt: "Run the daily metrics check and summarize notable changes.",
        delivery: {
          surface: "slack",
          mode: "channel_thread",
          channelId: "C0AFKMMDV4J",
        },
        enabled: false,
      },
      {
        id: "founder-heartbeat",
        kind: "heartbeat",
        intervalSeconds: 1800,
        sessionMode: "main",
        prompt: "Check for anomalies and notify if action is needed.",
        delivery: {
          surface: "slack",
          mode: "dm",
          userId: "U123456",
        },
        enabled: false,
      },
    ],
  },
  useCapabilities: [
    {
      capability: "query-gravity-v1",
    },
    {
      capability: "rollback-v1",
    },
    {
      capability: "duckdb-analyst-v1",
      bindResources: {
        warehouse: "warehouse",
      },
    },
    {
      capability: "data-analyst-guidance-v1",
    },
  ],
});
