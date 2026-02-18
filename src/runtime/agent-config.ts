import { type Static, Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

const SessionModeSchema = Type.Union([
  Type.Literal("thread"),
  Type.Literal("main"),
  Type.Literal("isolated"),
]);

const IngressEntrypointSchema = Type.Union([
  Type.Literal("slash_command"),
  Type.Literal("app_mention"),
  Type.Literal("thread_reply"),
  Type.Literal("direct_message"),
]);

const IngressBindingMatchSchema = Type.Object(
  {
    command: Type.Optional(Type.String()),
    channelId: Type.Optional(Type.String()),
    userId: Type.Optional(Type.String()),
    isDirectMessage: Type.Optional(Type.Boolean()),
    threadOwnedByAgent: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: true },
);

const IngressBindingSchema = Type.Object(
  {
    id: Type.Optional(Type.String()),
    kind: Type.Literal("message"),
    surface: Type.Literal("slack"),
    entrypoint: IngressEntrypointSchema,
    sessionMode: Type.Optional(SessionModeSchema),
    enabled: Type.Optional(Type.Boolean()),
    match: Type.Optional(IngressBindingMatchSchema),
  },
  { additionalProperties: true },
);

const SlackChannelThreadDeliverySchema = Type.Object(
  {
    surface: Type.Literal("slack"),
    mode: Type.Literal("channel_thread"),
    channelId: Type.String(),
  },
  { additionalProperties: true },
);

const SlackDmDeliverySchema = Type.Object(
  {
    surface: Type.Literal("slack"),
    mode: Type.Literal("dm"),
    userId: Type.String(),
  },
  { additionalProperties: true },
);

const DeliveryTargetSchema = Type.Union([
  SlackChannelThreadDeliverySchema,
  SlackDmDeliverySchema,
]);

const QuietHoursSchema = Type.Object(
  {
    enabled: Type.Optional(Type.Boolean()),
    timezone: Type.String(),
    startHour: Type.Integer({ minimum: 0, maximum: 23 }),
    endHour: Type.Integer({ minimum: 0, maximum: 23 }),
    daysOfWeek: Type.Optional(
      Type.Array(Type.Integer({ minimum: 0, maximum: 6 }), {
        minItems: 1,
        maxItems: 7,
      }),
    ),
  },
  { additionalProperties: true },
);

const PolicySchema = Type.Object(
  {
    quietHours: Type.Optional(QuietHoursSchema),
  },
  { additionalProperties: true },
);

const CronProactiveTriggerSchema = Type.Object(
  {
    id: Type.String(),
    kind: Type.Literal("cron"),
    schedule: Type.String(),
    prompt: Type.String(),
    sessionMode: Type.Optional(SessionModeSchema),
    delivery: Type.Optional(DeliveryTargetSchema),
    enabled: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: true },
);

const HeartbeatProactiveTriggerSchema = Type.Object(
  {
    id: Type.String(),
    kind: Type.Literal("heartbeat"),
    intervalSeconds: Type.Number({ minimum: 5 }),
    prompt: Type.String(),
    sessionMode: Type.Optional(SessionModeSchema),
    delivery: Type.Optional(DeliveryTargetSchema),
    enabled: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: true },
);

const ProactiveTriggerSchema = Type.Union([
  CronProactiveTriggerSchema,
  HeartbeatProactiveTriggerSchema,
]);

const AgentConfigSchema = Type.Object(
  {
    connector: Type.Optional(Type.String()),
    duckdb_path: Type.Optional(Type.String()),
    ingressBindings: Type.Optional(Type.Array(IngressBindingSchema)),
    deliveryDefaults: Type.Optional(DeliveryTargetSchema),
    proactiveTriggers: Type.Optional(Type.Array(ProactiveTriggerSchema)),
    policy: Type.Optional(PolicySchema),
  },
  { additionalProperties: true },
);

export type AgentSessionMode = Static<typeof SessionModeSchema>;
export type AgentIngressEntrypoint = Static<typeof IngressEntrypointSchema>;
export type AgentIngressBindingMatch = Static<typeof IngressBindingMatchSchema>;
export type AgentIngressBinding = Static<typeof IngressBindingSchema>;
export type AgentDeliveryTarget = Static<typeof DeliveryTargetSchema>;
export type AgentProactiveTrigger = Static<typeof ProactiveTriggerSchema>;
export type AgentQuietHoursPolicy = Static<typeof QuietHoursSchema>;
export type AgentPolicy = Static<typeof PolicySchema>;
export type AgentConfig = Static<typeof AgentConfigSchema>;
export type ParseAgentConfigOptions = {
  warn?: (line: string) => void;
  context?: string;
};

const emittedWarnings = new Set<string>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function warnOnce(
  options: ParseAgentConfigOptions,
  message: string,
): void {
  const warn = options.warn;
  if (!warn) {
    return;
  }

  const contextPrefix = options.context ? `${options.context}: ` : "";
  const line = `[gravity] agent config parse warning ${contextPrefix}${message}`;
  if (emittedWarnings.has(line)) {
    return;
  }

  emittedWarnings.add(line);
  warn(line);
}

function normalizeString(value: string | undefined): string | null {
  if (value === undefined) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeIngressMatch(
  rawMatch: AgentIngressBindingMatch | undefined,
): AgentIngressBindingMatch | undefined | null {
  if (!rawMatch) {
    return undefined;
  }

  const match: AgentIngressBindingMatch = {};
  const command = normalizeString(rawMatch.command);
  const channelId = normalizeString(rawMatch.channelId);
  const userId = normalizeString(rawMatch.userId);

  if (rawMatch.command !== undefined && !command) {
    return null;
  }
  if (rawMatch.channelId !== undefined && !channelId) {
    return null;
  }
  if (rawMatch.userId !== undefined && !userId) {
    return null;
  }

  if (command) {
    match.command = command;
  }
  if (channelId) {
    match.channelId = channelId;
  }
  if (userId) {
    match.userId = userId;
  }
  if (typeof rawMatch.isDirectMessage === "boolean") {
    match.isDirectMessage = rawMatch.isDirectMessage;
  }
  if (typeof rawMatch.threadOwnedByAgent === "boolean") {
    match.threadOwnedByAgent = rawMatch.threadOwnedByAgent;
  }

  return Object.keys(match).length > 0 ? match : undefined;
}

function normalizeDeliveryTarget(
  rawDelivery: AgentDeliveryTarget,
): AgentDeliveryTarget | null {
  if (rawDelivery.mode === "channel_thread") {
    const channelId = normalizeString(rawDelivery.channelId);
    if (!channelId) {
      return null;
    }

    return {
      surface: "slack",
      mode: "channel_thread",
      channelId,
    };
  }

  const userId = normalizeString(rawDelivery.userId);
  if (!userId) {
    return null;
  }

  return {
    surface: "slack",
    mode: "dm",
    userId,
  };
}

function normalizeIngressBinding(
  rawBinding: AgentIngressBinding,
): AgentIngressBinding | null {
  const id = normalizeString(rawBinding.id);
  const match = normalizeIngressMatch(rawBinding.match);
  if (rawBinding.id !== undefined && !id) {
    return null;
  }
  if (match === null) {
    return null;
  }

  return {
    id: id ?? undefined,
    kind: "message",
    surface: "slack",
    entrypoint: rawBinding.entrypoint,
    sessionMode: rawBinding.sessionMode,
    enabled: rawBinding.enabled ?? true,
    match,
  };
}

function normalizeProactiveTrigger(
  rawTrigger: AgentProactiveTrigger,
): AgentProactiveTrigger | null {
  const id = normalizeString(rawTrigger.id);
  const prompt = normalizeString(rawTrigger.prompt);

  if (!id || !prompt) {
    return null;
  }

  const delivery = rawTrigger.delivery
    ? (normalizeDeliveryTarget(rawTrigger.delivery) ?? undefined)
    : undefined;

  if (rawTrigger.kind === "cron") {
    const schedule = normalizeString(rawTrigger.schedule);
    if (!schedule) {
      return null;
    }

    return {
      id,
      kind: "cron",
      schedule,
      prompt,
      sessionMode: rawTrigger.sessionMode,
      delivery,
      enabled: rawTrigger.enabled ?? true,
    };
  }

  const intervalSeconds = Math.floor(rawTrigger.intervalSeconds);
  if (!Number.isFinite(intervalSeconds) || intervalSeconds < 5) {
    return null;
  }

  return {
    id,
    kind: "heartbeat",
    intervalSeconds,
    prompt,
    sessionMode: rawTrigger.sessionMode,
    delivery,
    enabled: rawTrigger.enabled ?? true,
  };
}

function normalizeQuietHours(
  rawQuietHours: AgentQuietHoursPolicy,
): AgentQuietHoursPolicy | null {
  const timezone = normalizeString(rawQuietHours.timezone);
  if (!timezone) {
    return null;
  }

  const daysOfWeek = rawQuietHours.daysOfWeek
    ? Array.from(new Set(rawQuietHours.daysOfWeek))
    : undefined;
  if (daysOfWeek && daysOfWeek.length === 0) {
    return null;
  }

  return {
    enabled: rawQuietHours.enabled ?? true,
    timezone,
    startHour: rawQuietHours.startHour,
    endHour: rawQuietHours.endHour,
    daysOfWeek,
  };
}

function normalizePolicy(rawPolicy: AgentPolicy): AgentPolicy | null {
  if (!rawPolicy.quietHours) {
    return {};
  }

  const quietHours = normalizeQuietHours(rawPolicy.quietHours);
  if (!quietHours) {
    return null;
  }

  return {
    quietHours,
  };
}

export function parseAgentConfig(
  value: unknown,
  options: ParseAgentConfigOptions = {},
): AgentConfig {
  if (!isRecord(value)) {
    if (value !== null && value !== undefined) {
      warnOnce(options, "root config is not an object; using empty config");
    }
    return {};
  }

  if (!Value.Check(AgentConfigSchema, value)) {
    const firstError = Value.Errors(AgentConfigSchema, value).First();
    const path = firstError?.path ?? "/";
    const message = firstError?.message ?? "schema mismatch";
    warnOnce(
      options,
      `invalid config at ${path} (${message}); disabling config`,
    );
    return {};
  }

  const raw = value;
  const normalized: AgentConfig = {};

  if (raw.connector !== undefined) {
    const connector = normalizeString(raw.connector);
    if (!connector) {
      warnOnce(
        options,
        "invalid `connector` after normalization; disabling config",
      );
      return {};
    }

    normalized.connector = connector;
  }

  if (raw.duckdb_path !== undefined) {
    const duckdbPath = normalizeString(raw.duckdb_path);
    if (!duckdbPath) {
      warnOnce(
        options,
        "invalid `duckdb_path` after normalization; disabling config",
      );
      return {};
    }

    normalized.duckdb_path = duckdbPath;
  }

  if (raw.ingressBindings !== undefined) {
    const ingressBindings: AgentIngressBinding[] = [];
    for (const [index, candidate] of raw.ingressBindings.entries()) {
      const normalizedBinding = normalizeIngressBinding(candidate);
      if (!normalizedBinding) {
        warnOnce(
          options,
          `invalid ingress binding at ingressBindings[${index}] after normalization; disabling config`,
        );
        return {};
      }

      ingressBindings.push(normalizedBinding);
    }

    normalized.ingressBindings = ingressBindings;
  }

  if (raw.deliveryDefaults !== undefined) {
    const deliveryDefaults = normalizeDeliveryTarget(raw.deliveryDefaults);
    if (!deliveryDefaults) {
      warnOnce(
        options,
        "invalid `deliveryDefaults` after normalization; disabling config",
      );
      return {};
    }

    normalized.deliveryDefaults = deliveryDefaults;
  }

  if (raw.proactiveTriggers !== undefined) {
    const proactiveTriggers: AgentProactiveTrigger[] = [];
    for (const [index, candidate] of raw.proactiveTriggers.entries()) {
      const normalizedTrigger = normalizeProactiveTrigger(candidate);
      if (!normalizedTrigger) {
        warnOnce(
          options,
          `invalid proactive trigger at proactiveTriggers[${index}] after normalization; disabling config`,
        );
        return {};
      }

      proactiveTriggers.push(normalizedTrigger);
    }

    normalized.proactiveTriggers = proactiveTriggers;
  }

  if (raw.policy !== undefined) {
    const policy = normalizePolicy(raw.policy);
    if (!policy) {
      warnOnce(options, "invalid `policy` after normalization; disabling config");
      return {};
    }

    normalized.policy = policy;
  }

  return normalized;
}
