import type { Kysely } from "kysely";
import { type GravityDatabase, gravitySchema } from "./db.js";
import type { RunSurface, RunTriggerKind } from "./run-lifecycle.js";

export type SessionMode = "thread" | "main" | "isolated";

export type EnsureSessionInput = {
  sessionKey: string;
  agentId: string;
  mode: SessionMode;
  surface: RunSurface;
  channelId?: string | null;
  threadTs?: string | null;
  ownerUserId?: string | null;
  openedByTrigger: RunTriggerKind;
};

export type SessionCatalog = {
  ensureSessionActive: (input: EnsureSessionInput) => Promise<void>;
  closeSession: (input: { sessionKey: string; closedAt?: Date }) => Promise<void>;
  closeSessionIfUnchanged: (input: {
    sessionKey: string;
    expectedLastActivityAt: Date;
    closedAt?: Date;
  }) => Promise<boolean>;
};

type SessionRecord = {
  sessionKey: string;
  agentId: string;
  mode: SessionMode;
  status: "active" | "closed";
  surface: RunSurface;
  channelId: string | null;
  threadTs: string | null;
  ownerUserId: string | null;
  openedByTrigger: RunTriggerKind;
  activityAt: Date;
};

export type SessionCatalogRepository = {
  upsertSession: (record: SessionRecord) => Promise<void>;
  closeSession: (input: { sessionKey: string; closedAt: Date }) => Promise<void>;
  closeSessionIfUnchanged: (input: {
    sessionKey: string;
    expectedLastActivityAt: Date;
    closedAt: Date;
  }) => Promise<boolean>;
};

function normalizeRequired(value: string, label: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error(`Session catalog ${label} must be non-empty`);
  }

  return trimmed;
}

function normalizeNullable(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeDate(value: Date, label: string): Date {
  if (Number.isNaN(value.getTime())) {
    throw new Error(`Session catalog ${label} must be a valid date`);
  }
  return value;
}

export function createSessionCatalog(
  repository: SessionCatalogRepository,
): SessionCatalog {
  return {
    async ensureSessionActive(input) {
      await repository.upsertSession({
        sessionKey: normalizeRequired(input.sessionKey, "sessionKey"),
        agentId: normalizeRequired(input.agentId, "agentId"),
        mode: input.mode,
        status: "active",
        surface: input.surface,
        channelId: normalizeNullable(input.channelId),
        threadTs: normalizeNullable(input.threadTs),
        ownerUserId: normalizeNullable(input.ownerUserId),
        openedByTrigger: input.openedByTrigger,
        activityAt: new Date(),
      });
    },
    async closeSession(input) {
      await repository.closeSession({
        sessionKey: normalizeRequired(input.sessionKey, "sessionKey"),
        closedAt: normalizeDate(
          input.closedAt ?? new Date(),
          "closedAt",
        ),
      });
    },
    async closeSessionIfUnchanged(input) {
      return repository.closeSessionIfUnchanged({
        sessionKey: normalizeRequired(input.sessionKey, "sessionKey"),
        expectedLastActivityAt: normalizeDate(
          input.expectedLastActivityAt,
          "expectedLastActivityAt",
        ),
        closedAt: normalizeDate(
          input.closedAt ?? new Date(),
          "closedAt",
        ),
      });
    },
  };
}

export function createKyselySessionCatalogRepository(
  db: Kysely<GravityDatabase>,
): SessionCatalogRepository {
  const schemaDb = gravitySchema(db);

  return {
    async upsertSession(record) {
      await schemaDb
        .insertInto("sessions")
        .values({
          session_key: record.sessionKey,
          agent_id: record.agentId,
          mode: record.mode,
          status: record.status,
          surface: record.surface,
          channel_id: record.channelId,
          thread_ts: record.threadTs,
          owner_user_id: record.ownerUserId,
          opened_by_trigger: record.openedByTrigger,
          created_at: record.activityAt,
          last_activity_at: record.activityAt,
          closed_at: null,
        })
        .onConflict((conflict) =>
          conflict.column("session_key").doUpdateSet({
            agent_id: record.agentId,
            mode: record.mode,
            status: record.status,
            surface: record.surface,
            channel_id: record.channelId,
            thread_ts: record.threadTs,
            owner_user_id: record.ownerUserId,
            opened_by_trigger: record.openedByTrigger,
            last_activity_at: record.activityAt,
            closed_at: null,
          }),
        )
        .executeTakeFirst();
    },
    async closeSession(input) {
      await schemaDb
        .updateTable("sessions")
        .set({
          status: "closed",
          last_activity_at: input.closedAt,
          closed_at: input.closedAt,
        })
        .where("session_key", "=", input.sessionKey)
        .executeTakeFirst();
    },
    async closeSessionIfUnchanged(input) {
      const updated = await schemaDb
        .updateTable("sessions")
        .set({
          status: "closed",
          last_activity_at: input.closedAt,
          closed_at: input.closedAt,
        })
        .where("session_key", "=", input.sessionKey)
        .where("status", "=", "active")
        .where("last_activity_at", "<=", input.expectedLastActivityAt)
        .returning("session_key")
        .executeTakeFirst();
      return updated !== undefined;
    },
  };
}
