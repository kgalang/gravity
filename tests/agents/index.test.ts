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
      entrypoint: "slash_command",
      match: {
        command: "/wiggs",
      },
      trigger: {
        triggerKind: "message",
        surface: "slack",
        entrypoint: "slash_command",
        runIdPattern: "slack:{sourceEventId}",
      },
    });
    expect(agentRegistry.slashCommandListeners.get("/compliance")).toEqual({
      agentId: "compliance-helper",
      listenerId: "slack-compliance-slash",
      command: "/compliance",
      sessionMode: "thread",
      entrypoint: "slash_command",
      match: {
        command: "/compliance",
      },
      trigger: {
        triggerKind: "message",
        surface: "slack",
        entrypoint: "slash_command",
        runIdPattern: "slack:{sourceEventId}",
      },
    });

    expect(
      agentRegistry.compiledDeclarations.ingress.slashCommands["/wiggs"],
    ).toMatchObject({
      agentId: "data-analyst",
      listenerId: "slack-wiggs-slash",
      command: "/wiggs",
      trigger: {
        triggerKind: "message",
        surface: "slack",
        entrypoint: "slash_command",
        runIdPattern: "slack:{sourceEventId}",
      },
    });
    expect(agentRegistry.compiledDeclarations.ingress.listeners.length).toBe(8);
    expect(
      agentRegistry.compiledDeclarations.ingress.messageByEntrypoint.app_mention
        .length,
    ).toBe(2);
    expect(
      agentRegistry.compiledDeclarations.ingress.messageByEntrypoint.thread_reply
        .length,
    ).toBe(2);
    expect(
      agentRegistry.compiledDeclarations.ingress.messageByEntrypoint.direct_message
        .length,
    ).toBe(2);
    expect(agentRegistry.compiledDeclarations.proactive.triggers).toEqual([]);
    expect(agentRegistry.compiledDeclarations.sessions.dimensions.length).toBe(8);
    expect(agentRegistry.compiledDeclarations.triggerDimensions.length).toBe(8);
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
      useCapabilities: [{ capability: "query-gravity-v1", bindResources: {} }],
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
      useCapabilities: [{ capability: "query-gravity-v1", bindResources: {} }],
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
      useCapabilities: [{ capability: "query-gravity-v1", bindResources: {} }],
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
      useCapabilities: [{ capability: "query-gravity-v1", bindResources: {} }],
    });

    expect(() =>
      createAgentRegistry({
        config: testConfig,
        agents: [first, second],
      }),
    ).toThrow(/slash command collision/i);
  });

  it("compiles proactive/session dimensions and trigger identities", () => {
    const compiled = createAgentRegistry({
      config: testConfig,
      agents: [
        defineAgent({
          id: "alpha",
          name: "Alpha",
          quietHours: {
            timezone: "America/Los_Angeles",
            startHour: 22,
            endHour: 7,
          },
          listen: [
            {
              id: "alpha-slash",
              kind: "message",
              surface: "slack",
              entrypoint: "slash_command",
              match: {
                command: "/alpha",
              },
            },
          ],
          proactive: {
            deliveryDefaults: {
              surface: "slack",
              mode: "dm",
              userId: "U999",
            },
            triggers: [
              {
                id: "nightly",
                kind: "cron",
                schedule: "0 9 * * *",
                prompt: "run nightly",
                sessionMode: "thread",
              },
            ],
          },
          useCapabilities: [{ capability: "query-gravity-v1", bindResources: {} }],
        }),
      ],
    }).compiledDeclarations;

    expect(compiled.proactive.triggers).toEqual([
      {
        agentId: "alpha",
        triggerId: "nightly",
        kind: "cron",
        schedule: "0 9 * * *",
        prompt: "run nightly",
        sessionMode: "main",
        delivery: {
          surface: "slack",
          mode: "dm",
          userId: "U999",
        },
        quietHours: {
          enabled: true,
          timezone: "America/Los_Angeles",
          startHour: 22,
          endHour: 7,
        },
        trigger: {
          triggerKind: "cron",
          surface: "system",
          entrypoint: "cron",
          runIdPattern: "{sourceEventId}",
        },
      },
    ]);
    expect(compiled.sessions.dimensions).toContainEqual({
      agentId: "alpha",
      sourceKind: "proactive",
      sourceId: "nightly",
      sessionMode: "main",
      sessionKeyPatterns: ["{agentId}:main"],
      trigger: {
        triggerKind: "cron",
        surface: "system",
        entrypoint: "cron",
        runIdPattern: "{sourceEventId}",
      },
    });
  });

  it("omits proactive quiet hours when policy is explicitly disabled", () => {
    const configWithDisabledQuietHours = defineConfig({
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
        quietHours: {
          enabled: false,
          timezone: "UTC",
          startHour: 0,
          endHour: 0,
        },
      },
      paths: {
        sharedRoot: "store/shared",
        workspaceRoot: "workspace",
      },
    });

    const compiled = createAgentRegistry({
      config: configWithDisabledQuietHours,
      agents: [
        defineAgent({
          id: "alpha",
          name: "Alpha",
          listen: [
            {
              id: "alpha-slash",
              kind: "message",
              surface: "slack",
              entrypoint: "slash_command",
              match: {
                command: "/alpha",
              },
            },
          ],
          proactive: {
            deliveryDefaults: {
              surface: "slack",
              mode: "dm",
              userId: "U999",
            },
            triggers: [
              {
                id: "heartbeat",
                kind: "heartbeat",
                intervalSeconds: 300,
                prompt: "ping",
              },
            ],
          },
          useCapabilities: [{ capability: "query-gravity-v1", bindResources: {} }],
        }),
      ],
    }).compiledDeclarations;

    expect(compiled.proactive.triggers).toEqual([
      {
        agentId: "alpha",
        triggerId: "heartbeat",
        kind: "heartbeat",
        intervalSeconds: 300,
        prompt: "ping",
        sessionMode: "isolated",
        delivery: {
          surface: "slack",
          mode: "dm",
          userId: "U999",
        },
        trigger: {
          triggerKind: "heartbeat",
          surface: "system",
          entrypoint: "heartbeat",
          runIdPattern: "{sourceEventId}",
        },
      },
    ]);
  });

  it("throws when a proactive trigger cannot resolve a delivery target", () => {
    expect(() =>
      createAgentRegistry({
        config: testConfig,
        agents: [
          defineAgent({
            id: "alpha",
            name: "Alpha",
            listen: [
              {
                id: "alpha-slash",
                kind: "message",
                surface: "slack",
                entrypoint: "slash_command",
                match: {
                  command: "/alpha",
                },
              },
            ],
            proactive: {
              triggers: [
                {
                  id: "missing-delivery",
                  kind: "heartbeat",
                  intervalSeconds: 300,
                  prompt: "ping",
                },
              ],
            },
            useCapabilities: [{ capability: "query-gravity-v1", bindResources: {} }],
          }),
        ],
      }),
    ).toThrow(/missing delivery and proactive deliveryDefaults/i);
  });
});
