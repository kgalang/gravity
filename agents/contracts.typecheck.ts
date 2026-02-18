import { defineAgent } from "./contracts.js";

const baseListen = [
  {
    id: "typecheck-slash",
    kind: "message",
    surface: "slack",
    entrypoint: "slash_command",
    match: {
      command: "/typecheck",
    },
  },
] as const;

void defineAgent({
  id: "typecheck-valid",
  name: "Typecheck Valid",
  listen: baseListen,
  resources: [
    {
      id: "warehouse",
      kind: "duckdb",
      path: "/tmp/warehouse.duckdb",
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
  ],
});

void defineAgent({
  id: "typecheck-missing-resource-id",
  name: "Typecheck Missing Resource ID",
  listen: baseListen,
  resources: [
    {
      id: "warehouse",
      kind: "duckdb",
      path: "/tmp/warehouse.duckdb",
    },
  ],
  // @ts-expect-error bindResources slot must reference a declared resource id
  useCapabilities: [
    {
      capability: "query-gravity-v1",
      bindResources: {},
    },
    {
      capability: "duckdb-analyst-v1",
      bindResources: {
        warehouse: "missing",
      },
    },
  ],
});

// @ts-expect-error duckdb-analyst-v1 requires warehouse slot bound to a duckdb resource
void defineAgent({
  id: "typecheck-kind-mismatch",
  name: "Typecheck Kind Mismatch",
  listen: baseListen,
  resources: [
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
        warehouse: "policy-docs",
      },
    },
  ],
});
