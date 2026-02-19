import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { SessionManager } from "@mariozechner/pi-coding-agent";
import {
  createSessionEndMemoryHook,
  runSessionIdleCloseFlow,
} from "../src/runtime/session-end-memory-hook.js";
import { createSessionHistoryStore } from "../src/runtime/session-history-store.js";

async function verifySessionEndMemoryHook(tempRoot: string): Promise<void> {
  const memoryDir = path.join(tempRoot, "store", "agents", "alpha", "memory");
  const memoryFilePath = path.join(memoryDir, "MEMORY.md");
  await mkdir(memoryDir, { recursive: true });
  await writeFile(memoryFilePath, "# Agent Memory\n", "utf8");

  const historyStore = createSessionHistoryStore({
    cwd: tempRoot,
    workspaceRoot: "workspace",
  });
  const hook = createSessionEndMemoryHook({
    enabled: true,
    anthropicApiKey: "test-api-key",
    sessionHistoryStore: historyStore,
    loadAgentMemoryPath: async () => "store/agents/alpha/memory",
    runSilentTurn: async ({ prompt }) => {
      assert.match(
        prompt,
        /Memory file: store\/agents\/alpha\/memory\/MEMORY\.md/,
      );
      await writeFile(
        memoryFilePath,
        "# Agent Memory\n\n- Learned durable customer preference: enterprise buyers ask for weekly trend deltas.\n",
        "utf8",
      );
      return {
        responseText: "NO_REPLY",
        modelId: "test-model",
      };
    },
    now: () => new Date("2026-02-18T21:00:00.000Z"),
  });

  const event = {
    agentId: "alpha",
    sessionKey: "alpha:thread-verify",
    reason: "idle_eviction" as const,
    lastActivityAt: "2026-02-18T20:45:00.000Z",
    closedAt: "2026-02-18T21:00:00.000Z",
  };

  const result = await hook.run(event);
  assert.equal(result.status, "performed");
  assert.equal(result.noReply, true);

  const memoryContent = await readFile(memoryFilePath, "utf8");
  assert.match(memoryContent, /durable customer preference/i);

  const paths = await historyStore.ensureSessionScaffold(
    "alpha",
    "alpha:thread-verify",
  );
  const logLines = (await readFile(paths.sessionLogPath, "utf8"))
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
  assert.equal(logLines.length, 2);
  assert.equal(logLines[0]?.role, "system");
  assert.equal((logLines[0]?.metadata as { skipContextReplay?: unknown })?.skipContextReplay, true);
  assert.equal(logLines[1]?.role, "assistant");
  assert.equal((logLines[1]?.metadata as { skipContextReplay?: unknown })?.skipContextReplay, true);

  const sessionManager = SessionManager.open(paths.contextPath, paths.sessionDir);
  const synced = await historyStore.syncLogToSessionContext({
    agentId: "alpha",
    sessionKey: "alpha:thread-verify",
    sessionManager,
    excludeSourceEventId: null,
  });
  assert.equal(synced, 0);
}

async function verifyIdleCloseFallback(): Promise<void> {
  const calls: string[] = [];

  await runSessionIdleCloseFlow({
    event: {
      agentId: "alpha",
      sessionKey: "alpha:thread-verify",
      reason: "idle_eviction",
      lastActivityAt: "2026-02-18T20:45:00.000Z",
      closedAt: "2026-02-18T21:00:00.000Z",
    },
    memoryHook: {
      run: async () => {
        calls.push("memory_hook");
        throw new Error("turn failed");
      },
    },
    closeSessionIfUnchanged: async () => {
      calls.push("close_session");
      return true;
    },
    log: (message) => {
      if (message.includes("turn failed")) {
        calls.push("hook_failure_logged");
      }
    },
  });

  assert.deepEqual(calls, [
    "memory_hook",
    "hook_failure_logged",
    "close_session",
  ]);
}

async function verifyStaleIdleCloseGuard(): Promise<void> {
  const calls: string[] = [];

  await runSessionIdleCloseFlow({
    event: {
      agentId: "alpha",
      sessionKey: "alpha:thread-verify",
      reason: "idle_eviction",
      lastActivityAt: "2026-02-18T20:45:00.000Z",
      closedAt: "2026-02-18T21:00:00.000Z",
    },
    memoryHook: null,
    closeSessionIfUnchanged: async () => {
      calls.push("guarded_close_attempted");
      return false;
    },
    log: (message) => {
      if (message.includes("stale_callback")) {
        calls.push("stale_logged");
      }
    },
  });

  assert.deepEqual(calls, ["guarded_close_attempted", "stale_logged"]);
}

async function main(): Promise<void> {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "gravity-cp7-verify-"));
  try {
    await verifySessionEndMemoryHook(tempRoot);
    await verifyIdleCloseFallback();
    await verifyStaleIdleCloseGuard();
    console.log(
      "verification passed (session_end_memory_hook=true, replay_exclusion=true, idle_close_fallback=true, stale_close_guard=true, no_reply_contract=true)",
    );
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`verification failed: ${message}`);
  process.exit(1);
});
