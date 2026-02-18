import {
  defineConfig,
  resolveAgentModel,
  resolveAgentQuietHours,
  resolveAgentRuntime,
  resolveAgentSessionMode,
  type AgentDefinition,
  type FrameworkConfig,
  type IngressEntrypoint,
  type IngressMatch,
  type QuietHours,
  type SessionMode,
  type SlackDeliveryTarget,
} from "./contracts.js";
import { complianceHelperAgent } from "./compliance-helper/agent.js";
import { dataAnalystAgent } from "./data-analyst/agent.js";

export type RunIdPattern = "slack:{sourceEventId}" | "{sourceEventId}";
export type SessionKeyPattern =
  | "{agentId}:main"
  | "{agentId}:{sourceEventId}"
  | "{agentId}:{threadTs}"
  | "{agentId}:{channelId}"
  | "{agentId}:proactive:{triggerId}:thread"
  | "{agentId}:proactive:{triggerId}:{sourceEventId}";

export type CompiledMessageEntrypoint = Exclude<IngressEntrypoint, "slash_command">;

type MessageTriggerDimensions = Readonly<{
  triggerKind: "message";
  surface: "slack";
  entrypoint: IngressEntrypoint;
  runIdPattern: "slack:{sourceEventId}";
}>;

type ProactiveTriggerDimensions = Readonly<{
  triggerKind: "cron" | "heartbeat";
  surface: "system";
  entrypoint: "cron" | "heartbeat";
  runIdPattern: "{sourceEventId}";
}>;

export type CompiledTriggerDimensions =
  | MessageTriggerDimensions
  | ProactiveTriggerDimensions;

type CompiledIngressListenerBase = Readonly<{
  agentId: string;
  listenerId: string;
  entrypoint: IngressEntrypoint;
  sessionMode: SessionMode;
  match?: IngressMatch;
  trigger: MessageTriggerDimensions;
}>;

export type CompiledSlashCommandListener = Readonly<{
  command: string;
}> &
  CompiledIngressListenerBase &
  Readonly<{
    entrypoint: "slash_command";
  }>;

export type CompiledMessageListener = CompiledIngressListenerBase &
  Readonly<{
    entrypoint: CompiledMessageEntrypoint;
  }>;

export type CompiledIngressListener =
  | CompiledSlashCommandListener
  | CompiledMessageListener;

type CompiledProactiveTriggerBase = Readonly<{
  agentId: string;
  triggerId: string;
  prompt: string;
  sessionMode: SessionMode;
  delivery: SlackDeliveryTarget;
  quietHours?: QuietHours;
  trigger: ProactiveTriggerDimensions;
}>;

export type CompiledProactiveTrigger =
  | (CompiledProactiveTriggerBase &
      Readonly<{
        kind: "cron";
        schedule: string;
      }>)
  | (CompiledProactiveTriggerBase &
      Readonly<{
        kind: "heartbeat";
        intervalSeconds: number;
      }>);

export type CompiledSessionDimension = Readonly<{
  agentId: string;
  sourceKind: "ingress" | "proactive";
  sourceId: string;
  sessionMode: SessionMode;
  sessionKeyPatterns: readonly SessionKeyPattern[];
  trigger: CompiledTriggerDimensions;
}>;

export type CompiledAgentDeclarations = Readonly<{
  ingress: Readonly<{
    listeners: readonly CompiledIngressListener[];
    slashCommands: Readonly<Record<string, CompiledSlashCommandListener>>;
    messageByEntrypoint: Readonly<
      Record<CompiledMessageEntrypoint, readonly CompiledMessageListener[]>
    >;
  }>;
  proactive: Readonly<{
    triggers: readonly CompiledProactiveTrigger[];
    byAgentId: Readonly<Record<string, readonly CompiledProactiveTrigger[]>>;
  }>;
  sessions: Readonly<{
    dimensions: readonly CompiledSessionDimension[];
    byAgentId: Readonly<Record<string, readonly CompiledSessionDimension[]>>;
  }>;
  triggerDimensions: readonly CompiledTriggerDimensions[];
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
  compiledDeclarations: CompiledAgentDeclarations;
}>;

function createRegisteredAgent(
  declaration: AgentDefinition,
  config: FrameworkConfig,
): RegisteredAgent {
  const quietHours = resolveAgentQuietHours(declaration, config);
  return {
    agentId: declaration.id,
    declaration,
    model: resolveAgentModel(declaration, config),
    runtime: resolveAgentRuntime(declaration, config),
    defaultSessionMode: resolveAgentSessionMode(declaration, config),
    ...(quietHours ? { quietHours } : {}),
  };
}

function normalizeSlashCommand(command: string): string {
  return command.trim().toLowerCase();
}

function normalizeProactiveSessionMode(
  requested: SessionMode | undefined,
  delivery: SlackDeliveryTarget,
): SessionMode {
  const sessionMode = requested ?? "isolated";
  if (sessionMode === "thread" && delivery.mode === "dm") {
    return "main";
  }
  return sessionMode;
}

function ingressSessionKeyPatterns(
  sessionMode: SessionMode,
): readonly SessionKeyPattern[] {
  if (sessionMode === "main") {
    return ["{agentId}:main"];
  }
  if (sessionMode === "isolated") {
    return ["{agentId}:{sourceEventId}"];
  }
  return ["{agentId}:{threadTs}", "{agentId}:{channelId}"];
}

function proactiveSessionKeyPatterns(
  sessionMode: SessionMode,
): readonly SessionKeyPattern[] {
  if (sessionMode === "main") {
    return ["{agentId}:main"];
  }
  if (sessionMode === "thread") {
    return ["{agentId}:proactive:{triggerId}:thread"];
  }
  return ["{agentId}:proactive:{triggerId}:{sourceEventId}"];
}

function pushByAgent<T>(
  index: Record<string, T[]>,
  agentId: string,
  value: T,
): void {
  const current = index[agentId];
  if (current) {
    current.push(value);
    return;
  }
  index[agentId] = [value];
}

export function createAgentRegistry(input: {
  config: FrameworkConfig;
  agents: readonly AgentDefinition[];
}): AgentRegistry {
  const agentsById = new Map<string, RegisteredAgent>();
  const slashCommandListeners = new Map<string, CompiledSlashCommandListener>();
  const compiledSlashCommands: Record<string, CompiledSlashCommandListener> = {};
  const listenerIds = new Set<string>();
  const ingressListeners: CompiledIngressListener[] = [];
  const messageByEntrypoint: Record<
    CompiledMessageEntrypoint,
    CompiledMessageListener[]
  > = {
    app_mention: [],
    thread_reply: [],
    direct_message: [],
  };
  const proactiveTriggers: CompiledProactiveTrigger[] = [];
  const proactiveByAgentId: Record<string, CompiledProactiveTrigger[]> = {};
  const sessionDimensions: CompiledSessionDimension[] = [];
  const sessionByAgentId: Record<string, CompiledSessionDimension[]> = {};
  const triggerDimensions: CompiledTriggerDimensions[] = [];

  for (const declaration of input.agents) {
    if (agentsById.has(declaration.id)) {
      throw new Error(`duplicate agent id declared: ${declaration.id}`);
    }

    const registered = createRegisteredAgent(declaration, input.config);
    agentsById.set(declaration.id, registered);
    const quietHours = registered.quietHours;

    for (const listener of declaration.listen) {
      const ownershipKey = `${declaration.id}:${listener.id}`;
      if (listenerIds.has(ownershipKey)) {
        throw new Error(`duplicate listener id declared: ${ownershipKey}`);
      }
      listenerIds.add(ownershipKey);

      if (listener.enabled === false) {
        continue;
      }

      if (listener.entrypoint !== "slash_command") {

        const trigger: MessageTriggerDimensions = {
          triggerKind: "message",
          surface: "slack",
          entrypoint: listener.entrypoint,
          runIdPattern: "slack:{sourceEventId}",
        };
        triggerDimensions.push(trigger);

        const compiledMessageListener: CompiledMessageListener = {
          agentId: declaration.id,
          listenerId: listener.id,
          entrypoint: listener.entrypoint,
          sessionMode: listener.sessionMode,
          ...(listener.match ? { match: listener.match } : {}),
          trigger,
        };

        ingressListeners.push(compiledMessageListener);
        messageByEntrypoint[listener.entrypoint].push(compiledMessageListener);

        const sessionDimension: CompiledSessionDimension = {
          agentId: declaration.id,
          sourceKind: "ingress",
          sourceId: listener.id,
          sessionMode: listener.sessionMode,
          sessionKeyPatterns: ingressSessionKeyPatterns(listener.sessionMode),
          trigger,
        };
        sessionDimensions.push(sessionDimension);
        pushByAgent(sessionByAgentId, declaration.id, sessionDimension);
        continue;
      }

      const rawCommand = listener.match?.command;
      if (!rawCommand) {
        throw new Error(`slash listener ${ownershipKey} is missing match.command`);
      }

      const command = normalizeSlashCommand(rawCommand);
      const existing = slashCommandListeners.get(command);
      if (existing) {
        throw new Error(
          `slash command collision for ${command}: ${existing.agentId}:${existing.listenerId} and ${ownershipKey}`,
        );
      }

      const trigger: MessageTriggerDimensions = {
        triggerKind: "message",
        surface: "slack",
        entrypoint: "slash_command",
        runIdPattern: "slack:{sourceEventId}",
      };
      triggerDimensions.push(trigger);

      const compiledSlashListener: CompiledSlashCommandListener = {
        agentId: declaration.id,
        listenerId: listener.id,
        command,
        sessionMode: listener.sessionMode,
        entrypoint: "slash_command",
        ...(listener.match ? { match: listener.match } : {}),
        trigger,
      };

      slashCommandListeners.set(command, compiledSlashListener);
      compiledSlashCommands[command] = compiledSlashListener;
      ingressListeners.push(compiledSlashListener);

      const sessionDimension: CompiledSessionDimension = {
        agentId: declaration.id,
        sourceKind: "ingress",
        sourceId: listener.id,
        sessionMode: listener.sessionMode,
        sessionKeyPatterns: ingressSessionKeyPatterns(listener.sessionMode),
        trigger,
      };
      sessionDimensions.push(sessionDimension);
      pushByAgent(sessionByAgentId, declaration.id, sessionDimension);
    }

    const proactiveTriggerIds = new Set<string>();
    for (const proactiveTrigger of declaration.proactive?.triggers ?? []) {
      if (proactiveTrigger.enabled === false) {
        continue;
      }

      if (proactiveTriggerIds.has(proactiveTrigger.id)) {
        throw new Error(
          `duplicate proactive trigger id declared: ${declaration.id}:${proactiveTrigger.id}`,
        );
      }
      proactiveTriggerIds.add(proactiveTrigger.id);

      const delivery =
        proactiveTrigger.delivery ?? declaration.proactive?.deliveryDefaults;
      if (!delivery) {
        throw new Error(
          `proactive trigger ${declaration.id}:${proactiveTrigger.id} is missing delivery and proactive deliveryDefaults`,
        );
      }

      const sessionMode = normalizeProactiveSessionMode(
        proactiveTrigger.sessionMode,
        delivery,
      );
      const trigger: ProactiveTriggerDimensions = {
        triggerKind: proactiveTrigger.kind,
        surface: "system",
        entrypoint: proactiveTrigger.kind,
        runIdPattern: "{sourceEventId}",
      };
      triggerDimensions.push(trigger);

      const compiledProactiveTrigger: CompiledProactiveTrigger =
        proactiveTrigger.kind === "cron"
          ? {
              agentId: declaration.id,
              triggerId: proactiveTrigger.id,
              kind: "cron",
              schedule: proactiveTrigger.schedule,
              prompt: proactiveTrigger.prompt,
              sessionMode,
              delivery,
              ...(quietHours ? { quietHours } : {}),
              trigger,
            }
          : {
              agentId: declaration.id,
              triggerId: proactiveTrigger.id,
              kind: "heartbeat",
              intervalSeconds: proactiveTrigger.intervalSeconds,
              prompt: proactiveTrigger.prompt,
              sessionMode,
              delivery,
              ...(quietHours ? { quietHours } : {}),
              trigger,
            };

      proactiveTriggers.push(compiledProactiveTrigger);
      pushByAgent(proactiveByAgentId, declaration.id, compiledProactiveTrigger);

      const sessionDimension: CompiledSessionDimension = {
        agentId: declaration.id,
        sourceKind: "proactive",
        sourceId: proactiveTrigger.id,
        sessionMode,
        sessionKeyPatterns: proactiveSessionKeyPatterns(sessionMode),
        trigger,
      };
      sessionDimensions.push(sessionDimension);
      pushByAgent(sessionByAgentId, declaration.id, sessionDimension);
    }
  }

  const frozenMessageByEntrypoint = Object.freeze({
    app_mention: Object.freeze([...messageByEntrypoint.app_mention]),
    thread_reply: Object.freeze([...messageByEntrypoint.thread_reply]),
    direct_message: Object.freeze([...messageByEntrypoint.direct_message]),
  });

  const frozenProactiveByAgentId: Record<string, readonly CompiledProactiveTrigger[]> =
    {};
  for (const [agentId, triggers] of Object.entries(proactiveByAgentId)) {
    frozenProactiveByAgentId[agentId] = Object.freeze([...triggers]);
  }

  const frozenSessionByAgentId: Record<string, readonly CompiledSessionDimension[]> =
    {};
  for (const [agentId, dimensions] of Object.entries(sessionByAgentId)) {
    frozenSessionByAgentId[agentId] = Object.freeze([...dimensions]);
  }

  const compiledDeclarations: CompiledAgentDeclarations = Object.freeze({
    ingress: Object.freeze({
      listeners: Object.freeze([...ingressListeners]),
      slashCommands: Object.freeze({ ...compiledSlashCommands }),
      messageByEntrypoint: frozenMessageByEntrypoint,
    }),
    proactive: Object.freeze({
      triggers: Object.freeze([...proactiveTriggers]),
      byAgentId: Object.freeze(frozenProactiveByAgentId),
    }),
    sessions: Object.freeze({
      dimensions: Object.freeze([...sessionDimensions]),
      byAgentId: Object.freeze(frozenSessionByAgentId),
    }),
    triggerDimensions: Object.freeze([...triggerDimensions]),
  });

  return Object.freeze({
    config: input.config,
    agents: Object.freeze([...input.agents]),
    agentsById,
    slashCommandListeners,
    compiledDeclarations,
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

export const compiledDeclarations = agentRegistry.compiledDeclarations;
