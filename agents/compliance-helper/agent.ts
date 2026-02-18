import { defineAgent } from "../contracts.js";

export const complianceHelperAgent = defineAgent({
  id: "compliance-helper",
  name: "Compliance Helper",
  description: "Compliance review proof-of-concept agent.",
  model: "claude-sonnet-4-5-20250929",
  runtime: "host",
  connectors: ["knowledge-docs"],
  session: {
    defaultMode: "thread",
  },
  listen: [
    {
      id: "slack-compliance-slash",
      kind: "message",
      surface: "slack",
      entrypoint: "slash_command",
      sessionMode: "thread",
      match: {
        command: "/compliance",
      },
      enabled: true,
    },
    {
      id: "slack-compliance-mention",
      kind: "message",
      surface: "slack",
      entrypoint: "app_mention",
      sessionMode: "thread",
      enabled: true,
    },
    {
      id: "slack-compliance-thread",
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
      id: "slack-compliance-dm",
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
      channelId: "C0AFYK6AVQR",
    },
    triggers: [],
  },
  tools: ["query-gravity", "rollback"],
});
