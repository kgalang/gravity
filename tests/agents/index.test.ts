import { describe, expect, it } from "vitest";
import { defineAgent, defineConfig } from "../../agents/contracts.js";
import { agentRegistry, createAgentRegistry } from "../../agents/index.js";

const testConfig = defineConfig({
  infra: {
    database: {
      urlEnvVar: "DATABASE_URL",
    },
    slack: {
      appTokenEnvVar: "SLACK_APP_TOKEN",
      botTokenEnvVar: "SLACK_BOT_TOKEN",
    },
    modelProvider: {
      provider: "anthropic",
      apiKeyEnvVar: "ANTHROPIC_API_KEY",
    },
  },
  defaults: {
    model: "claude-sonnet-4-5-20250929",
    runtime: "host",
    sessionMode: "thread",
  },
  paths: {
    sharedRoot: "store/shared",
    workspaceRoot: "workspace",
  },
});

describe("agentRegistry", () => {
  it("registers built-in agents with deterministic slash routes", () => {
    expect(agentRegistry.agentsById.has("data-analyst")).toBe(true);
    expect(agentRegistry.agentsById.has("compliance-helper")).toBe(true);

    expect(agentRegistry.slashCommandListeners.get("/wiggs")).toEqual({
      agentId: "data-analyst",
      listenerId: "slack-wiggs-slash",
      command: "/wiggs",
      sessionMode: "thread",
    });
    expect(agentRegistry.slashCommandListeners.get("/compliance")).toEqual({
      agentId: "compliance-helper",
      listenerId: "slack-compliance-slash",
      command: "/compliance",
      sessionMode: "thread",
    });
  });
});

describe("createAgentRegistry", () => {
  it("throws when agent IDs collide", () => {
    const first = defineAgent({
      id: "duplicate-agent",
      name: "Duplicate One",
      listen: [
        {
          id: "slash-one",
          kind: "message",
          surface: "slack",
          entrypoint: "slash_command",
          match: {
            command: "/one",
          },
        },
      ],
      tools: ["query-gravity"],
    });
    const second = defineAgent({
      id: "duplicate-agent",
      name: "Duplicate Two",
      listen: [
        {
          id: "slash-two",
          kind: "message",
          surface: "slack",
          entrypoint: "slash_command",
          match: {
            command: "/two",
          },
        },
      ],
      tools: ["query-gravity"],
    });

    expect(() =>
      createAgentRegistry({
        config: testConfig,
        agents: [first, second],
      }),
    ).toThrow(/duplicate agent id/i);
  });

  it("throws when slash commands collide across agents", () => {
    const first = defineAgent({
      id: "alpha",
      name: "Alpha",
      listen: [
        {
          id: "alpha-slash",
          kind: "message",
          surface: "slack",
          entrypoint: "slash_command",
          match: {
            command: "/shared",
          },
        },
      ],
      tools: ["query-gravity"],
    });
    const second = defineAgent({
      id: "beta",
      name: "Beta",
      listen: [
        {
          id: "beta-slash",
          kind: "message",
          surface: "slack",
          entrypoint: "slash_command",
          match: {
            command: "/shared",
          },
        },
      ],
      tools: ["query-gravity"],
    });

    expect(() =>
      createAgentRegistry({
        config: testConfig,
        agents: [first, second],
      }),
    ).toThrow(/slash command collision/i);
  });
});
