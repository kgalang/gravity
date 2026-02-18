import { describe, expect, it } from "vitest";
import {
  composeRunLifecycleLoggers,
  createRunContext,
  type RunLifecycleEvent,
  withRunLifecycle,
} from "../../src/runtime/run-lifecycle.js";

describe("createRunContext", () => {
  it("preserves explicit runId and stable identifiers", () => {
    const context = createRunContext({
      runId: "run-123",
      agentId: "data-analyst",
      sessionKey: "data-analyst:1700000000.1234",
      source: "slack",
    });

    expect(context).toEqual({
      runId: "run-123",
      agentId: "data-analyst",
      sessionKey: "data-analyst:1700000000.1234",
      source: "slack",
    });
  });

  it("generates a runId when omitted", () => {
    const context = createRunContext({
      agentId: "compliance-helper",
      sessionKey: "compliance-helper:main",
      source: "system",
    });

    expect(context.runId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });
});

describe("withRunLifecycle", () => {
  it("composes multiple lifecycle loggers in order", async () => {
    const events: string[] = [];
    const context = createRunContext({
      runId: "run-composed-loggers",
      agentId: "system-bootstrap",
      sessionKey: "system-bootstrap:main",
      source: "system",
    });
    const logger = composeRunLifecycleLoggers([
      async (event) => {
        events.push(`one:${event.stage}`);
      },
      async (event) => {
        events.push(`two:${event.stage}`);
      },
    ]);

    await withRunLifecycle(context, logger, async () => undefined);

    expect(events).toEqual([
      "one:started",
      "two:started",
      "one:completed",
      "two:completed",
    ]);
  });

  it("emits started and completed events on success", async () => {
    const events: RunLifecycleEvent[] = [];
    const context = createRunContext({
      runId: "run-success",
      agentId: "data-analyst",
      sessionKey: "data-analyst:main",
      source: "slack",
    });

    const result = await withRunLifecycle(context, (event) => {
      events.push(event);
    }, async () => "ok");

    expect(result).toBe("ok");
    expect(events).toHaveLength(2);
    expect(events[0]?.stage).toBe("started");
    expect(events[1]?.stage).toBe("completed");
    expect(events[1]?.runId).toBe("run-success");
    expect(events[1]?.agentId).toBe("data-analyst");
    expect(events[1]?.sessionKey).toBe("data-analyst:main");
    expect(events[1]?.durationMs).toBeTypeOf("number");
  });

  it("emits failed event and rethrows errors", async () => {
    const events: RunLifecycleEvent[] = [];
    const context = createRunContext({
      runId: "run-failure",
      agentId: "compliance-helper",
      sessionKey: "compliance-helper:main",
      source: "cron",
    });

    await expect(
      withRunLifecycle(
        context,
        (event) => {
          events.push(event);
        },
        async () => {
          throw new Error("boom");
        },
      ),
    ).rejects.toThrow("boom");

    expect(events).toHaveLength(2);
    expect(events[0]?.stage).toBe("started");
    expect(events[1]?.stage).toBe("failed");
    expect(events[1]?.errorMessage).toBe("boom");
    expect(events[1]?.durationMs).toBeTypeOf("number");
  });

  it("handles non-Error throw values", async () => {
    const events: RunLifecycleEvent[] = [];
    const context = createRunContext({
      runId: "run-non-error",
      agentId: "system-bootstrap",
      sessionKey: "system-bootstrap:main",
      source: "system",
    });

    await expect(
      withRunLifecycle(
        context,
        (event) => {
          events.push(event);
        },
        () => {
          throw "string failure";
        },
      ),
    ).rejects.toBe("string failure");

    expect(events.at(-1)?.stage).toBe("failed");
    expect(events.at(-1)?.errorMessage).toBe("string failure");
  });

  it("awaits async logger failures before running the body", async () => {
    const context = createRunContext({
      runId: "run-async-logger-failure",
      agentId: "system-bootstrap",
      sessionKey: "system-bootstrap:main",
      source: "system",
    });
    let runCalled = false;

    await expect(
      withRunLifecycle(
        context,
        async () => {
          throw new Error("logger broke");
        },
        async () => {
          runCalled = true;
          return "ok";
        },
      ),
    ).rejects.toThrow("logger broke");

    expect(runCalled).toBe(false);
  });
});
