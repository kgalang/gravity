import { Cron } from "croner";
import type { Kysely } from "kysely";
import { type GravityDatabase, gravitySchema } from "./db.js";
import {
  resolveProactiveTriggers,
  type ActiveAgentProactiveRow,
  type ProactiveDeliveryTarget,
  type ResolvedProactiveTrigger,
} from "./proactive-trigger-resolver.js";
import type { SessionMode } from "./session-catalog.js";
import type { ProactiveTriggerKind } from "./trigger-normalizer.js";

export type ProactiveTriggerFireEvent = {
  sourceEventId: string;
  firedAt: Date;
  agentId: string;
  triggerId: string;
  kind: ProactiveTriggerKind;
  prompt: string;
  sessionMode: SessionMode;
  delivery: ProactiveDeliveryTarget;
};

export type ProactiveTriggerScheduler = {
  start: () => Promise<void>;
  stop: () => Promise<void>;
  reload: () => Promise<void>;
  activeTriggerCount: () => number;
};

type ProactiveTriggerSchedulerConfig = {
  db: Kysely<GravityDatabase>;
  onTrigger: (event: ProactiveTriggerFireEvent) => Promise<void> | void;
  log?: (line: string) => void;
};

type ScheduledHandle = {
  stop: () => void;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

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
    config: isRecord(row.config) ? row.config : {},
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

export function createProactiveTriggerScheduler(
  config: ProactiveTriggerSchedulerConfig,
): ProactiveTriggerScheduler {
  const log = config.log ?? console.log;
  const inFlight = new Set<string>();
  let started = false;
  let activeCount = 0;
  let handles: ScheduledHandle[] = [];

  function stopHandles(): void {
    for (const handle of handles) {
      handle.stop();
    }
    handles = [];
    activeCount = 0;
  }

  async function fireTrigger(trigger: ResolvedProactiveTrigger): Promise<void> {
    const inFlightKey = `${trigger.agentId}:${trigger.triggerId}`;
    if (inFlight.has(inFlightKey)) {
      log(
        `[gravity] proactive trigger skipped (already running agentId=${trigger.agentId} triggerId=${trigger.triggerId})`,
      );
      return;
    }

    inFlight.add(inFlightKey);
    const firedAt = new Date();

    try {
      await config.onTrigger({
        sourceEventId: buildSourceEventId(trigger, firedAt),
        firedAt,
        agentId: trigger.agentId,
        triggerId: trigger.triggerId,
        kind: trigger.kind,
        prompt: trigger.prompt,
        sessionMode: trigger.sessionMode,
        delivery: trigger.delivery,
      });
    } catch (error) {
      log(
        `[gravity] proactive trigger failed (agentId=${trigger.agentId} triggerId=${trigger.triggerId}): ${normalizeErrorMessage(error)}`,
      );
    } finally {
      inFlight.delete(inFlightKey);
    }
  }

  function scheduleTrigger(trigger: ResolvedProactiveTrigger): ScheduledHandle | null {
    if (trigger.kind === "cron") {
      try {
        const job = new Cron(trigger.schedule, { catch: false }, () => {
          void fireTrigger(trigger);
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
      void fireTrigger(trigger);
    }, trigger.intervalSeconds * 1000);
    timer.unref?.();
    return {
      stop: () => {
        clearInterval(timer);
      },
    };
  }

  async function reload(): Promise<void> {
    stopHandles();

    const activeAgents = await loadActiveAgentProactiveRows(config.db);
    const triggers = resolveProactiveTriggers(activeAgents);
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

  return {
    async start() {
      if (started) {
        return;
      }

      await reload();
      started = true;
    },
    async stop() {
      if (!started) {
        return;
      }

      started = false;
      stopHandles();
      inFlight.clear();
    },
    async reload() {
      await reload();
    },
    activeTriggerCount() {
      return activeCount;
    },
  };
}
