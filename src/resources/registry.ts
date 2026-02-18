import type { AgentResource } from "../../agents/contracts.js";
import { duckdbResourcePlugin } from "./duckdb/plugin.js";
import { knowledgeDocsResourcePlugin } from "./knowledge-docs/plugin.js";
import type {
  ResourceContribution,
  ResourcePlugin,
} from "./types.js";

const resourcePlugins = {
  duckdb: duckdbResourcePlugin,
  "knowledge-docs": knowledgeDocsResourcePlugin,
} satisfies { [K in AgentResource["kind"]]: ResourcePlugin<K> };

function loadResourceContribution(input: {
  resource: AgentResource;
  cwd: string;
  sharedRoot: string;
}): Promise<ResourceContribution> {
  switch (input.resource.kind) {
    case "duckdb":
      return resourcePlugins.duckdb.load({
        spec: input.resource,
        cwd: input.cwd,
        sharedRoot: input.sharedRoot,
      });
    case "knowledge-docs":
      return resourcePlugins["knowledge-docs"].load({
        spec: input.resource,
        cwd: input.cwd,
        sharedRoot: input.sharedRoot,
      });
    default: {
      const exhaustiveResourceKind: never = input.resource;
      throw new Error(
        `Unhandled resource kind: ${String(exhaustiveResourceKind)}`,
      );
    }
  }
}

export async function loadResourceContributions(input: {
  resources: readonly AgentResource[];
  cwd: string;
  sharedRoot: string;
}): Promise<readonly ResourceContribution[]> {
  return Promise.all(
    input.resources.map((resource) =>
      loadResourceContribution({
        resource,
        cwd: input.cwd,
        sharedRoot: input.sharedRoot,
      }),
    ),
  );
}
