import { describe, expect, it } from "vitest";
import { createSelfAuthoringMutationQueue } from "../../src/runtime/self-authoring-mutation-queue.js";

describe("createSelfAuthoringMutationQueue", () => {
  it("serializes same-scope items in FIFO order", async () => {
    const queue = createSelfAuthoringMutationQueue({ maxDepth: 8 });
    const order: string[] = [];

    const first = queue.enqueue({
      lockScopeKey: "data-analyst",
      triggerKey: "trigger-1",
      task: async () => {
        order.push("first-start");
        await new Promise((resolve) => setTimeout(resolve, 25));
        order.push("first-end");
        return "first";
      },
    });
    const second = queue.enqueue({
      lockScopeKey: "data-analyst",
      triggerKey: "trigger-2",
      task: async () => {
        order.push("second-start");
        order.push("second-end");
        return "second";
      },
    });

    expect(first.status).toBe("enqueued");
    expect(second.status).toBe("enqueued");

    const firstResult = await first.completion;
    const secondResult = await second.completion;

    expect(firstResult).toBe("first");
    expect(secondResult).toBe("second");
    expect(order).toEqual([
      "first-start",
      "first-end",
      "second-start",
      "second-end",
    ]);
  });

  it("dedupes duplicate trigger keys, including replay after completion", async () => {
    const queue = createSelfAuthoringMutationQueue({ maxDepth: 8 });

    const first = queue.enqueue({
      lockScopeKey: "data-analyst",
      triggerKey: "trigger-1",
      task: async () => "first",
    });
    expect(first.status).toBe("enqueued");
    await first.completion;

    const duplicate = queue.enqueue({
      lockScopeKey: "data-analyst",
      triggerKey: "trigger-1",
      task: async () => "duplicate",
    });

    expect(duplicate).toMatchObject({
      status: "deduped_duplicate",
      queueSeq: null,
      completion: null,
    });
  });

  it("rejects when queue depth exceeds maxDepth", () => {
    const queue = createSelfAuthoringMutationQueue({ maxDepth: 1 });

    const first = queue.enqueue({
      lockScopeKey: "data-analyst",
      triggerKey: "trigger-1",
      task: async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return "first";
      },
    });

    const second = queue.enqueue({
      lockScopeKey: "data-analyst",
      triggerKey: "trigger-2",
      task: async () => "second",
    });

    expect(first.status).toBe("enqueued");
    expect(second).toMatchObject({
      status: "queue_overflow",
      queueSeq: null,
      maxDepth: 1,
    });
  });
});
