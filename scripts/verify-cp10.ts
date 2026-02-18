import process from "node:process";
import {
  createDb,
  destroyDb,
  gravitySchema,
  type GravityDatabase,
} from "../src/runtime/db.js";
import {
  createKyselyRunLogRepository,
  createRunLogStore,
} from "../src/runtime/run-log-store.js";
import {
  createRunContext,
  withRunLifecycle,
} from "../src/runtime/run-lifecycle.js";
import {
  createProactiveTriggerScheduler,
  type ProactiveTriggerFireEvent,
} from "../src/runtime/proactive-trigger-scheduler.js";

const TARGET_AGENT_ID = "data-analyst";
const VERIFY_HEARTBEAT_TRIGGER_ID = "cp10-verify-heartbeat";
const VERIFY_CRON_TRIGGER_ID = "cp10-verify-cron";

type AgentRow = {
  id: string;
  config: Record<string, unknown>;
};

type PersistedRunRow = {
  source_event_id: string | null;
  trigger_kind: "cron" | "heartbeat" | "message" | "system";
  entrypoint:
    | "cron"
    | "heartbeat"
    | "slash_command"
    | "app_mention"
    | "thread_reply"
    | "direct_message"
    | "system";
  status: "running" | "completed" | "failed" | "cancelled";
  session_key: string;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function buildVerificationConfig(input: {
  base: Record<string, unknown>;
  quietHoursEnabled: boolean;
}): Record<string, unknown> {
  const quietHours = input.quietHoursEnabled
    ? {
        enabled: true,
        timezone: "UTC",
        startHour: 0,
        endHour: 0,
      }
    : undefined;

  return {
    ...input.base,
    proactiveTriggers: [
      {
        id: VERIFY_CRON_TRIGGER_ID,
        kind: "cron",
        schedule: "*/5 * * * *",
        prompt: "CP10 verification cron trigger",
        sessionMode: "isolated",
        delivery: {
          surface: "slack",
          mode: "channel_thread",
          channelId: "C_CP10_VERIFY",
        },
        enabled: true,
      },
      {
        id: VERIFY_HEARTBEAT_TRIGGER_ID,
        kind: "heartbeat",
        intervalSeconds: 300,
        prompt: "CP10 verification heartbeat trigger",
        sessionMode: "main",
        delivery: {
          surface: "slack",
          mode: "dm",
          userId: "U_CP10_VERIFY",
        },
        enabled: true,
      },
    ],
    policy: quietHours ? { quietHours } : {},
  };
}

async function loadAgentRow(
  db: ReturnType<typeof createDb>,
): Promise<AgentRow> {
  const row = await gravitySchema(db)
    .selectFrom("agents")
    .select(["id", "config"])
    .where("id", "=", TARGET_AGENT_ID)
    .executeTakeFirst();

  if (!row) {
    throw new Error(`Agent ${TARGET_AGENT_ID} not found`);
  }

  return row as AgentRow;
}

async function updateAgentConfig(
  db: ReturnType<typeof createDb>,
  config: Record<string, unknown>,
): Promise<void> {
  await gravitySchema(db)
    .updateTable("agents")
    .set({ config })
    .where("id", "=", TARGET_AGENT_ID)
    .executeTakeFirst();
}

function buildProactiveSourceEventId(triggerId: string, firedAt: Date): string {
  return `proactive:${TARGET_AGENT_ID}:${triggerId}:${firedAt.toISOString()}`;
}

async function deleteRunsBySourceEventIds(
  db: ReturnType<typeof createDb>,
  sourceEventIds: string[],
): Promise<void> {
  if (sourceEventIds.length === 0) {
    return;
  }

  await gravitySchema(db)
    .deleteFrom("runs")
    .where("source_event_id", "in", sourceEventIds)
    .executeTakeFirst();
}

async function seedHistoricalRun(input: {
  db: ReturnType<typeof createDb>;
  triggerId: string;
  kind: "cron" | "heartbeat";
  firedAt: Date;
}): Promise<void> {
  const sourceEventId = buildProactiveSourceEventId(input.triggerId, input.firedAt);
  await gravitySchema(input.db)
    .insertInto("runs")
    .values({
      id: sourceEventId,
      agent_id: TARGET_AGENT_ID,
      session_key: `${TARGET_AGENT_ID}:proactive:${input.triggerId}:history`,
      thread_ts: null,
      trigger_kind: input.kind,
      surface: "system",
      entrypoint: input.kind,
      source_event_id: sourceEventId,
      channel_id: null,
      user_id: null,
      user_name: null,
      query: "CP10 historical replay seed",
      status: "completed",
      result_summary: "CP10 seed run",
      error_message: null,
      policy_decisions: {},
      started_at: input.firedAt,
      completed_at: input.firedAt,
      tokens_used: null,
      cost_estimate: null,
    })
    .onConflict((conflict) => conflict.column("id").doNothing())
    .executeTakeFirst();
}

function eventSessionKey(event: ProactiveTriggerFireEvent): string {
  if (event.sessionMode === "main") {
    return `${event.agentId}:main`;
  }

  if (event.sessionMode === "thread") {
    return `${event.agentId}:proactive:${event.triggerId}:thread`;
  }

  return `${event.agentId}:proactive:${event.triggerId}:${event.sourceEventId}`;
}

async function persistProactiveRun(
  db: ReturnType<typeof createDb>,
  event: ProactiveTriggerFireEvent,
): Promise<void> {
  const runLogStore = createRunLogStore(createKyselyRunLogRepository(db));
  const sessionKey = eventSessionKey(event);
  let resultSummary = `CP10 verification ${event.origin} ${event.kind}`;

  const lifecycleLogger = runLogStore.createLifecycleLogger({
    query: event.prompt,
    sourceEventId: event.sourceEventId,
    channelId: event.delivery.mode === "channel_thread" ? event.delivery.channelId : null,
    userId: event.delivery.mode === "dm" ? event.delivery.userId : null,
    policyDecisions: {
      proactive_origin: event.origin,
      delivery_mode: event.delivery.mode,
    },
    getResultSummary: () => resultSummary,
  });

  const runContext = createRunContext({
    runId: event.sourceEventId,
    agentId: event.agentId,
    sessionKey,
    triggerKind: event.kind,
    surface: "system",
    entrypoint: event.kind,
  });

  await withRunLifecycle(runContext, lifecycleLogger, async () => {
    resultSummary = `CP10 verification completed (${event.origin}:${event.triggerId})`;
  });
}

async function queryPersistedRuns(
  db: ReturnType<typeof createDb>,
  sourceEventIds: string[],
): Promise<PersistedRunRow[]> {
  if (sourceEventIds.length === 0) {
    return [];
  }

  return gravitySchema(db)
    .selectFrom("runs")
    .select(["source_event_id", "trigger_kind", "entrypoint", "status", "session_key"])
    .where("source_event_id", "in", sourceEventIds)
    .execute() as Promise<PersistedRunRow[]>;
}

async function main(): Promise<void> {
  process.loadEnvFile?.();

  const databaseUrl = process.env.DATABASE_URL;
  assert(
    typeof databaseUrl === "string" && databaseUrl.length > 0,
    "DATABASE_URL must be set for CP10 verification",
  );

  const db = createDb(databaseUrl);
  const baselineAgent = await loadAgentRow(db);
  const baselineConfig = baselineAgent.config;

  let currentNow = new Date("2026-02-18T10:20:00.000Z");
  const capturedEvents: ProactiveTriggerFireEvent[] = [];
  const knownSourceEventIds = new Set<string>();

  try {
    const replaySeedTimes = [
      new Date("2026-02-18T10:00:00.000Z"),
      new Date("2026-02-18T10:00:00.000Z"),
    ];
    const seedSourceEventIds = [
      buildProactiveSourceEventId(VERIFY_CRON_TRIGGER_ID, replaySeedTimes[0]),
      buildProactiveSourceEventId(VERIFY_HEARTBEAT_TRIGGER_ID, replaySeedTimes[1]),
    ];
    for (const sourceEventId of seedSourceEventIds) {
      knownSourceEventIds.add(sourceEventId);
    }

    await deleteRunsBySourceEventIds(db, seedSourceEventIds);
    await seedHistoricalRun({
      db,
      triggerId: VERIFY_CRON_TRIGGER_ID,
      kind: "cron",
      firedAt: replaySeedTimes[0],
    });
    await seedHistoricalRun({
      db,
      triggerId: VERIFY_HEARTBEAT_TRIGGER_ID,
      kind: "heartbeat",
      firedAt: replaySeedTimes[1],
    });

    await updateAgentConfig(
      db,
      buildVerificationConfig({
        base: baselineConfig,
        quietHoursEnabled: false,
      }),
    );

    const scheduler = createProactiveTriggerScheduler({
      db,
      now: () => new Date(currentNow),
      enableReplay: true,
      replayLookbackHours: 6,
      maxReplayRunsPerTrigger: 2,
      disableScheduling: true,
      onTrigger: async (event) => {
        capturedEvents.push(event);
        knownSourceEventIds.add(event.sourceEventId);
        await persistProactiveRun(db, event);
      },
    });

    await scheduler.start();

    const replayEvents = capturedEvents.filter((event) => event.origin === "replay");
    assert(
      replayEvents.length === 4,
      `Expected 4 replay events after startup, got ${replayEvents.length}`,
    );
    assert(
      replayEvents.filter((event) => event.triggerId === VERIFY_CRON_TRIGGER_ID).length === 2,
      "Expected 2 cron replay events",
    );
    assert(
      replayEvents.filter((event) => event.triggerId === VERIFY_HEARTBEAT_TRIGGER_ID).length === 2,
      "Expected 2 heartbeat replay events",
    );
    assert(
      replayEvents.some((event) => event.delivery.mode === "channel_thread"),
      "Expected channel_thread replay delivery",
    );
    assert(
      replayEvents.some((event) => event.delivery.mode === "dm"),
      "Expected dm replay delivery",
    );

    await updateAgentConfig(
      db,
      buildVerificationConfig({
        base: baselineConfig,
        quietHoursEnabled: true,
      }),
    );
    await scheduler.reload();

    currentNow = new Date("2026-02-18T10:40:00.000Z");
    const replayDuringQuietHours = await scheduler.reconcileMissed();
    assert(
      replayDuringQuietHours === 0,
      `Expected replay suppression during quiet hours, got ${replayDuringQuietHours}`,
    );

    const suppressedManualWake = await scheduler.wake({
      agentId: TARGET_AGENT_ID,
      triggerId: VERIFY_HEARTBEAT_TRIGGER_ID,
      kind: "heartbeat",
      bypassQuietHours: false,
    });
    assert(
      suppressedManualWake === 0,
      `Expected manual wake suppression without bypass, got ${suppressedManualWake}`,
    );

    const forcedManualWake = await scheduler.wake({
      agentId: TARGET_AGENT_ID,
      triggerId: VERIFY_HEARTBEAT_TRIGGER_ID,
      kind: "heartbeat",
      bypassQuietHours: true,
    });
    assert(forcedManualWake === 1, `Expected one manual wake run, got ${forcedManualWake}`);
    assert(
      capturedEvents.some((event) => event.origin === "manual"),
      "Expected at least one manual-origin proactive event",
    );

    await scheduler.stop();

    const persistedRuns = await queryPersistedRuns(db, [...knownSourceEventIds]);
    const replayAndManualEvents = capturedEvents.filter(
      (event) => event.origin === "replay" || event.origin === "manual",
    );
    assert(
      persistedRuns.length >= replayAndManualEvents.length,
      "Persisted proactive runs are missing replay/manual rows",
    );

    const persistedBySourceEventId = new Map(
      persistedRuns
        .filter((row): row is PersistedRunRow & { source_event_id: string } => Boolean(row.source_event_id))
        .map((row) => [row.source_event_id, row]),
    );

    for (const event of replayAndManualEvents) {
      const persisted = persistedBySourceEventId.get(event.sourceEventId);
      assert(
        persisted,
        `Missing persisted run for proactive event ${event.sourceEventId}`,
      );
      assert(
        persisted.trigger_kind === event.kind,
        `trigger_kind mismatch for ${event.sourceEventId}`,
      );
      assert(
        persisted.entrypoint === event.kind,
        `entrypoint mismatch for ${event.sourceEventId}`,
      );
      assert(
        persisted.status === "completed",
        `status mismatch for ${event.sourceEventId}`,
      );
      assert(
        persisted.session_key === eventSessionKey(event),
        `session_key mismatch for ${event.sourceEventId}`,
      );
    }

    console.log(
      `[cp10] verification passed (replay=${replayEvents.length}, manual=1, quiet_hours_suppressed=true)`,
    );
  } finally {
    await updateAgentConfig(db, baselineConfig);
    await destroyDb(db);
  }
}

await main();
