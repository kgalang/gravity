import { describe, expect, it } from "vitest";
import {
  createEventIdempotencyGuard,
  type EventIdempotencyRepository,
} from "../../src/runtime/event-idempotency.js";

class FakeEventIdempotencyRepository implements EventIdempotencyRepository {
  readonly processedEventIds = new Set<string>();

  async hasProcessedSourceEvent(sourceEventId: string): Promise<boolean> {
    return this.processedEventIds.has(sourceEventId);
  }
}

describe("createEventIdempotencyGuard", () => {
  it("dedupes in-flight source events", async () => {
    const repository = new FakeEventIdempotencyRepository();
    const guard = createEventIdempotencyGuard(repository);

    await expect(guard.tryAcquire("event-1")).resolves.toBe(true);
    await expect(guard.tryAcquire("event-1")).resolves.toBe(false);

    guard.release("event-1");
    await expect(guard.tryAcquire("event-1")).resolves.toBe(true);
  });

  it("blocks source events that are already recorded", async () => {
    const repository = new FakeEventIdempotencyRepository();
    repository.processedEventIds.add("event-2");
    const guard = createEventIdempotencyGuard(repository);

    await expect(guard.tryAcquire("event-2")).resolves.toBe(false);
  });

  it("dedupes identical sourceEventId across slash and non-slash handlers", async () => {
    const repository = new FakeEventIdempotencyRepository();
    const guard = createEventIdempotencyGuard(repository);
    const sharedSourceEventId = "shared-source-event";

    const slashAcquired = await guard.tryAcquire(sharedSourceEventId);
    const messageAcquired = await guard.tryAcquire(sharedSourceEventId);

    expect(slashAcquired).toBe(true);
    expect(messageAcquired).toBe(false);
  });
});
