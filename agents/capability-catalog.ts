import type { ResourceKind } from "./resource-kinds.js";
import type { ToolPrimitive } from "./tool-primitives.js";

export type CapabilityDefinition = Readonly<{
  resourceSlots: Readonly<Record<string, ResourceKind>>;
  skills: readonly string[];
  grants: Readonly<{
    toolPrimitives: readonly ToolPrimitive[];
  }>;
  guidance: readonly string[];
}>;

export const capabilityCatalog = {
  "query-gravity-v1": {
    resourceSlots: {},
    skills: ["query-gravity"],
    grants: {
      toolPrimitives: ["read", "bash"],
    },
    guidance: [
      "- `query-gravity-v1`: inspect Gravity runtime metadata and run logs for debugging and operations evidence.",
    ],
  },
  "rollback-v1": {
    resourceSlots: {},
    skills: ["rollback"],
    grants: {
      toolPrimitives: ["read", "bash"],
    },
    guidance: [
      "- `rollback-v1`: apply file-scoped rollback procedures using non-destructive git patterns.",
    ],
  },
  "duckdb-analyst-v1": {
    resourceSlots: {
      warehouse: "duckdb",
    },
    skills: ["duckdb-query"],
    grants: {
      toolPrimitives: ["read", "bash"],
    },
    guidance: [
      "- `duckdb-analyst-v1`: execute SQL-backed analysis against the bound DuckDB warehouse resource.",
    ],
  },
  "knowledge-docs-review-v1": {
    resourceSlots: {
      docs: "knowledge-docs",
    },
    skills: ["knowledge-docs-review"],
    grants: {
      toolPrimitives: ["read"],
    },
    guidance: [
      "- `knowledge-docs-review-v1`: ground policy/process recommendations in the bound knowledge-docs resource.",
    ],
  },
  "data-analyst-guidance-v1": {
    resourceSlots: {},
    skills: ["data-analyst-query-patterns", "data-analyst-response-formatting"],
    grants: {
      toolPrimitives: [],
    },
    guidance: [
      "- `data-analyst-guidance-v1`: apply Wiggs-specific query planning and response-formatting rules.",
    ],
  },
  "compliance-helper-guidance-v1": {
    resourceSlots: {},
    skills: ["compliance-helper-review-rules", "compliance-helper-flag-patterns"],
    grants: {
      toolPrimitives: [],
    },
    guidance: [
      "- `compliance-helper-guidance-v1`: apply compliance helper review and red-flag detection rules.",
    ],
  },
} as const satisfies Record<string, CapabilityDefinition>;

export type CapabilityCatalog = typeof capabilityCatalog;
export type CapabilityId = keyof CapabilityCatalog;
export type CapabilitySkillId = CapabilityCatalog[CapabilityId]["skills"][number];
