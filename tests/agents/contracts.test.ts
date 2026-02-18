import { describe, expect, it } from "vitest";
import { defineAgent, defineConfig } from "../../agents/contracts.js";

describe("defineConfig", () => {
  it("normalizes and freezes the canonical config contract", () => {
    const config = defineConfig({
      infra: {
        database: {
          urlEnvVar: " DATABASE_URL ",
        },
        slack: {
          appTokenEnvVar: " SLACK_APP_TOKEN ",
          botTokenEnvVar: " SLACK_BOT_TOKEN ",
        },
        modelProvider: {
          provider: "anthropic",
          apiKeyEnvVar: " ANTHROPIC_API_KEY ",
        },
      },
      defaults: {
        model: " claude-sonnet-4-5-20250929 ",
        runtime: "host",
        sessionMode: "thread",
        quietHours: {
          timezone: " America/Los_Angeles ",
          startHour: 22,
          endHour: 7,
          daysOfWeek: [1, 2, 2, 3],
        },
      },
      paths: {
        sharedRoot: " store/shared ",
        workspaceRoot: " workspace ",
      },
    });

    expect(config).toEqual({
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
          enabled: true,
          timezone: "America/Los_Angeles",
          startHour: 22,
          endHour: 7,
          daysOfWeek: [1, 2, 3],
        },
      },
      paths: {
        sharedRoot: "store/shared",
        workspaceRoot: "workspace",
      },
    });
    expect(Object.isFrozen(config)).toBe(true);
  });
});

describe("defineAgent", () => {
  it("normalizes listeners/tools and applies listener defaults", () => {
    const agent = defineAgent({
      id: " example-agent ",
      name: " Example Agent ",
      description: " Example description ",
      model: " claude-sonnet-4-5-20250929 ",
      connectors: [
        {
          type: "duckdb",
          path: " /tmp/warehouse.duckdb ",
        },
        {
          type: "knowledge-docs",
        },
      ],
      runtime: "host",
      listen: [
        {
          id: " slash-route ",
          kind: "message",
          surface: "slack",
          entrypoint: "slash_command",
          match: {
            command: " /Wiggs ",
          },
        },
        {
          id: " dm-route ",
          kind: "message",
          surface: "slack",
          entrypoint: "direct_message",
        },
      ],
      tools: [" query-gravity ", "query-gravity", " rollback "],
    });

    expect(agent.id).toBe("example-agent");
    expect(agent.name).toBe("Example Agent");
    expect(agent.description).toBe("Example description");
    expect(agent.model).toBe("claude-sonnet-4-5-20250929");
    expect(agent.connectors).toEqual([
      {
        type: "duckdb",
        path: "/tmp/warehouse.duckdb",
      },
      {
        type: "knowledge-docs",
      },
    ]);
    expect(agent.tools).toEqual(["query-gravity", "rollback"]);
    expect(agent.listen).toEqual([
      {
        id: "slash-route",
        kind: "message",
        surface: "slack",
        entrypoint: "slash_command",
        sessionMode: "thread",
        enabled: true,
        match: {
          command: "/wiggs",
        },
      },
      {
        id: "dm-route",
        kind: "message",
        surface: "slack",
        entrypoint: "direct_message",
        sessionMode: "main",
        enabled: true,
      },
    ]);
    expect(Object.isFrozen(agent)).toBe(true);
  });

  it("throws for slash listeners without a slash command matcher", () => {
    expect(() =>
      defineAgent({
        id: "broken-agent",
        name: "Broken Agent",
        listen: [
          {
            id: "broken-slash",
            kind: "message",
            surface: "slack",
            entrypoint: "slash_command",
          },
        ],
        tools: ["query-gravity"],
      }),
    ).toThrow(/requires match\.command/);
  });

  it("throws for duplicate connector types", () => {
    expect(() =>
      defineAgent({
        id: "duplicate-connector-agent",
        name: "Duplicate Connector Agent",
        connectors: [
          {
            type: "duckdb",
            path: "/tmp/one.duckdb",
          },
          {
            type: "duckdb",
            path: "/tmp/two.duckdb",
          },
        ],
        listen: [
          {
            id: "duplicate-connector-slash",
            kind: "message",
            surface: "slack",
            entrypoint: "slash_command",
            match: {
              command: "/dup",
            },
          },
        ],
        tools: ["query-gravity"],
      }),
    ).toThrow(/duplicates connector type/i);
  });

  it("throws when deprecated top-level duckdbPath is provided", () => {
    expect(() =>
      defineAgent({
        id: "deprecated-duckdb-path-agent",
        name: "Deprecated DuckDB Path Agent",
        connectors: [
          {
            type: "duckdb",
            path: "/tmp/current.duckdb",
          },
        ],
        duckdbPath: "/tmp/legacy.duckdb",
        listen: [
          {
            id: "deprecated-duckdb-path-slash",
            kind: "message",
            surface: "slack",
            entrypoint: "slash_command",
            match: {
              command: "/legacy",
            },
          },
        ],
        tools: ["query-gravity"],
      } as unknown as Parameters<typeof defineAgent>[0]),
    ).toThrow(/duckdbPath has been removed/i);
  });
});
