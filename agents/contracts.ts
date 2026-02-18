export type SessionMode = "thread" | "main" | "isolated";
export type AgentRuntime = "host" | "sandbox";
export type IngressEntrypoint =
  | "slash_command"
  | "app_mention"
  | "thread_reply"
  | "direct_message";

export type SlackDeliveryTargetInput =
  | {
      surface: "slack";
      mode: "channel_thread";
      channelId: string;
    }
  | {
      surface: "slack";
      mode: "dm";
      userId: string;
    };

export type SlackDeliveryTarget = Readonly<SlackDeliveryTargetInput>;

export type QuietHoursInput = {
  enabled?: boolean;
  timezone: string;
  startHour: number;
  endHour: number;
  daysOfWeek?: readonly number[];
};

export type QuietHours = Readonly<{
  enabled: boolean;
  timezone: string;
  startHour: number;
  endHour: number;
  daysOfWeek?: readonly number[];
}>;

export type FrameworkConfigInput = {
  infra: {
    database: {
      urlEnvVar: string;
    };
    slack: {
      appTokenEnvVar: string;
      botTokenEnvVar: string;
    };
    modelProvider: {
      provider: "anthropic";
      apiKeyEnvVar: string;
    };
  };
  defaults: {
    model: string;
    runtime: AgentRuntime;
    sessionMode: SessionMode;
    quietHours?: QuietHoursInput;
  };
  paths: {
    sharedRoot: string;
    workspaceRoot: string;
  };
};

export type FrameworkConfig = Readonly<{
  infra: Readonly<{
    database: Readonly<{
      urlEnvVar: string;
    }>;
    slack: Readonly<{
      appTokenEnvVar: string;
      botTokenEnvVar: string;
    }>;
    modelProvider: Readonly<{
      provider: "anthropic";
      apiKeyEnvVar: string;
    }>;
  }>;
  defaults: Readonly<{
    model: string;
    runtime: AgentRuntime;
    sessionMode: SessionMode;
    quietHours?: QuietHours;
  }>;
  paths: Readonly<{
    sharedRoot: string;
    workspaceRoot: string;
  }>;
}>;

export type IngressMatchInput = {
  command?: string;
  channelId?: string;
  userId?: string;
  isDirectMessage?: boolean;
  threadOwnedByAgent?: boolean;
};

export type IngressMatch = Readonly<{
  command?: string;
  channelId?: string;
  userId?: string;
  isDirectMessage?: boolean;
  threadOwnedByAgent?: boolean;
}>;

export type AgentListenerInput = {
  id: string;
  kind: "message";
  surface: "slack";
  entrypoint: IngressEntrypoint;
  sessionMode?: SessionMode;
  enabled?: boolean;
  match?: IngressMatchInput;
};

export type AgentListener = Readonly<{
  id: string;
  kind: "message";
  surface: "slack";
  entrypoint: IngressEntrypoint;
  sessionMode: SessionMode;
  enabled: boolean;
  match?: IngressMatch;
}>;

type CronTriggerInput = {
  id: string;
  kind: "cron";
  schedule: string;
  prompt: string;
  sessionMode?: SessionMode;
  delivery?: SlackDeliveryTargetInput;
  enabled?: boolean;
};

type HeartbeatTriggerInput = {
  id: string;
  kind: "heartbeat";
  intervalSeconds: number;
  prompt: string;
  sessionMode?: SessionMode;
  delivery?: SlackDeliveryTargetInput;
  enabled?: boolean;
};

export type AgentProactiveTriggerInput = CronTriggerInput | HeartbeatTriggerInput;

type CronTrigger = Readonly<{
  id: string;
  kind: "cron";
  schedule: string;
  prompt: string;
  sessionMode?: SessionMode;
  delivery?: SlackDeliveryTarget;
  enabled: boolean;
}>;

type HeartbeatTrigger = Readonly<{
  id: string;
  kind: "heartbeat";
  intervalSeconds: number;
  prompt: string;
  sessionMode?: SessionMode;
  delivery?: SlackDeliveryTarget;
  enabled: boolean;
}>;

export type AgentProactiveTrigger = CronTrigger | HeartbeatTrigger;

export type AgentProactiveInput = {
  deliveryDefaults?: SlackDeliveryTargetInput;
  triggers: readonly AgentProactiveTriggerInput[];
};

export type AgentProactive = Readonly<{
  deliveryDefaults?: SlackDeliveryTarget;
  triggers: readonly AgentProactiveTrigger[];
}>;

type NonEmptyArray<T> = readonly [T, ...T[]];

export type AgentDefinitionInput = {
  id: string;
  name: string;
  listen: NonEmptyArray<AgentListenerInput>;
  tools: NonEmptyArray<string>;
  description?: string;
  model?: string;
  proactive?: AgentProactiveInput;
  connectors?: readonly string[];
  runtime?: AgentRuntime;
  quietHours?: QuietHoursInput;
  session?: {
    defaultMode?: SessionMode;
  };
};

export type AgentDefinition = Readonly<{
  id: string;
  name: string;
  listen: readonly AgentListener[];
  tools: readonly string[];
  description?: string;
  model?: string;
  proactive?: AgentProactive;
  connectors?: readonly string[];
  runtime?: AgentRuntime;
  quietHours?: QuietHours;
  session?: Readonly<{
    defaultMode?: SessionMode;
  }>;
}>;

function deepFreeze<T>(value: T): T {
  if (Array.isArray(value)) {
    for (const item of value) {
      deepFreeze(item);
    }
    return Object.freeze(value);
  }

  if (value && typeof value === "object") {
    for (const nested of Object.values(value as Record<string, unknown>)) {
      deepFreeze(nested);
    }
    return Object.freeze(value);
  }

  return value;
}

function normalizeRequiredString(value: string, label: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return trimmed;
}

function normalizeOptionalString(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return normalizeRequiredString(value, "optional string");
}

function normalizeSessionMode(value: SessionMode, label: string): SessionMode {
  if (value === "thread" || value === "main" || value === "isolated") {
    return value;
  }
  throw new Error(`${label} must be one of: thread, main, isolated`);
}

function defaultSessionModeForEntrypoint(entrypoint: IngressEntrypoint): SessionMode {
  return entrypoint === "direct_message" ? "main" : "thread";
}

function normalizeIngressMatch(
  match: IngressMatchInput | undefined,
  entrypoint: IngressEntrypoint,
  label: string,
): IngressMatch | undefined {
  if (!match) {
    if (entrypoint === "slash_command") {
      throw new Error(`${label} requires match.command`);
    }
    return undefined;
  }

  const normalized: IngressMatchInput = {};
  if (match.command !== undefined) {
    const command = normalizeRequiredString(match.command, `${label}.command`)
      .toLowerCase()
      .replaceAll(/\s+/g, "");
    if (!command.startsWith("/")) {
      throw new Error(`${label}.command must start with "/"`);
    }
    normalized.command = command;
  }
  if (match.channelId !== undefined) {
    normalized.channelId = normalizeRequiredString(
      match.channelId,
      `${label}.channelId`,
    );
  }
  if (match.userId !== undefined) {
    normalized.userId = normalizeRequiredString(match.userId, `${label}.userId`);
  }
  if (match.isDirectMessage !== undefined) {
    normalized.isDirectMessage = Boolean(match.isDirectMessage);
  }
  if (match.threadOwnedByAgent !== undefined) {
    normalized.threadOwnedByAgent = Boolean(match.threadOwnedByAgent);
  }

  if (entrypoint === "slash_command" && !normalized.command) {
    throw new Error(`${label} requires match.command`);
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function normalizeDeliveryTarget(
  delivery: SlackDeliveryTargetInput,
  label: string,
): SlackDeliveryTarget {
  if (delivery.mode === "channel_thread") {
    return {
      surface: "slack",
      mode: "channel_thread",
      channelId: normalizeRequiredString(delivery.channelId, `${label}.channelId`),
    };
  }

  return {
    surface: "slack",
    mode: "dm",
    userId: normalizeRequiredString(delivery.userId, `${label}.userId`),
  };
}

function normalizeQuietHours(value: QuietHoursInput, label: string): QuietHours {
  const startHour = Math.floor(value.startHour);
  const endHour = Math.floor(value.endHour);

  if (startHour < 0 || startHour > 23 || endHour < 0 || endHour > 23) {
    throw new Error(`${label} startHour/endHour must be in [0, 23]`);
  }

  const daysOfWeek = value.daysOfWeek
    ? Array.from(new Set(value.daysOfWeek.map((day) => Math.floor(day))))
    : undefined;

  if (
    daysOfWeek &&
    daysOfWeek.some((day) => !Number.isInteger(day) || day < 0 || day > 6)
  ) {
    throw new Error(`${label}.daysOfWeek values must be in [0, 6]`);
  }

  return {
    enabled: value.enabled ?? true,
    timezone: normalizeRequiredString(value.timezone, `${label}.timezone`),
    startHour,
    endHour,
    ...(daysOfWeek ? { daysOfWeek } : {}),
  };
}

function normalizeStringList(
  values: readonly string[] | undefined,
  label: string,
): readonly string[] | undefined {
  if (!values) {
    return undefined;
  }

  const normalized = Array.from(
    new Set(values.map((value) => normalizeRequiredString(value, label))),
  );
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeProactiveTrigger(
  trigger: AgentProactiveTriggerInput,
  label: string,
): AgentProactiveTrigger {
  const id = normalizeRequiredString(trigger.id, `${label}.id`);
  const prompt = normalizeRequiredString(trigger.prompt, `${label}.prompt`);
  const sessionMode =
    trigger.sessionMode !== undefined
      ? normalizeSessionMode(trigger.sessionMode, `${label}.sessionMode`)
      : undefined;
  const enabled = trigger.enabled ?? true;
  const delivery = trigger.delivery
    ? normalizeDeliveryTarget(trigger.delivery, `${label}.delivery`)
    : undefined;

  if (trigger.kind === "cron") {
    return {
      id,
      kind: "cron",
      schedule: normalizeRequiredString(trigger.schedule, `${label}.schedule`),
      prompt,
      enabled,
      ...(sessionMode ? { sessionMode } : {}),
      ...(delivery ? { delivery } : {}),
    };
  }

  const intervalSeconds = Math.floor(trigger.intervalSeconds);
  if (!Number.isFinite(intervalSeconds) || intervalSeconds < 5) {
    throw new Error(`${label}.intervalSeconds must be a number >= 5`);
  }

  return {
    id,
    kind: "heartbeat",
    intervalSeconds,
    prompt,
    enabled,
    ...(sessionMode ? { sessionMode } : {}),
    ...(delivery ? { delivery } : {}),
  };
}

export function defineConfig(input: FrameworkConfigInput): FrameworkConfig {
  const config: FrameworkConfig = {
    infra: {
      database: {
        urlEnvVar: normalizeRequiredString(
          input.infra.database.urlEnvVar,
          "config.infra.database.urlEnvVar",
        ),
      },
      slack: {
        appTokenEnvVar: normalizeRequiredString(
          input.infra.slack.appTokenEnvVar,
          "config.infra.slack.appTokenEnvVar",
        ),
        botTokenEnvVar: normalizeRequiredString(
          input.infra.slack.botTokenEnvVar,
          "config.infra.slack.botTokenEnvVar",
        ),
      },
      modelProvider: {
        provider: input.infra.modelProvider.provider,
        apiKeyEnvVar: normalizeRequiredString(
          input.infra.modelProvider.apiKeyEnvVar,
          "config.infra.modelProvider.apiKeyEnvVar",
        ),
      },
    },
    defaults: {
      model: normalizeRequiredString(input.defaults.model, "config.defaults.model"),
      runtime: input.defaults.runtime,
      sessionMode: normalizeSessionMode(
        input.defaults.sessionMode,
        "config.defaults.sessionMode",
      ),
      ...(input.defaults.quietHours
        ? {
            quietHours: normalizeQuietHours(
              input.defaults.quietHours,
              "config.defaults.quietHours",
            ),
          }
        : {}),
    },
    paths: {
      sharedRoot: normalizeRequiredString(
        input.paths.sharedRoot,
        "config.paths.sharedRoot",
      ),
      workspaceRoot: normalizeRequiredString(
        input.paths.workspaceRoot,
        "config.paths.workspaceRoot",
      ),
    },
  };

  return deepFreeze(config);
}

export function defineAgent(input: AgentDefinitionInput): AgentDefinition {
  const id = normalizeRequiredString(input.id, "agent.id");
  const name = normalizeRequiredString(input.name, "agent.name");
  const description = normalizeOptionalString(input.description);
  const model = normalizeOptionalString(input.model);
  const runtime = input.runtime;
  const quietHours = input.quietHours
    ? normalizeQuietHours(input.quietHours, `agent(${id}).quietHours`)
    : undefined;
  const connectors = normalizeStringList(input.connectors, `agent(${id}).connectors`);

  const tools = Array.from(
    new Set(input.tools.map((tool) => normalizeRequiredString(tool, `agent(${id}).tools`))),
  );
  if (tools.length === 0) {
    throw new Error(`agent(${id}) must declare at least one tool`);
  }

  const listeners = input.listen.map((listener, index) => {
    const listenerLabel = `agent(${id}).listen[${index}]`;
    const listenerId = normalizeRequiredString(listener.id, `${listenerLabel}.id`);
    const sessionMode = listener.sessionMode
      ? normalizeSessionMode(listener.sessionMode, `${listenerLabel}.sessionMode`)
      : defaultSessionModeForEntrypoint(listener.entrypoint);
    const match = normalizeIngressMatch(
      listener.match,
      listener.entrypoint,
      `${listenerLabel}.match`,
    );

    return {
      id: listenerId,
      kind: listener.kind,
      surface: listener.surface,
      entrypoint: listener.entrypoint,
      sessionMode,
      enabled: listener.enabled ?? true,
      ...(match ? { match } : {}),
    } satisfies AgentListener;
  });
  if (listeners.length === 0) {
    throw new Error(`agent(${id}) must declare at least one listener`);
  }

  const proactive = input.proactive
    ? {
        ...(input.proactive.deliveryDefaults
          ? {
              deliveryDefaults: normalizeDeliveryTarget(
                input.proactive.deliveryDefaults,
                `agent(${id}).proactive.deliveryDefaults`,
              ),
            }
          : {}),
        triggers: input.proactive.triggers.map((trigger, index) =>
          normalizeProactiveTrigger(trigger, `agent(${id}).proactive.triggers[${index}]`),
        ),
      }
    : undefined;

  const declaration: AgentDefinition = {
    id,
    name,
    listen: listeners,
    tools,
    ...(description ? { description } : {}),
    ...(model ? { model } : {}),
    ...(proactive ? { proactive } : {}),
    ...(connectors ? { connectors } : {}),
    ...(runtime ? { runtime } : {}),
    ...(quietHours ? { quietHours } : {}),
    ...(input.session
      ? {
          session: {
            ...(input.session.defaultMode
              ? {
                  defaultMode: normalizeSessionMode(
                    input.session.defaultMode,
                    `agent(${id}).session.defaultMode`,
                  ),
                }
              : {}),
          },
        }
      : {}),
  };

  return deepFreeze(declaration);
}

export function resolveAgentModel(
  agent: AgentDefinition,
  config: FrameworkConfig,
): string {
  return agent.model ?? config.defaults.model;
}

export function resolveAgentRuntime(
  agent: AgentDefinition,
  config: FrameworkConfig,
): AgentRuntime {
  return agent.runtime ?? config.defaults.runtime;
}

export function resolveAgentSessionMode(
  agent: AgentDefinition,
  config: FrameworkConfig,
): SessionMode {
  return agent.session?.defaultMode ?? config.defaults.sessionMode;
}

export function resolveAgentQuietHours(
  agent: AgentDefinition,
  config: FrameworkConfig,
): QuietHours | undefined {
  return agent.quietHours ?? config.defaults.quietHours;
}
