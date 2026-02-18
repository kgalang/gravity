import { afterEach, describe, expect, it, vi } from "vitest";
import { createSessionIdleEvictionCoordinator } from "../../src/runtime/session-idle-eviction.js";

afterEach(() => {
  vi.useRealTimers();
});

describe("createSessionIdleEvictionCoordinator", () => {
  it("evicts inactive sessions after timeout", async () => {
    vi.useFakeTimers();

    const events: Array<{ sessionKey: string; reason: string }> = [];
    const coordinator = createSessionIdleEvictionCoordinator({
      enabled: true,
      idleTimeoutMs: 1000,
      onSessionIdle: async (event) => {
        events.push({ sessionKey: event.sessionKey, reason: event.reason });
      },
    });

    coordinator.recordActivity({
      agentId: "data-analyst",
      sessionKey: "data-analyst:thread-1",
    });

    await vi.advanceTimersByTimeAsync(999);
    expect(events).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(2);
    expect(events).toEqual([
      {
        sessionKey: "data-analyst:thread-1",
        reason: "idle_eviction",
      },
    ]);
  });

  it("resets timers when new activity arrives", async () => {
    vi.useFakeTimers();

    const events: string[] = [];
    const coordinator = createSessionIdleEvictionCoordinator({
      enabled: true,
      idleTimeoutMs: 1000,
      onSessionIdle: async (event) => {
        events.push(event.reason);
      },
    });

    coordinator.recordActivity({
      agentId: "data-analyst",
      sessionKey: "data-analyst:thread-2",
    });

    await vi.advanceTimersByTimeAsync(900);
    coordinator.recordActivity({
      agentId: "data-analyst",
      sessionKey: "data-analyst:thread-2",
    });

    await vi.advanceTimersByTimeAsync(900);
    expect(events).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(200);
    expect(events).toEqual(["idle_eviction"]);
  });

  it("closes pending sessions on shutdown", async () => {
    const events: Array<{ sessionKey: string; reason: string }> = [];
    const coordinator = createSessionIdleEvictionCoordinator({
      enabled: true,
      idleTimeoutMs: 10_000,
      onSessionIdle: async (event) => {
        events.push({ sessionKey: event.sessionKey, reason: event.reason });
      },
    });

    coordinator.recordActivity({
      agentId: "data-analyst",
      sessionKey: "data-analyst:thread-3",
    });

    await coordinator.shutdown();

    expect(events).toEqual([
      {
        sessionKey: "data-analyst:thread-3",
        reason: "shutdown",
      },
    ]);
  });

  it("logs and swallows idle callback failures", async () => {
    vi.useFakeTimers();
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const coordinator = createSessionIdleEvictionCoordinator({
      enabled: true,
      idleTimeoutMs: 1000,
      onSessionIdle: async () => {
        throw new Error("db unavailable");
      },
    });

    coordinator.recordActivity({
      agentId: "data-analyst",
      sessionKey: "data-analyst:thread-4",
    });

    await vi.advanceTimersByTimeAsync(1001);
    expect(errorLog).toHaveBeenCalledWith(
      expect.stringContaining(
        "session idle eviction callback failed (agentId=data-analyst sessionKey=data-analyst:thread-4 reason=idle_eviction): db unavailable",
      ),
    );

    errorLog.mockRestore();
  });
});
