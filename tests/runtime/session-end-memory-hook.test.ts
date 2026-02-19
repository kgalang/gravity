import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SessionIdleEvent } from "../../src/runtime/session-idle-eviction.js";
import {
  createSessionEndMemoryHook,
  runSessionIdleCloseFlow,
} from "../../src/runtime/session-end-memory-hook.js";
import { createSessionHistoryStore } from "../../src/runtime/session-history-store.js";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map(async (root) => {
      await rm(root, { recursive: true, force: true });
    }),
  );
});

async function createTempRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), prefix));
  tempRoots.push(root);
  return root;
}

function createIdleEvent(overrides?: Partial<SessionIdleEvent>): SessionIdleEvent {
  return {
    agentId: "data-analyst",
    sessionKey: "data-analyst:thread-1",
    reason: "idle_eviction",
    lastActivityAt: "2026-02-18T20:00:00.000Z",
    closedAt: "2026-02-18T20:30:00.000Z",
    ...overrides,
  };
}

describe("createSessionEndMemoryHook", () => {
  it("runs a silent memory turn and appends hook input/output records", async () => {
    const tempRoot = await createTempRoot("gravity-session-end-memory-hook-");
    const historyStore = createSessionHistoryStore({
      cwd: tempRoot,
      workspaceRoot: "workspace",
    });
    const runSilentTurn = vi.fn(async () => ({
      responseText: "NO_REPLY",
      modelId: "claude-sonnet-4-5",
    }));

    const hook = createSessionEndMemoryHook({
      enabled: true,
      anthropicApiKey: "test-api-key",
      sessionHistoryStore: historyStore,
      loadAgentMemoryPath: async () => "store/agents/data-analyst/memory",
      runSilentTurn,
      now: () => new Date("2026-02-18T20:30:00.000Z"),
    });

    const event = createIdleEvent();
    const result = await hook.run(event);

    expect(result).toEqual({
      status: "performed",
      sourceEventId:
        "session-end-memory:data-analyst:data-analyst:thread-1:idle_eviction:2026-02-18T20:30:00.000Z",
      noReply: true,
    });

    expect(runSilentTurn).toHaveBeenCalledTimes(1);
    expect(runSilentTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: "data-analyst",
        sessionKey: "data-analyst:thread-1",
        prompt: expect.stringContaining("Memory file: store/agents/data-analyst/memory/MEMORY.md"),
      }),
    );

    const paths = await historyStore.ensureSessionScaffold(
      "data-analyst",
      "data-analyst:thread-1",
    );
    const lines = (await readFile(paths.sessionLogPath, "utf8"))
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Record<string, unknown>);

    expect(lines).toHaveLength(2);
    expect(lines[0]?.role).toBe("system");
    expect(lines[0]?.metadata).toMatchObject({
      phase: "memory_hook_input",
      idleCloseReason: "idle_eviction",
      skipContextReplay: true,
    });
    expect(lines[1]?.role).toBe("assistant");
    expect(lines[1]?.metadata).toMatchObject({
      phase: "memory_hook_output",
      noReply: true,
      skipContextReplay: true,
    });
  });

  it("skips when the Anthropic API key is missing", async () => {
    const tempRoot = await createTempRoot("gravity-session-end-memory-hook-");
    const historyStore = createSessionHistoryStore({
      cwd: tempRoot,
      workspaceRoot: "workspace",
    });
    const runSilentTurn = vi.fn();
    const logs: string[] = [];

    const hook = createSessionEndMemoryHook({
      enabled: true,
      anthropicApiKey: null,
      sessionHistoryStore: historyStore,
      loadAgentMemoryPath: async () => "store/agents/data-analyst/memory",
      runSilentTurn,
      log: (message) => {
        logs.push(message);
      },
    });

    const result = await hook.run(createIdleEvent());
    expect(result).toEqual({
      status: "skipped",
      reason: "missing_api_key",
    });
    expect(runSilentTurn).not.toHaveBeenCalled();
    expect(logs).toEqual([
      "[gravity][warning] session-end memory hook skipped (agentId=data-analyst sessionKey=data-analyst:thread-1 reason=missing_api_key)",
    ]);
  });

  it("skips when the agent has no memory path", async () => {
    const tempRoot = await createTempRoot("gravity-session-end-memory-hook-");
    const historyStore = createSessionHistoryStore({
      cwd: tempRoot,
      workspaceRoot: "workspace",
    });
    const runSilentTurn = vi.fn();
    const logs: string[] = [];

    const hook = createSessionEndMemoryHook({
      enabled: true,
      anthropicApiKey: "test-api-key",
      sessionHistoryStore: historyStore,
      loadAgentMemoryPath: async () => null,
      runSilentTurn,
      log: (message) => {
        logs.push(message);
      },
    });

    const result = await hook.run(createIdleEvent());
    expect(result).toEqual({
      status: "skipped",
      reason: "missing_memory_path",
    });
    expect(runSilentTurn).not.toHaveBeenCalled();
    expect(logs).toEqual([
      "[gravity][warning] session-end memory hook skipped (agentId=data-analyst sessionKey=data-analyst:thread-1 reason=missing_memory_path)",
    ]);
  });
});

describe("runSessionIdleCloseFlow", () => {
  it("still attempts guarded close when the memory hook throws", async () => {
    const calls: string[] = [];
    const logs: string[] = [];

    await runSessionIdleCloseFlow({
      event: createIdleEvent(),
      memoryHook: {
        run: async () => {
          calls.push("memory_hook");
          throw new Error("model timeout");
        },
      },
      closeSessionIfUnchanged: async ({
        sessionKey,
        expectedLastActivityAt,
        closedAt,
      }) => {
        calls.push(
          `close_if_unchanged:${sessionKey}:${expectedLastActivityAt.toISOString()}:${closedAt.toISOString()}`,
        );
        return true;
      },
      log: (message) => {
        logs.push(message);
      },
    });

    expect(calls).toEqual([
      "memory_hook",
      "close_if_unchanged:data-analyst:thread-1:2026-02-18T20:00:00.000Z:2026-02-18T20:30:00.000Z",
    ]);
    expect(logs).toEqual([
      "[gravity][warning] session-end memory hook failed (agentId=data-analyst sessionKey=data-analyst:thread-1 reason=idle_eviction): model timeout",
    ]);
  });

  it("skips close when guarded close detects stale callback", async () => {
    const calls: string[] = [];
    const logs: string[] = [];

    await runSessionIdleCloseFlow({
      event: createIdleEvent(),
      memoryHook: {
        run: async () => {
          calls.push("memory_hook");
          return {
            status: "performed",
            sourceEventId: "session-end-memory:test",
            noReply: true,
          };
        },
      },
      closeSessionIfUnchanged: async () => {
        calls.push("close_if_unchanged");
        return false;
      },
      log: (message) => {
        logs.push(message);
      },
    });

    expect(calls).toEqual(["memory_hook", "close_if_unchanged"]);
    expect(logs).toEqual([
      "[gravity][warning] session idle close skipped (agentId=data-analyst sessionKey=data-analyst:thread-1 reason=idle_eviction): stale_callback",
    ]);
  });
});
