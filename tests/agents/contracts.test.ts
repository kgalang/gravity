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
  it("normalizes listeners/resources/capabilities and applies listener defaults", () => {
    const agent = defineAgent({
      id: " example-agent ",
      name: " Example Agent ",
      description: " Example description ",
      model: " claude-sonnet-4-5-20250929 ",
      resources: [
        {
          id: " warehouse ",
          kind: "duckdb",
          path: " /tmp/warehouse.duckdb ",
        },
        {
          id: " policy-docs ",
          kind: "knowledge-docs",
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
      useCapabilities: [
        {
          capability: "query-gravity-v1",
          bindResources: {},
        },
        {
          capability: "duckdb-analyst-v1",
          bindResources: {
            warehouse: " warehouse ",
          },
        },
        {
          capability: "knowledge-docs-review-v1",
          bindResources: {
            docs: "policy-docs",
          },
        },
      ],
    });

    expect(agent.id).toBe("example-agent");
    expect(agent.name).toBe("Example Agent");
    expect(agent.description).toBe("Example description");
    expect(agent.model).toBe("claude-sonnet-4-5-20250929");
    expect(agent.resources).toEqual([
      {
        id: "warehouse",
        kind: "duckdb",
        path: "/tmp/warehouse.duckdb",
      },
      {
        id: "policy-docs",
        kind: "knowledge-docs",
      },
    ]);
    expect(agent.useCapabilities).toEqual([
      {
        capability: "query-gravity-v1",
        bindResources: {},
      },
      {
        capability: "duckdb-analyst-v1",
        bindResources: {
          warehouse: "warehouse",
        },
      },
      {
        capability: "knowledge-docs-review-v1",
        bindResources: {
          docs: "policy-docs",
        },
      },
    ]);
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
        useCapabilities: [
          {
            capability: "query-gravity-v1",
            bindResources: {},
          },
        ],
      }),
    ).toThrow(/requires match\.command/);
  });

  it("throws for duplicate resource ids", () => {
    expect(() =>
      defineAgent({
        id: "duplicate-resource-agent",
        name: "Duplicate Resource Agent",
        resources: [
          {
            id: "warehouse",
            kind: "duckdb",
            path: "/tmp/one.duckdb",
          },
          {
            id: "warehouse",
            kind: "duckdb",
            path: "/tmp/two.duckdb",
          },
        ],
        listen: [
          {
            id: "duplicate-resource-slash",
            kind: "message",
            surface: "slack",
            entrypoint: "slash_command",
            match: {
              command: "/dup",
            },
          },
        ],
        useCapabilities: [
          {
            capability: "query-gravity-v1",
            bindResources: {},
          },
        ],
      }),
    ).toThrow(/duplicates resource id/i);
  });

  it("throws when a capability references an unknown resource id", () => {
    expect(() =>
      defineAgent({
        id: "unknown-resource-reference-agent",
        name: "Unknown Resource Reference Agent",
        resources: [
          {
            id: "warehouse",
            kind: "duckdb",
            path: "/tmp/current.duckdb",
          },
        ],
        listen: [
          {
            id: "unknown-resource-slash",
            kind: "message",
            surface: "slack",
            entrypoint: "slash_command",
            match: {
              command: "/unknown",
            },
          },
        ],
        useCapabilities: [
          {
            capability: "duckdb-analyst-v1",
            bindResources: {
              warehouse: "missing",
            },
          },
        ],
      } as unknown as Parameters<typeof defineAgent>[0]),
    ).toThrow(/references unknown resource id/i);
  });

  it("throws when deprecated top-level duckdbPath is provided", () => {
    expect(() =>
      defineAgent({
        id: "deprecated-duckdb-path-agent",
        name: "Deprecated DuckDB Path Agent",
        resources: [
          {
            id: "warehouse",
            kind: "duckdb",
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
        useCapabilities: [
          {
            capability: "query-gravity-v1",
            bindResources: {},
          },
        ],
      } as unknown as Parameters<typeof defineAgent>[0]),
    ).toThrow(/duckdbPath has been removed/i);
  });

  it("throws when deprecated connectors field is provided", () => {
    expect(() =>
      defineAgent({
        id: "deprecated-connectors-agent",
        name: "Deprecated Connectors Agent",
        connectors: [
          {
            type: "duckdb",
            path: "/tmp/legacy.duckdb",
          },
        ],
        listen: [
          {
            id: "deprecated-connectors-slash",
            kind: "message",
            surface: "slack",
            entrypoint: "slash_command",
            match: {
              command: "/legacy-connectors",
            },
          },
        ],
        useCapabilities: [
          {
            capability: "query-gravity-v1",
            bindResources: {},
          },
        ],
      } as unknown as Parameters<typeof defineAgent>[0]),
    ).toThrow(/connectors has been renamed to resources/i);
  });

  it("throws when deprecated capabilities field is provided", () => {
    expect(() =>
      defineAgent({
        id: "deprecated-capabilities-agent",
        name: "Deprecated Capabilities Agent",
        listen: [
          {
            id: "deprecated-capabilities-slash",
            kind: "message",
            surface: "slack",
            entrypoint: "slash_command",
            match: {
              command: "/legacy-capabilities",
            },
          },
        ],
        capabilities: [
          {
            use: "query-gravity-v1",
            bindResources: {},
          },
        ],
        useCapabilities: [
          {
            capability: "query-gravity-v1",
            bindResources: {},
          },
        ],
      } as unknown as Parameters<typeof defineAgent>[0]),
    ).toThrow(/agent\.capabilities has been renamed to useCapabilities/i);
  });

  it("throws when deprecated tools field is provided", () => {
    expect(() =>
      defineAgent({
        id: "deprecated-tools-agent",
        name: "Deprecated Tools Agent",
        listen: [
          {
            id: "deprecated-tools-slash",
            kind: "message",
            surface: "slack",
            entrypoint: "slash_command",
            match: {
              command: "/legacy-tools",
            },
          },
        ],
        tools: ["query-gravity"],
        useCapabilities: [
          {
            capability: "query-gravity-v1",
            bindResources: {},
          },
        ],
      } as unknown as Parameters<typeof defineAgent>[0]),
    ).toThrow(/tools has been replaced by useCapabilities/i);
  });

  it("throws when deprecated skills field is provided", () => {
    expect(() =>
      defineAgent({
        id: "deprecated-skills-agent",
        name: "Deprecated Skills Agent",
        listen: [
          {
            id: "deprecated-skills-slash",
            kind: "message",
            surface: "slack",
            entrypoint: "slash_command",
            match: {
              command: "/legacy-skills",
            },
          },
        ],
        skills: [
          {
            skill: "query-gravity",
          },
        ],
        useCapabilities: [
          {
            capability: "query-gravity-v1",
            bindResources: {},
          },
        ],
      } as unknown as Parameters<typeof defineAgent>[0]),
    ).toThrow(/skills has been replaced by useCapabilities/i);
  });

  it("allows reusing a capability with different bindResources mappings", () => {
    const agent = defineAgent({
      id: "multi-warehouse-agent",
      name: "Multi Warehouse Agent",
      resources: [
        {
          id: "warehouse-a",
          kind: "duckdb",
          path: "/tmp/warehouse-a.duckdb",
        },
        {
          id: "warehouse-b",
          kind: "duckdb",
          path: "/tmp/warehouse-b.duckdb",
        },
      ],
      listen: [
        {
          id: "multi-warehouse-slash",
          kind: "message",
          surface: "slack",
          entrypoint: "slash_command",
          match: {
            command: "/multi",
          },
        },
      ],
      useCapabilities: [
        {
          capability: "query-gravity-v1",
          bindResources: {},
        },
        {
          capability: "duckdb-analyst-v1",
          bindResources: {
            warehouse: "warehouse-a",
          },
        },
        {
          capability: "duckdb-analyst-v1",
          bindResources: {
            warehouse: "warehouse-b",
          },
        },
      ],
    });

    expect(agent.useCapabilities).toEqual([
      {
        capability: "query-gravity-v1",
        bindResources: {},
      },
      {
        capability: "duckdb-analyst-v1",
        bindResources: {
          warehouse: "warehouse-a",
        },
      },
      {
        capability: "duckdb-analyst-v1",
        bindResources: {
          warehouse: "warehouse-b",
        },
      },
    ]);
  });

  it("throws when capability bindings are duplicated with the same signature", () => {
    expect(() =>
      defineAgent({
        id: "duplicate-capability-binding-agent",
        name: "Duplicate Capability Binding Agent",
        resources: [
          {
            id: "warehouse",
            kind: "duckdb",
            path: "/tmp/warehouse.duckdb",
          },
        ],
        listen: [
          {
            id: "duplicate-capability-slash",
            kind: "message",
            surface: "slack",
            entrypoint: "slash_command",
            match: {
              command: "/dup-cap",
            },
          },
        ],
        useCapabilities: [
          {
            capability: "query-gravity-v1",
            bindResources: {},
          },
          {
            capability: "duckdb-analyst-v1",
            bindResources: {
              warehouse: "warehouse",
            },
          },
          {
            capability: "duckdb-analyst-v1",
            bindResources: {
              warehouse: "warehouse",
            },
          },
        ],
      }),
    ).toThrow(/duplicates capability binding/i);
  });
});
