import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { type Kysely } from "kysely";
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
  type RunEntrypoint,
  type RunSurface,
  type RunTriggerKind,
  createRunContext,
  withRunLifecycle,
} from "../src/runtime/run-lifecycle.js";
import { REQUIRED_SHARED_SKILLS } from "./store-conventions.mjs";

type RunScenario = {
  name: string;
  runId: string;
  sessionKey: string;
  sourceEventId: string;
  triggerKind: RunTriggerKind;
  surface: RunSurface;
  entrypoint: RunEntrypoint;
  shouldFail: boolean;
};

type PersistedRunProjection = {
  id: string;
  trigger_kind: RunTriggerKind;
  surface: RunSurface;
  entrypoint: RunEntrypoint;
  status: "running" | "completed" | "failed" | "cancelled";
  result_summary: string | null;
  error_message: string | null;
  completed_at: Date | null;
  source_event_id: string | null;
  session_key: string;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertStoreConventions(repoRoot: string): void {
  const requiredDirectories = [
    "store/shared/skills",
    "store/shared/resources",
    "store/shared/knowledge",
    "store/agents/data-analyst/memory",
    "store/agents/compliance-helper/memory",
  ];
  const requiredFiles = [
    ...REQUIRED_SHARED_SKILLS,
    "store/agents/data-analyst/memory/MEMORY.md",
    "store/agents/compliance-helper/memory/MEMORY.md",
  ];

  for (const relativePath of requiredDirectories) {
    const absolutePath = path.join(repoRoot, relativePath);
    assert(existsSync(absolutePath), `Missing required directory: ${relativePath}`);
  }

  for (const relativePath of requiredFiles) {
    const absolutePath = path.join(repoRoot, relativePath);
    assert(existsSync(absolutePath), `Missing required file: ${relativePath}`);
  }

  assert(
    !existsSync(path.join(repoRoot, "store/.git")),
    "store/.git must not exist (store versioning uses repository root git history)",
  );
}

async function runScenarios(db: Kysely<GravityDatabase>): Promise<{
  scenarios: RunScenario[];
  persistedRuns: PersistedRunProjection[];
}> {
  const runLogStore = createRunLogStore(createKyselyRunLogRepository(db));
  const prefix = `cp5:${Date.now()}:${randomUUID().slice(0, 8)}`;
  const scenarios: RunScenario[] = [
    {
      name: "slash_command.success",
      runId: `${prefix}:slash`,
      sessionKey: "data-analyst:cp5:slash",
      sourceEventId: `${prefix}:source:slash`,
      triggerKind: "message",
      surface: "slack",
      entrypoint: "slash_command",
      shouldFail: false,
    },
    {
      name: "app_mention.success",
      runId: `${prefix}:mention`,
      sessionKey: "data-analyst:cp5:mention",
      sourceEventId: `${prefix}:source:mention`,
      triggerKind: "message",
      surface: "slack",
      entrypoint: "app_mention",
      shouldFail: false,
    },
    {
      name: "thread_reply.failure",
      runId: `${prefix}:thread`,
      sessionKey: "data-analyst:cp5:thread",
      sourceEventId: `${prefix}:source:thread`,
      triggerKind: "message",
      surface: "slack",
      entrypoint: "thread_reply",
      shouldFail: true,
    },
    {
      name: "cron.success",
      runId: `${prefix}:cron`,
      sessionKey: "data-analyst:cp5:cron",
      sourceEventId: `${prefix}:source:cron`,
      triggerKind: "cron",
      surface: "system",
      entrypoint: "cron",
      shouldFail: false,
    },
    {
      name: "heartbeat.success",
      runId: `${prefix}:heartbeat`,
      sessionKey: "data-analyst:cp5:heartbeat",
      sourceEventId: `${prefix}:source:heartbeat`,
      triggerKind: "heartbeat",
      surface: "system",
      entrypoint: "heartbeat",
      shouldFail: false,
    },
  ];

  for (const scenario of scenarios) {
    const resultSummary = `CP5 verification summary (${scenario.name})`;
    const lifecycleLogger = runLogStore.createLifecycleLogger({
      query: `cp5 verification prompt: ${scenario.name}`,
      sourceEventId: scenario.sourceEventId,
      channelId: "C_CP5_VERIFY",
      threadTs: "12345.67890",
      userId: "U_CP5_VERIFY",
      policyDecisions: {
        cp5Scenario: scenario.name,
      },
      getResultSummary: () => resultSummary,
    });

    const context = createRunContext({
      runId: scenario.runId,
      agentId: "data-analyst",
      sessionKey: scenario.sessionKey,
      triggerKind: scenario.triggerKind,
      surface: scenario.surface,
      entrypoint: scenario.entrypoint,
    });

    if (scenario.shouldFail) {
      await assertRejects(
        withRunLifecycle(context, lifecycleLogger, async () => {
          throw new Error(`CP5 expected failure (${scenario.name})`);
        }),
        `CP5 expected failure (${scenario.name})`,
      );
      continue;
    }

    await withRunLifecycle(context, lifecycleLogger, async () => undefined);
  }

  const persistedRuns = await gravitySchema(db)
    .selectFrom("runs")
    .select([
      "id",
      "trigger_kind",
      "surface",
      "entrypoint",
      "status",
      "result_summary",
      "error_message",
      "completed_at",
      "source_event_id",
      "session_key",
    ])
    .where(
      "id",
      "in",
      scenarios.map((scenario) => scenario.runId),
    )
    .execute();

  return {
    scenarios,
    persistedRuns,
  };
}

async function assertRejects(
  promise: Promise<unknown>,
  expectedMessage: string,
): Promise<void> {
  try {
    await promise;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    assert(
      errorMessage.includes(expectedMessage),
      `Expected failure message to include "${expectedMessage}", received "${errorMessage}"`,
    );
    return;
  }

  throw new Error(`Expected promise to reject with "${expectedMessage}"`);
}

function assertPersistedRuns(
  scenarios: ReadonlyArray<RunScenario>,
  persistedRuns: ReadonlyArray<PersistedRunProjection>,
): void {
  assert(
    persistedRuns.length === scenarios.length,
    `Expected ${scenarios.length} persisted runs, found ${persistedRuns.length}`,
  );

  const runById = new Map(persistedRuns.map((row) => [row.id, row]));
  for (const scenario of scenarios) {
    const row = runById.get(scenario.runId);
    assert(row, `Missing persisted run row for ${scenario.runId}`);
    assert(
      row.trigger_kind === scenario.triggerKind,
      `Run ${scenario.name} trigger_kind mismatch`,
    );
    assert(row.surface === scenario.surface, `Run ${scenario.name} surface mismatch`);
    assert(
      row.entrypoint === scenario.entrypoint,
      `Run ${scenario.name} entrypoint mismatch`,
    );
    assert(
      row.source_event_id === scenario.sourceEventId,
      `Run ${scenario.name} source_event_id mismatch`,
    );
    assert(
      row.session_key === scenario.sessionKey,
      `Run ${scenario.name} session_key mismatch`,
    );
    assert(
      row.completed_at !== null,
      `Run ${scenario.name} completed_at must be populated`,
    );

    if (scenario.shouldFail) {
      assert(
        row.status === "failed",
        `Run ${scenario.name} must persist with failed status`,
      );
      assert(
        row.error_message !== null &&
          row.error_message.includes(`CP5 expected failure (${scenario.name})`),
        `Run ${scenario.name} must persist error_message`,
      );
      assert(
        row.result_summary === null,
        `Run ${scenario.name} must not persist result_summary on failure`,
      );
      continue;
    }

    assert(
      row.status === "completed",
      `Run ${scenario.name} must persist with completed status`,
    );
    assert(
      row.result_summary !== null &&
        row.result_summary.includes(`CP5 verification summary (${scenario.name})`),
      `Run ${scenario.name} must persist result_summary`,
    );
    assert(
      row.error_message === null,
      `Run ${scenario.name} must not persist error_message on success`,
    );
  }
}

async function main(): Promise<void> {
  process.loadEnvFile?.();
  const repoRoot = process.cwd();
  assertStoreConventions(repoRoot);

  const databaseUrl = process.env.DATABASE_URL;
  assert(
    typeof databaseUrl === "string" && databaseUrl.trim().length > 0,
    "DATABASE_URL must be set for CP5 verification",
  );

  const db = createDb(databaseUrl);
  try {
    const { scenarios, persistedRuns } = await runScenarios(db);
    assertPersistedRuns(scenarios, persistedRuns);
    console.log(
      `[cp5] verification passed (${scenarios.length} runs validated across slash/non-slash/proactive + failure paths)`,
    );
  } finally {
    await destroyDb(db);
  }
}

await main();
