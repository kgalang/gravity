import { describe, expect, it } from "vitest";
import { compileAgentCapabilities } from "../../agents/capability-compiler.js";

describe("compileAgentCapabilities", () => {
  it("derives skills/resources/tool grants from capability bindings", () => {
    const profile = compileAgentCapabilities({
      resources: [
        {
          id: "warehouse",
          kind: "duckdb",
          path: "/tmp/warehouse.duckdb",
        },
        {
          id: "policy-docs",
          kind: "knowledge-docs",
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
          capability: "knowledge-docs-review-v1",
          bindResources: {
            docs: "policy-docs",
          },
        },
      ],
    });

    expect(profile.requiredSkillIds).toEqual([
      "query-gravity",
      "duckdb-query",
      "knowledge-docs-review",
    ]);
    expect(profile.requiredResources).toEqual([
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
    expect(profile.toolPrimitives).toEqual(["read", "bash"]);
    expect(profile.capabilityGuidance).toContain(
      "- Capability `duckdb-analyst-v1` bound resources: warehouse=warehouse",
    );
  });

  it("keeps duplicate capability uses when bindResources differ", () => {
    const profile = compileAgentCapabilities({
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
      useCapabilities: [
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

    expect(profile.capabilities).toHaveLength(2);
    expect(profile.requiredResources.map((resource) => resource.id)).toEqual([
      "warehouse-a",
      "warehouse-b",
    ]);
  });
});
