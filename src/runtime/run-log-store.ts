import type { Kysely } from "kysely";
import { type GravityDatabase, gravitySchema } from "./db.js";
import type {
  RunEntrypoint,
  RunLifecycleEvent,
  RunLifecycleLogger,
  RunSurface,
  RunTriggerKind,
} from "./run-lifecycle.js";

export type RunLogLifecycleMetadata = {
  query: string;
  sourceEventId?: string | null;
  channelId?: string | null;
  threadTs?: string | null;
  userId?: string | null;
  userName?: string | null;
  policyDecisions?: Record<string, unknown>;
  getResultSummary?: () => string | null | undefined;
};

export type RunStartedRecord = {
  runId: string;
  agentId: string;
  sessionKey: string;
  triggerKind: RunTriggerKind;
  surface: RunSurface;
  entrypoint: RunEntrypoint;
  sourceEventId: string | null;
  channelId: string | null;
  threadTs: string | null;
  userId: string | null;
  userName: string | null;
  query: string;
  policyDecisions: Record<string, unknown>;
  startedAt: Date;
};

export type RunCompletedRecord = {
  completedAt: Date;
  resultSummary: string | null;
};

export type RunFailedRecord = {
  completedAt: Date;
  errorMessage: string | null;
};

export type RunLogRepository = {
  insertStartedRun: (record: RunStartedRecord) => Promise<void>;
  markRunCompleted: (runId: string, record: RunCompletedRecord) => Promise<void>;
  markRunFailed: (runId: string, record: RunFailedRecord) => Promise<void>;
};

export type RunLogStore = {
  createLifecycleLogger: (metadata: RunLogLifecycleMetadata) => RunLifecycleLogger;
};

function normalizeNullableString(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeQuery(query: string): string {
  const trimmed = query.trim();
  if (trimmed.length === 0) {
    throw new Error("Run log metadata query must be non-empty");
  }

  return trimmed;
}

function normalizePolicyDecisions(
  value: Record<string, unknown> | undefined,
): Record<string, unknown> {
  return value ?? {};
}

function normalizeResultSummary(
  getter: RunLogLifecycleMetadata["getResultSummary"],
): string | null {
  if (!getter) {
    return null;
  }

  return normalizeNullableString(getter());
}

function parseLifecycleTimestamp(event: RunLifecycleEvent): Date {
  const parsed = new Date(event.timestamp);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(
      `Invalid lifecycle timestamp for run ${event.runId}: ${event.timestamp}`,
    );
  }

  return parsed;
}

function assertNeverStage(stage: never): never {
  throw new Error(`Unhandled run lifecycle stage: ${stage}`);
}

export function createRunLogStore(repository: RunLogRepository): RunLogStore {
  return {
    createLifecycleLogger(metadata) {
      const query = normalizeQuery(metadata.query);
      const sourceEventId = normalizeNullableString(metadata.sourceEventId);
      const channelId = normalizeNullableString(metadata.channelId);
      const threadTs = normalizeNullableString(metadata.threadTs);
      const userId = normalizeNullableString(metadata.userId);
      const userName = normalizeNullableString(metadata.userName);
      const policyDecisions = normalizePolicyDecisions(metadata.policyDecisions);

      return async (event) => {
        const eventTimestamp = parseLifecycleTimestamp(event);

        switch (event.stage) {
          case "started":
            await repository.insertStartedRun({
              runId: event.runId,
              agentId: event.agentId,
              sessionKey: event.sessionKey,
              triggerKind: event.triggerKind,
              surface: event.surface,
              entrypoint: event.entrypoint,
              sourceEventId,
              channelId,
              threadTs,
              userId,
              userName,
              query,
              policyDecisions,
              startedAt: eventTimestamp,
            });
            return;
          case "completed":
            await repository.markRunCompleted(event.runId, {
              completedAt: eventTimestamp,
              resultSummary: normalizeResultSummary(metadata.getResultSummary),
            });
            return;
          case "failed":
            await repository.markRunFailed(event.runId, {
              completedAt: eventTimestamp,
              errorMessage: normalizeNullableString(event.errorMessage),
            });
            return;
          default:
            assertNeverStage(event.stage);
        }
      };
    },
  };
}

export function createKyselyRunLogRepository(
  db: Kysely<GravityDatabase>,
): RunLogRepository {
  const schemaDb = gravitySchema(db);

  return {
    async insertStartedRun(record) {
      await schemaDb
        .insertInto("runs")
        .values({
          id: record.runId,
          agent_id: record.agentId,
          session_key: record.sessionKey,
          thread_ts: record.threadTs,
          trigger_kind: record.triggerKind,
          surface: record.surface,
          entrypoint: record.entrypoint,
          source_event_id: record.sourceEventId,
          channel_id: record.channelId,
          user_id: record.userId,
          user_name: record.userName,
          query: record.query,
          status: "running",
          result_summary: null,
          error_message: null,
          policy_decisions: record.policyDecisions,
          started_at: record.startedAt,
          completed_at: null,
        })
        .onConflict((conflict) => conflict.column("id").doNothing())
        .executeTakeFirst();
    },
    async markRunCompleted(runId, record) {
      await schemaDb
        .updateTable("runs")
        .set({
          status: "completed",
          completed_at: record.completedAt,
          result_summary: record.resultSummary,
          error_message: null,
        })
        .where("id", "=", runId)
        .executeTakeFirst();
    },
    async markRunFailed(runId, record) {
      await schemaDb
        .updateTable("runs")
        .set({
          status: "failed",
          completed_at: record.completedAt,
          error_message: record.errorMessage,
          result_summary: null,
        })
        .where("id", "=", runId)
        .executeTakeFirst();
    },
  };
}
