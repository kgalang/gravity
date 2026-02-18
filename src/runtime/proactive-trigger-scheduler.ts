import { Cron } from "croner";
import type { Kysely } from "kysely";
import { parseAgentConfig } from "./agent-config.js";
import { type GravityDatabase, gravitySchema } from "./db.js";
import {
  resolveProactiveTriggers,
  type ActiveAgentProactiveRow,
  type ProactiveDeliveryTarget,
  type ProactiveQuietHours,
  type ResolvedProactiveTrigger,
} from "./proactive-trigger-resolver.js";
import type { SessionMode } from "./session-catalog.js";
import type { ProactiveTriggerKind } from "./trigger-normalizer.js";

type ProactiveTriggerOrigin = "scheduled" | "replay" | "manual";

export type ProactiveTriggerFireEvent = {
  sourceEventId: string;
  firedAt: Date;
  origin: ProactiveTriggerOrigin;
  agentId: string;
  triggerId: string;
  kind: ProactiveTriggerKind;
  prompt: string;
  sessionMode: SessionMode;
  delivery: ProactiveDeliveryTarget;
};

export type ProactiveWakeInput = {
  agentId?: string;
  triggerId?: string;
  kind?: ProactiveTriggerKind;
  bypassQuietHours?: boolean;
};

export type ProactiveTriggerScheduler = {
  start: () => Promise<void>;
  stop: () => Promise<void>;
  reload: () => Promise<void>;
  reconcileMissed: () => Promise<number>;
  wake: (input?: ProactiveWakeInput) => Promise<number>;
  listTriggers: () => ReadonlyArray<ResolvedProactiveTrigger>;
  activeTriggerCount: () => number;
};

type ProactiveTriggerSchedulerConfig = {
  db: Kysely<GravityDatabase>;
  onTrigger: (event: ProactiveTriggerFireEvent) => Promise<void> | void;
  log?: (line: string) => void;
  now?: () => Date;
  enableReplay?: boolean;
  replayLookbackHours?: number;
  maxReplayRunsPerTrigger?: number;
  disableScheduling?: boolean;
};

type ScheduledHandle = {
  stop: () => void;
};

type FireTriggerOptions = {
  origin: ProactiveTriggerOrigin;
  firedAt?: Date;
  bypassQuietHours?: boolean;
};

const WEEKDAY_TO_INDEX: Record<string, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

async function loadActiveAgentProactiveRows(
  db: Kysely<GravityDatabase>,
): Promise<ActiveAgentProactiveRow[]> {
  const rows = await gravitySchema(db)
    .selectFrom("agents")
    .select(["id", "channel_id", "config"])
    .where("status", "=", "active")
    .execute();

  return rows.map((row) => ({
    id: row.id,
    channel_id: row.channel_id,
    config: parseAgentConfig(row.config, {
      warn: console.warn,
      context: `agentId=${row.id}`,
    }),
  }));
}

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "Unknown error";
}

function buildSourceEventId(trigger: ResolvedProactiveTrigger, firedAt: Date): string {
  return `proactive:${trigger.agentId}:${trigger.triggerId}:${firedAt.toISOString()}`;
}

function buildSourceEventPrefix(trigger: ResolvedProactiveTrigger): string {
  return `proactive:${trigger.agentId}:${trigger.triggerId}:`;
}

function parseSourceEventTimestamp(
  sourceEventId: string | null,
  prefix: string,
): Date | null {
  if (!sourceEventId || !sourceEventId.startsWith(prefix)) {
    return null;
  }

  const timestamp = sourceEventId.slice(prefix.length);
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

function resolveWeekdayHour(
  date: Date,
  timezone: string,
): { weekday: number; hour: number } | null {
  let parts: Intl.DateTimeFormatPart[];
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "short",
      hour: "2-digit",
      hourCycle: "h23",
    });
    parts = formatter.formatToParts(date);
  } catch {
    return null;
  }
  const weekdayPart = parts.find((part) => part.type === "weekday")?.value;
  const hourPart = parts.find((part) => part.type === "hour")?.value;
  if (!weekdayPart || !hourPart) {
    return null;
  }

  const weekday = WEEKDAY_TO_INDEX[weekdayPart.toLowerCase()];
  const hour = Number.parseInt(hourPart, 10);
  if (weekday === undefined || Number.isNaN(hour)) {
    return null;
  }

  return { weekday, hour };
}

export function isWithinQuietHours(
  date: Date,
  quietHours: ProactiveQuietHours,
): boolean {
  const zoned = resolveWeekdayHour(date, quietHours.timezone);
  if (!zoned) {
    return false;
  }

  if (
    quietHours.daysOfWeek &&
    quietHours.daysOfWeek.length > 0 &&
    !quietHours.daysOfWeek.includes(zoned.weekday)
  ) {
    return false;
  }

  if (quietHours.startHour === quietHours.endHour) {
    return true;
  }

  if (quietHours.startHour < quietHours.endHour) {
    return zoned.hour >= quietHours.startHour && zoned.hour < quietHours.endHour;
  }

  return zoned.hour >= quietHours.startHour || zoned.hour < quietHours.endHour;
}

function computeHeartbeatReplayTimes(input: {
  trigger: Extract<ResolvedProactiveTrigger, { kind: "heartbeat" }>;
  lastFiredAt: Date | null;
  now: Date;
  lookbackStart: Date;
  maxRuns: number;
}): Date[] {
  if (!input.lastFiredAt) {
    return [];
  }

  const replayTimes: Date[] = [];
  const baseTime = Math.max(
    input.lastFiredAt.getTime(),
    input.lookbackStart.getTime(),
  );
  const intervalMs = input.trigger.intervalSeconds * 1000;
  let nextRunAt = baseTime + intervalMs;
  const nowMs = input.now.getTime();

  while (nextRunAt <= nowMs && replayTimes.length < input.maxRuns) {
    replayTimes.push(new Date(nextRunAt));
    nextRunAt += intervalMs;
  }

  return replayTimes;
}

function computeCronReplayTimes(input: {
  trigger: Extract<ResolvedProactiveTrigger, { kind: "cron" }>;
  lastFiredAt: Date | null;
  now: Date;
  lookbackStart: Date;
  maxRuns: number;
}): Date[] {
  if (!input.lastFiredAt) {
    return [];
  }

  const replayTimes: Date[] = [];
  const cron = new Cron(input.trigger.schedule, {
    paused: true,
    catch: false,
  });

  try {
    const cursor =
      input.lastFiredAt.getTime() < input.lookbackStart.getTime()
        ? input.lookbackStart
        : input.lastFiredAt;
    let nextRunAt = cron.nextRun(cursor);
    const nowMs = input.now.getTime();

    while (
      nextRunAt &&
      nextRunAt.getTime() <= nowMs &&
      replayTimes.length < input.maxRuns
    ) {
      replayTimes.push(nextRunAt);
      nextRunAt = cron.nextRun(nextRunAt);
    }
  } finally {
    cron.stop();
  }

  return replayTimes;
}

function computeReplayTimes(input: {
  trigger: ResolvedProactiveTrigger;
  lastFiredAt: Date | null;
  now: Date;
  lookbackStart: Date;
  maxRuns: number;
}): Date[] {
  if (input.trigger.kind === "heartbeat") {
    return computeHeartbeatReplayTimes({
      trigger: input.trigger,
      lastFiredAt: input.lastFiredAt,
      now: input.now,
      lookbackStart: input.lookbackStart,
      maxRuns: input.maxRuns,
    });
  }

  return computeCronReplayTimes({
    trigger: input.trigger,
    lastFiredAt: input.lastFiredAt,
    now: input.now,
    lookbackStart: input.lookbackStart,
    maxRuns: input.maxRuns,
  });
}

function triggerMatchesWakeInput(
  trigger: ResolvedProactiveTrigger,
  input: ProactiveWakeInput,
): boolean {
  if (input.agentId && trigger.agentId !== input.agentId) {
    return false;
  }
  if (input.triggerId && trigger.triggerId !== input.triggerId) {
    return false;
  }
  if (input.kind && trigger.kind !== input.kind) {
    return false;
  }

  return true;
}

function triggerKey(trigger: ResolvedProactiveTrigger): string {
  return `${trigger.agentId}:${trigger.triggerId}`;
}

export function createProactiveTriggerScheduler(
  config: ProactiveTriggerSchedulerConfig,
): ProactiveTriggerScheduler {
  const log = config.log ?? console.log;
  const now = config.now ?? (() => new Date());
  const enableReplay = config.enableReplay ?? true;
  const replayLookbackHours = Math.max(
    1,
    Math.floor(config.replayLookbackHours ?? 24),
  );
  const maxReplayRunsPerTrigger = Math.max(
    1,
    Math.floor(config.maxReplayRunsPerTrigger ?? 3),
  );
  const disableScheduling = config.disableScheduling ?? false;

  const inFlight = new Set<string>();
  let started = false;
  let activeCount = 0;
  let handles: ScheduledHandle[] = [];
  let currentTriggers: ResolvedProactiveTrigger[] = [];

  function stopHandles(): void {
    for (const handle of handles) {
      handle.stop();
    }
    handles = [];
    activeCount = 0;
  }

  async function fireTrigger(
    trigger: ResolvedProactiveTrigger,
    options: FireTriggerOptions,
  ): Promise<boolean> {
    const fireTime = options.firedAt ?? now();
    if (
      !options.bypassQuietHours &&
      trigger.quietHours &&
      isWithinQuietHours(fireTime, trigger.quietHours)
    ) {
      log(
        `[gravity] proactive trigger skipped (quiet hours agentId=${trigger.agentId} triggerId=${trigger.triggerId} origin=${options.origin})`,
      );
      return false;
    }

    const inFlightKey = triggerKey(trigger);
    if (inFlight.has(inFlightKey)) {
      log(
        `[gravity] proactive trigger skipped (already running agentId=${trigger.agentId} triggerId=${trigger.triggerId})`,
      );
      return false;
    }

    inFlight.add(inFlightKey);

    try {
      await config.onTrigger({
        sourceEventId: buildSourceEventId(trigger, fireTime),
        firedAt: fireTime,
        origin: options.origin,
        agentId: trigger.agentId,
        triggerId: trigger.triggerId,
        kind: trigger.kind,
        prompt: trigger.prompt,
        sessionMode: trigger.sessionMode,
        delivery: trigger.delivery,
      });
      return true;
    } catch (error) {
      log(
        `[gravity] proactive trigger failed (agentId=${trigger.agentId} triggerId=${trigger.triggerId} origin=${options.origin}): ${normalizeErrorMessage(error)}`,
      );
      return false;
    } finally {
      inFlight.delete(inFlightKey);
    }
  }

  function scheduleTrigger(trigger: ResolvedProactiveTrigger): ScheduledHandle | null {
    if (disableScheduling) {
      return null;
    }

    if (trigger.kind === "cron") {
      try {
        const job = new Cron(trigger.schedule, { catch: false }, () => {
          void fireTrigger(trigger, { origin: "scheduled" });
        });
        return {
          stop: () => {
            job.stop();
          },
        };
      } catch (error) {
        log(
          `[gravity] proactive cron skipped (agentId=${trigger.agentId} triggerId=${trigger.triggerId}): ${normalizeErrorMessage(error)}`,
        );
        return null;
      }
    }

    const timer = setInterval(() => {
      void fireTrigger(trigger, { origin: "scheduled" });
    }, trigger.intervalSeconds * 1000);
    timer.unref?.();
    return {
      stop: () => {
        clearInterval(timer);
      },
    };
  }

  async function reloadTriggers(): Promise<void> {
    stopHandles();

    const activeAgents = await loadActiveAgentProactiveRows(config.db);
    const triggers = resolveProactiveTriggers(activeAgents);
    currentTriggers = triggers;

    const nextHandles: ScheduledHandle[] = [];
    for (const trigger of triggers) {
      const handle = scheduleTrigger(trigger);
      if (handle) {
        nextHandles.push(handle);
      }
    }

    handles = nextHandles;
    activeCount = nextHandles.length;
  }

  async function loadLastFiredAt(
    trigger: ResolvedProactiveTrigger,
  ): Promise<Date | null> {
    const prefix = buildSourceEventPrefix(trigger);
    const row = await gravitySchema(config.db)
      .selectFrom("runs")
      .select(["source_event_id", "started_at"])
      .where("trigger_kind", "=", trigger.kind)
      .where("source_event_id", "like", `${prefix}%`)
      .orderBy("started_at", "desc")
      .executeTakeFirst();

    if (!row) {
      return null;
    }

    return parseSourceEventTimestamp(row.source_event_id, prefix) ?? row.started_at;
  }

  async function reconcileMissed(): Promise<number> {
    if (!enableReplay || currentTriggers.length === 0) {
      return 0;
    }

    const nowAt = now();
    const lookbackStart = new Date(
      nowAt.getTime() - replayLookbackHours * 60 * 60 * 1000,
    );
    let firedCount = 0;

    for (const trigger of currentTriggers) {
      const lastFiredAt = await loadLastFiredAt(trigger);
      const replayTimes = computeReplayTimes({
        trigger,
        lastFiredAt,
        now: nowAt,
        lookbackStart,
        maxRuns: maxReplayRunsPerTrigger,
      });

      for (const replayAt of replayTimes) {
        const fired = await fireTrigger(trigger, {
          origin: "replay",
          firedAt: replayAt,
        });
        if (fired) {
          firedCount += 1;
        }
      }
    }

    return firedCount;
  }

  async function wake(input: ProactiveWakeInput = {}): Promise<number> {
    const effectiveInput: ProactiveWakeInput = {
      ...input,
      kind: input.kind ?? "heartbeat",
    };
    const candidates = currentTriggers.filter((trigger) =>
      triggerMatchesWakeInput(trigger, effectiveInput),
    );
    if (candidates.length === 0) {
      return 0;
    }

    let firedCount = 0;
    for (const trigger of candidates) {
      const fired = await fireTrigger(trigger, {
        origin: "manual",
        bypassQuietHours: input.bypassQuietHours ?? true,
      });
      if (fired) {
        firedCount += 1;
      }
    }

    return firedCount;
  }

  return {
    async start() {
      if (started) {
        return;
      }

      await reloadTriggers();
      if (enableReplay) {
        const replayed = await reconcileMissed();
        if (replayed > 0) {
          log(`[gravity] proactive replay fired ${replayed} catch-up run(s)`);
        }
      }
      started = true;
    },
    async stop() {
      if (!started) {
        return;
      }

      started = false;
      stopHandles();
      inFlight.clear();
      currentTriggers = [];
    },
    async reload() {
      await reloadTriggers();
    },
    async reconcileMissed() {
      return reconcileMissed();
    },
    async wake(input) {
      return wake(input);
    },
    listTriggers() {
      return currentTriggers;
    },
    activeTriggerCount() {
      return activeCount;
    },
  };
}
