import type {
  AgentConfig,
  AgentDeliveryTarget,
  AgentQuietHoursPolicy,
  AgentProactiveTrigger,
} from "./agent-config.js";
import type { SessionMode } from "./session-catalog.js";
import type { ProactiveTriggerKind } from "./trigger-normalizer.js";

export type ActiveAgentProactiveRow = {
  id: string;
  channel_id: string | null;
  config: AgentConfig;
};

export type ProactiveDeliveryTarget =
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

export type ProactiveQuietHours = {
  timezone: string;
  startHour: number;
  endHour: number;
  daysOfWeek?: number[];
};

type BaseResolvedProactiveTrigger = {
  agentId: string;
  triggerId: string;
  kind: ProactiveTriggerKind;
  prompt: string;
  sessionMode: SessionMode;
  delivery: ProactiveDeliveryTarget;
  quietHours?: ProactiveQuietHours;
};

export type ResolvedProactiveTrigger =
  | (BaseResolvedProactiveTrigger & {
      kind: "cron";
      schedule: string;
    })
  | (BaseResolvedProactiveTrigger & {
      kind: "heartbeat";
      intervalSeconds: number;
    });

function normalizeNonEmptyString(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseDelivery(raw: AgentDeliveryTarget | undefined): ProactiveDeliveryTarget | null {
  if (!raw) {
    return null;
  }

  if (raw.mode === "channel_thread") {
    const channelId = normalizeNonEmptyString(raw.channelId);
    if (!channelId) {
      return null;
    }

    return {
      surface: "slack",
      mode: "channel_thread",
      channelId,
    };
  }

  const userId = normalizeNonEmptyString(raw.userId);
  if (!userId) {
    return null;
  }

  return {
    surface: "slack",
    mode: "dm",
    userId,
  };
}

function resolveDeliveryTarget(input: {
  rawTrigger: AgentProactiveTrigger;
  rawDefaults: AgentDeliveryTarget | undefined;
  fallbackChannelId: string | null;
}): ProactiveDeliveryTarget | null {
  const explicit = parseDelivery(input.rawTrigger.delivery);
  if (explicit) {
    return explicit;
  }

  const defaults = parseDelivery(input.rawDefaults);
  if (defaults) {
    return defaults;
  }

  const fallbackChannelId = normalizeNonEmptyString(input.fallbackChannelId);
  if (fallbackChannelId) {
    return {
      surface: "slack",
      mode: "channel_thread",
      channelId: fallbackChannelId,
    };
  }

  return null;
}

function normalizeSessionMode(
  rawSessionMode: SessionMode | undefined,
  delivery: ProactiveDeliveryTarget,
): SessionMode {
  const requested = rawSessionMode ?? "isolated";
  if (requested === "thread" && delivery.mode === "dm") {
    return "main";
  }

  return requested;
}

function resolveQuietHours(
  rawQuietHours: AgentQuietHoursPolicy | undefined,
): ProactiveQuietHours | undefined {
  if (!rawQuietHours || rawQuietHours.enabled === false) {
    return undefined;
  }

  return {
    timezone: rawQuietHours.timezone,
    startHour: rawQuietHours.startHour,
    endHour: rawQuietHours.endHour,
    daysOfWeek: rawQuietHours.daysOfWeek
      ? [...rawQuietHours.daysOfWeek]
      : undefined,
  };
}

export function resolveProactiveTriggers(
  agents: ReadonlyArray<ActiveAgentProactiveRow>,
): ResolvedProactiveTrigger[] {
  const resolved: ResolvedProactiveTrigger[] = [];

  for (const agent of agents) {
    const rawTriggers = agent.config.proactiveTriggers ?? [];
    const quietHours = resolveQuietHours(agent.config.policy?.quietHours);

    for (const rawTrigger of rawTriggers) {
      if (!rawTrigger || typeof rawTrigger !== "object") {
        continue;
      }

      if (rawTrigger.enabled === false) {
        continue;
      }

      const triggerId = normalizeNonEmptyString(rawTrigger.id);
      const prompt = normalizeNonEmptyString(rawTrigger.prompt);
      if (!triggerId || !prompt) {
        continue;
      }

      const delivery = resolveDeliveryTarget({
        rawTrigger,
        rawDefaults: agent.config.deliveryDefaults,
        fallbackChannelId: agent.channel_id,
      });
      if (!delivery) {
        continue;
      }

      const sessionMode = normalizeSessionMode(rawTrigger.sessionMode, delivery);

      if (rawTrigger.kind === "cron") {
        const schedule = normalizeNonEmptyString(rawTrigger.schedule);
        if (!schedule) {
          continue;
        }

        resolved.push({
          agentId: agent.id,
          triggerId,
          kind: "cron",
          schedule,
          prompt,
          sessionMode,
          delivery,
          ...(quietHours ? { quietHours } : {}),
        });
        continue;
      }

      const intervalSeconds = Math.floor(rawTrigger.intervalSeconds);
      if (!Number.isFinite(intervalSeconds) || intervalSeconds < 5) {
        continue;
      }

      resolved.push({
        agentId: agent.id,
        triggerId,
        kind: "heartbeat",
        intervalSeconds,
        prompt,
        sessionMode,
        delivery,
        ...(quietHours ? { quietHours } : {}),
      });
    }
  }

  return resolved;
}
