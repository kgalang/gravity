import type { AgentResource } from "../../agents/contracts.js";

export type ResourceDocument = Readonly<{
  filePath: string;
  content: string;
}>;

export type ResourceContribution<
  TKind extends AgentResource["kind"] = AgentResource["kind"],
> = Readonly<{
  resourceId: string;
  resourceKind: TKind;
  guidance: readonly string[];
  sharedDocs: readonly ResourceDocument[];
  contextDocs: readonly ResourceDocument[];
}>;

export type ResourceLoadInput<TKind extends AgentResource["kind"]> = Readonly<{
  spec: Extract<AgentResource, { kind: TKind }>;
  cwd: string;
  sharedRoot: string;
}>;

export type ResourcePlugin<
  TKind extends AgentResource["kind"] = AgentResource["kind"],
> = Readonly<{
  kind: TKind;
  load: (input: ResourceLoadInput<TKind>) => Promise<ResourceContribution<TKind>>;
}>;
