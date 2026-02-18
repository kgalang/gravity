import { describe, expect, it } from "vitest";
import {
  createRunContext,
  withRunLifecycle,
} from "../../src/runtime/run-lifecycle.js";
import {
  createRunLogStore,
  type RunCompletedRecord,
  type RunFailedRecord,
  type RunLogRepository,
  type RunStartedRecord,
} from "../../src/runtime/run-log-store.js";

class FakeRunLogRepository implements RunLogRepository {
  readonly started: RunStartedRecord[] = [];
  readonly completed: Array<{ runId: string; record: RunCompletedRecord }> = [];
  readonly failed: Array<{ runId: string; record: RunFailedRecord }> = [];

  async insertStartedRun(record: RunStartedRecord): Promise<void> {
    this.started.push(record);
  }

  async markRunCompleted(
    runId: string,
    record: RunCompletedRecord,
  ): Promise<void> {
    this.completed.push({ runId, record });
  }

  async markRunFailed(runId: string, record: RunFailedRecord): Promise<void> {
    this.failed.push({ runId, record });
  }
}

describe("createRunLogStore", () => {
  it("writes started and completed run records", async () => {
    const repository = new FakeRunLogRepository();
    const store = createRunLogStore(repository);
    let resultSummary = "pending";

    const lifecycleLogger = store.createLifecycleLogger({
      query: "/wiggs top customers",
      sourceEventId: "trigger-1",
      channelId: "C123",
      userId: "U123",
      userName: "kevin",
      policyDecisions: { response_type: "in_channel" },
      getResultSummary: () => resultSummary,
    });

    const runContext = createRunContext({
      runId: "slack:trigger-1",
      agentId: "data-analyst",
      sessionKey: "data-analyst:trigger-1",
      triggerKind: "message",
      surface: "slack",
      entrypoint: "slash_command",
    });

    await withRunLifecycle(runContext, lifecycleLogger, async () => {
      resultSummary = "routed in_channel echo";
    });

    expect(repository.started).toHaveLength(1);
    expect(repository.started[0]).toMatchObject({
      runId: "slack:trigger-1",
      agentId: "data-analyst",
      sessionKey: "data-analyst:trigger-1",
      triggerKind: "message",
      surface: "slack",
      entrypoint: "slash_command",
      sourceEventId: "trigger-1",
      channelId: "C123",
      threadTs: null,
      userId: "U123",
      userName: "kevin",
      query: "/wiggs top customers",
      policyDecisions: { response_type: "in_channel" },
    });
    expect(repository.started[0]?.startedAt).toBeInstanceOf(Date);

    expect(repository.completed).toHaveLength(1);
    expect(repository.completed[0]).toMatchObject({
      runId: "slack:trigger-1",
      record: {
        resultSummary: "routed in_channel echo",
      },
    });
    expect(repository.completed[0]?.record.completedAt).toBeInstanceOf(Date);
    expect(repository.failed).toHaveLength(0);
  });

  it("writes failed run updates with normalized error messages", async () => {
    const repository = new FakeRunLogRepository();
    const store = createRunLogStore(repository);
    const lifecycleLogger = store.createLifecycleLogger({
      query: "/compliance review policy",
      sourceEventId: "trigger-2",
      channelId: "C222",
      userId: "U222",
    });

    const runContext = createRunContext({
      runId: "slack:trigger-2",
      agentId: "compliance-helper",
      sessionKey: "compliance-helper:trigger-2",
      triggerKind: "message",
      surface: "slack",
      entrypoint: "slash_command",
    });

    await expect(
      withRunLifecycle(runContext, lifecycleLogger, async () => {
        throw new Error("slash handler failed");
      }),
    ).rejects.toThrow("slash handler failed");

    expect(repository.started).toHaveLength(1);
    expect(repository.completed).toHaveLength(0);
    expect(repository.failed).toHaveLength(1);
    expect(repository.failed[0]).toMatchObject({
      runId: "slack:trigger-2",
      record: {
        errorMessage: "slash handler failed",
      },
    });
    expect(repository.failed[0]?.record.completedAt).toBeInstanceOf(Date);
  });

  it("rejects empty run query metadata", () => {
    const repository = new FakeRunLogRepository();
    const store = createRunLogStore(repository);

    expect(() =>
      store.createLifecycleLogger({
        query: "  ",
      }),
    ).toThrow("Run log metadata query must be non-empty");
  });
});
