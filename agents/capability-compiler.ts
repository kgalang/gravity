import { capabilityCatalog } from "./capability-catalog.js";
import type {
  AgentCapabilityBinding,
  AgentResource,
  CapabilityId,
  CapabilitySkillId,
} from "./contracts.js";
import type { ToolPrimitive } from "./tool-primitives.js";

export type CompiledCapability = Readonly<{
  capability: CapabilityId;
  bindResources: Readonly<Record<string, AgentResource>>;
  skillIds: readonly CapabilitySkillId[];
  resourceIds: readonly string[];
  grants: Readonly<{
    toolPrimitives: readonly ToolPrimitive[];
  }>;
  guidance: readonly string[];
}>;

export type CompiledAgentCapabilities = Readonly<{
  capabilities: readonly CompiledCapability[];
  requiredSkillIds: readonly CapabilitySkillId[];
  requiredResources: readonly AgentResource[];
  toolPrimitives: readonly ToolPrimitive[];
  capabilityGuidance: readonly string[];
}>;

function unique<T>(values: readonly T[]): T[] {
  return Array.from(new Set(values));
}

function formatBoundResources(bindResources: Record<string, AgentResource>): string {
  const entries = Object.entries(bindResources)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([slot, resource]) => `${slot}=${resource.id}`);

  if (entries.length === 0) {
    return "(none)";
  }

  return entries.join(", ");
}

export function compileAgentCapabilities(input: {
  resources: readonly AgentResource[];
  useCapabilities: readonly AgentCapabilityBinding[];
}): CompiledAgentCapabilities {
  const resourcesById = new Map<string, AgentResource>();
  for (const resource of input.resources) {
    resourcesById.set(resource.id, resource);
  }

  const compiledCapabilities: CompiledCapability[] = [];

  for (const binding of input.useCapabilities) {
    const definition = capabilityCatalog[binding.capability];
    const bindResources: Record<string, AgentResource> = {};

    for (const [slot, resourceId] of Object.entries(binding.bindResources)) {
      const resource = resourcesById.get(resourceId);
      if (!resource) {
        throw new Error(
          `Capability ${binding.capability} references unknown resource id: ${resourceId}`,
        );
      }
      bindResources[slot] = resource;
    }

    const resourceIds = Object.values(bindResources)
      .map((resource) => resource.id)
      .sort();

    const boundResourcesLine = formatBoundResources(bindResources);
    const guidance = [
      ...definition.guidance,
      `- Capability \`${binding.capability}\` bound resources: ${boundResourcesLine}`,
    ];

    compiledCapabilities.push({
      capability: binding.capability,
      bindResources,
      skillIds: [...definition.skills],
      resourceIds,
      grants: {
        toolPrimitives: [...definition.grants.toolPrimitives],
      },
      guidance,
    });
  }

  const requiredSkillIds = unique(
    compiledCapabilities.flatMap((capability) => capability.skillIds),
  );
  const requiredResourceIds = unique(
    compiledCapabilities.flatMap((capability) => capability.resourceIds),
  );
  const requiredResources = requiredResourceIds
    .map((resourceId) => resourcesById.get(resourceId))
    .filter((resource): resource is AgentResource => Boolean(resource));

  const toolPrimitives = unique(
    compiledCapabilities.flatMap((capability) => capability.grants.toolPrimitives),
  );
  const capabilityGuidance = compiledCapabilities.flatMap(
    (capability) => capability.guidance,
  );

  return {
    capabilities: compiledCapabilities,
    requiredSkillIds,
    requiredResources,
    toolPrimitives,
    capabilityGuidance,
  };
}
