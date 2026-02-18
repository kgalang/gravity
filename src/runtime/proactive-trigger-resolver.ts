import type { SessionMode } from "./session-catalog.js";
import type { ProactiveTriggerKind } from "./trigger-normalizer.js";

export type ActiveAgentProactiveRow = {
  id: string;
  channel_id: string | null;
  config: Record<string, unknown>;
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

type BaseResolvedProactiveTrigger = {
  agentId: string;
  triggerId: string;
  kind: ProactiveTriggerKind;
  prompt: string;
  sessionMode: SessionMode;
  delivery: ProactiveDeliveryTarget;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function asSessionMode(value: unknown): SessionMode | null {
  if (value === "thread" || value === "main" || value === "isolated") {
    return value;
  }

  return null;
}

function asKind(value: unknown): ProactiveTriggerKind | null {
  if (value === "cron" || value === "heartbeat") {
    return value;
  }

  return null;
}

function asIntervalSeconds(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  const rounded = Math.floor(value);
  return rounded >= 5 ? rounded : null;
}

function parseDelivery(raw: unknown): ProactiveDeliveryTarget | null {
  if (!isRecord(raw)) {
    return null;
  }

  const surface = asString(raw.surface);
  if (surface !== "slack") {
    return null;
  }

  const mode = asString(raw.mode);
  if (mode === "channel_thread") {
    const channelId = asString(raw.channelId);
    if (!channelId) {
      return null;
    }

    return {
      surface: "slack",
      mode: "channel_thread",
      channelId,
    };
  }

  if (mode === "dm") {
    const userId = asString(raw.userId);
    if (!userId) {
      return null;
    }

    return {
      surface: "slack",
      mode: "dm",
      userId,
    };
  }

  return null;
}

function resolveDeliveryTarget(input: {
  rawTrigger: Record<string, unknown>;
  rawDefaults: unknown;
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

  if (input.fallbackChannelId) {
    return {
      surface: "slack",
      mode: "channel_thread",
      channelId: input.fallbackChannelId,
    };
  }

  return null;
}

function normalizeSessionMode(
  rawSessionMode: unknown,
  delivery: ProactiveDeliveryTarget,
): SessionMode {
  const requested = asSessionMode(rawSessionMode) ?? "isolated";
  if (requested === "thread" && delivery.mode === "dm") {
    return "main";
  }

  return requested;
}

export function resolveProactiveTriggers(
  agents: ReadonlyArray<ActiveAgentProactiveRow>,
): ResolvedProactiveTrigger[] {
  const resolved: ResolvedProactiveTrigger[] = [];

  for (const agent of agents) {
    const rawTriggers = agent.config.proactiveTriggers;
    if (!Array.isArray(rawTriggers)) {
      continue;
    }

    for (const rawTrigger of rawTriggers) {
      if (!isRecord(rawTrigger)) {
        continue;
      }

      const enabled = asBoolean(rawTrigger.enabled) ?? true;
      if (!enabled) {
        continue;
      }

      const triggerId = asString(rawTrigger.id);
      const kind = asKind(rawTrigger.kind);
      const prompt = asString(rawTrigger.prompt);
      if (!triggerId || !kind || !prompt) {
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

      if (kind === "cron") {
        const schedule = asString(rawTrigger.schedule);
        if (!schedule) {
          continue;
        }

        resolved.push({
          agentId: agent.id,
          triggerId,
          kind,
          schedule,
          prompt,
          sessionMode,
          delivery,
        });
        continue;
      }

      const intervalSeconds = asIntervalSeconds(rawTrigger.intervalSeconds);
      if (intervalSeconds === null) {
        continue;
      }

      resolved.push({
        agentId: agent.id,
        triggerId,
        kind,
        intervalSeconds,
        prompt,
        sessionMode,
        delivery,
      });
    }
  }

  return resolved;
}
