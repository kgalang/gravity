import {
  defineConfig,
  resolveAgentModel,
  resolveAgentQuietHours,
  resolveAgentRuntime,
  resolveAgentSessionMode,
  type AgentDefinition,
  type FrameworkConfig,
  type QuietHours,
  type SessionMode,
} from "./contracts.js";
import { complianceHelperAgent } from "./compliance-helper/agent.js";
import { dataAnalystAgent } from "./data-analyst/agent.js";

export type CompiledSlashCommandListener = Readonly<{
  agentId: string;
  listenerId: string;
  command: string;
  sessionMode: SessionMode;
}>;

export type RegisteredAgent = Readonly<{
  agentId: string;
  declaration: AgentDefinition;
  model: string;
  runtime: AgentDefinition["runtime"] | FrameworkConfig["defaults"]["runtime"];
  defaultSessionMode: SessionMode;
  quietHours?: QuietHours;
}>;

export type AgentRegistry = Readonly<{
  config: FrameworkConfig;
  agents: readonly AgentDefinition[];
  agentsById: ReadonlyMap<string, RegisteredAgent>;
  slashCommandListeners: ReadonlyMap<string, CompiledSlashCommandListener>;
}>;

function createRegisteredAgent(
  declaration: AgentDefinition,
  config: FrameworkConfig,
): RegisteredAgent {
  return {
    agentId: declaration.id,
    declaration,
    model: resolveAgentModel(declaration, config),
    runtime: resolveAgentRuntime(declaration, config),
    defaultSessionMode: resolveAgentSessionMode(declaration, config),
    ...(resolveAgentQuietHours(declaration, config)
      ? { quietHours: resolveAgentQuietHours(declaration, config) }
      : {}),
  };
}

function normalizeSlashCommand(command: string): string {
  return command.trim().toLowerCase();
}

export function createAgentRegistry(input: {
  config: FrameworkConfig;
  agents: readonly AgentDefinition[];
}): AgentRegistry {
  const agentsById = new Map<string, RegisteredAgent>();
  const slashCommandListeners = new Map<string, CompiledSlashCommandListener>();
  const listenerIds = new Set<string>();

  for (const declaration of input.agents) {
    if (agentsById.has(declaration.id)) {
      throw new Error(`duplicate agent id declared: ${declaration.id}`);
    }

    const registered = createRegisteredAgent(declaration, input.config);
    agentsById.set(declaration.id, registered);

    for (const listener of declaration.listen) {
      const ownershipKey = `${declaration.id}:${listener.id}`;
      if (listenerIds.has(ownershipKey)) {
        throw new Error(`duplicate listener id declared: ${ownershipKey}`);
      }
      listenerIds.add(ownershipKey);

      if (listener.enabled === false || listener.entrypoint !== "slash_command") {
        continue;
      }

      const rawCommand = listener.match?.command;
      if (!rawCommand) {
        throw new Error(
          `slash listener ${ownershipKey} is missing match.command`,
        );
      }

      const command = normalizeSlashCommand(rawCommand);
      const existing = slashCommandListeners.get(command);
      if (existing) {
        throw new Error(
          `slash command collision for ${command}: ${existing.agentId}:${existing.listenerId} and ${ownershipKey}`,
        );
      }

      slashCommandListeners.set(command, {
        agentId: declaration.id,
        listenerId: listener.id,
        command,
        sessionMode: listener.sessionMode,
      });
    }
  }

  return Object.freeze({
    config: input.config,
    agents: Object.freeze([...input.agents]),
    agentsById,
    slashCommandListeners,
  });
}

export const runtimeConfig = defineConfig({
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

export const agentDeclarations = [dataAnalystAgent, complianceHelperAgent] as const;

export const agentRegistry = createAgentRegistry({
  config: runtimeConfig,
  agents: agentDeclarations,
});
