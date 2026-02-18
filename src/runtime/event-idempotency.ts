import type { Kysely } from "kysely";
import { type GravityDatabase, gravitySchema } from "./db.js";

export type EventIdempotencyRepository = {
  hasProcessedSourceEvent: (sourceEventId: string) => Promise<boolean>;
};

export type EventIdempotencyGuard = {
  tryAcquire: (sourceEventId: string) => Promise<boolean>;
  release: (sourceEventId: string) => void;
};

function normalizeSourceEventId(sourceEventId: string): string {
  const normalized = sourceEventId.trim();
  if (normalized.length === 0) {
    throw new Error("sourceEventId must be non-empty");
  }

  return normalized;
}

export function createEventIdempotencyGuard(
  repository: EventIdempotencyRepository,
): EventIdempotencyGuard {
  const inFlight = new Set<string>();

  return {
    async tryAcquire(sourceEventId) {
      const normalized = normalizeSourceEventId(sourceEventId);
      if (inFlight.has(normalized)) {
        return false;
      }

      inFlight.add(normalized);

      try {
        const hasProcessed =
          await repository.hasProcessedSourceEvent(normalized);
        if (hasProcessed) {
          inFlight.delete(normalized);
          return false;
        }

        return true;
      } catch (error) {
        inFlight.delete(normalized);
        throw error;
      }
    },
    release(sourceEventId) {
      const normalized = normalizeSourceEventId(sourceEventId);
      inFlight.delete(normalized);
    },
  };
}

export function createKyselyEventIdempotencyRepository(
  db: Kysely<GravityDatabase>,
): EventIdempotencyRepository {
  return {
    async hasProcessedSourceEvent(sourceEventId) {
      const row = await gravitySchema(db)
        .selectFrom("runs")
        .select("id")
        .where("source_event_id", "=", sourceEventId)
        .executeTakeFirst();
      return row !== undefined;
    },
  };
}
