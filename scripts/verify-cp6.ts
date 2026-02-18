import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { SessionManager } from "@mariozechner/pi-coding-agent";
import { compileAgentCapabilities } from "../agents/capability-compiler.js";
import { assembleTurnContext } from "../src/runtime/context-assembler.js";
import { createSessionHistoryStore } from "../src/runtime/session-history-store.js";
import { createSessionIdleEvictionCoordinator } from "../src/runtime/session-idle-eviction.js";
import { promptWithOverflowRecovery } from "../src/runtime/session-overflow-recovery.js";
import { createSessionStartupBackfill } from "../src/runtime/session-startup-backfill.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function verifyDualHistoryAndPreRunSync(tempRoot: string): Promise<void> {
  const historyStore = createSessionHistoryStore({
    cwd: tempRoot,
    workspaceRoot: "workspace",
  });

  await historyStore.appendSessionLog({
    agentId: "data-analyst",
    sessionKey: "data-analyst:thread-verify",
    role: "user",
    text: "What changed this week?",
    sourceEventId: "verify-event-1",
    messageTs: "1700000000.100",
    userId: "U111",
  });
  await historyStore.appendSessionLog({
    agentId: "data-analyst",
    sessionKey: "data-analyst:thread-verify",
    role: "system",
    text: "scheduled check",
    sourceEventId: "verify-event-2",
    messageTs: "1700000000.200",
  });

  const paths = await historyStore.ensureSessionScaffold(
    "data-analyst",
    "data-analyst:thread-verify",
  );
  const sessionManager = SessionManager.open(paths.contextPath, paths.sessionDir);

  const firstSync = await historyStore.syncLogToSessionContext({
    agentId: "data-analyst",
    sessionKey: "data-analyst:thread-verify",
    sessionManager,
    excludeSourceEventId: "verify-event-1",
  });
  assert.equal(firstSync, 1, "first sync should append one system message");

  const secondSync = await historyStore.syncLogToSessionContext({
    agentId: "data-analyst",
    sessionKey: "data-analyst:thread-verify",
    sessionManager,
    excludeSourceEventId: null,
  });
  assert.equal(secondSync, 1, "second sync should append the previously excluded user message");

  const context = sessionManager.buildSessionContext();
  assert.equal(context.messages.length, 2, "context should contain synced messages");

  const logLines = (await readFile(paths.sessionLogPath, "utf8"))
    .trim()
    .split("\n")
    .filter(Boolean);
  assert.equal(logLines.length, 2, "session log should remain append-only with two entries");

  const backfill = createSessionStartupBackfill({
    enabled: true,
    historyStore,
    repository: {
      async listActiveSlackThreadSessions() {
        return [
          {
            agentId: "data-analyst",
            sessionKey: "data-analyst:thread-verify",
            channelId: "C123",
            threadTs: "1700000000.000",
          },
        ];
      },
    },
    source: {
      async fetchThreadMessages(input) {
        assert.equal(input.oldestMessageTs, "1700000000.200");
        return [
          {
            sourceEventId: "verify-backfill-1",
            messageTs: "1700000000.300",
            userId: "U222",
            text: "backfilled follow-up",
            isBot: false,
          },
        ];
      },
    },
  });

  const reconcileResult = await backfill.reconcile();
  assert.equal(reconcileResult.sessionsScanned, 1);
  assert.equal(reconcileResult.messagesAppended, 1);

  const updatedLogLines = (await readFile(paths.sessionLogPath, "utf8"))
    .trim()
    .split("\n")
    .filter(Boolean);
  assert.equal(updatedLogLines.length, 3, "startup backfill should append thread history");
}

async function verifyMemoryReload(tempRoot: string): Promise<void> {
  const sharedSkillsDir = path.join(tempRoot, "store", "shared", "skills");
  const memoryDir = path.join(tempRoot, "store", "agents", "alpha", "memory");

  await mkdir(sharedSkillsDir, { recursive: true });
  await mkdir(memoryDir, { recursive: true });
  await writeFile(path.join(sharedSkillsDir, "query-gravity.md"), "Shared skill", "utf8");
  await writeFile(path.join(memoryDir, "MEMORY.md"), "Memory version A", "utf8");

  const capabilityProfile = compileAgentCapabilities({
    resources: [],
    useCapabilities: [
      {
        capability: "query-gravity-v1",
        bindResources: {},
      },
    ],
  });

  const first = await assembleTurnContext({
    cwd: tempRoot,
    sharedRoot: "store/shared",
    prompt: "first",
    agent: {
      id: "alpha",
      name: "Alpha",
      description: null,
      capabilityProfile,
      memoryPath: "store/agents/alpha/memory",
    },
  });
  assert.match(first.systemPrompt, /Memory version A/);

  await writeFile(path.join(memoryDir, "MEMORY.md"), "Memory version B", "utf8");

  const second = await assembleTurnContext({
    cwd: tempRoot,
    sharedRoot: "store/shared",
    prompt: "second",
    agent: {
      id: "alpha",
      name: "Alpha",
      description: null,
      capabilityProfile,
      memoryPath: "store/agents/alpha/memory",
    },
  });
  assert.match(second.systemPrompt, /Memory version B/);
  assert.ok(!second.systemPrompt.includes("Memory version A"));
}

async function verifyOverflowRecovery(): Promise<void> {
  const calls: string[] = [];
  let attempts = 0;

  const result = await promptWithOverflowRecovery({
    enabled: true,
    prompt: "hello",
    session: {
      async prompt(_text: string) {
        attempts += 1;
        calls.push(`prompt:${attempts}`);
        if (attempts === 1) {
          throw new Error("maximum context length exceeded");
        }
      },
      async compact() {
        calls.push("compact");
      },
    },
  });

  assert.equal(result.recoveredFromOverflow, true);
  assert.deepEqual(calls, ["prompt:1", "compact", "prompt:2"]);
}

async function verifyIdleEvictionScaffold(): Promise<void> {
  const events: string[] = [];
  const coordinator = createSessionIdleEvictionCoordinator({
    enabled: true,
    idleTimeoutMs: 20,
    onSessionIdle: async (event) => {
      events.push(`${event.reason}:${event.sessionKey}`);
    },
  });

  coordinator.recordActivity({
    agentId: "data-analyst",
    sessionKey: "data-analyst:thread-verify",
  });

  await sleep(40);
  assert.deepEqual(events, ["idle_eviction:data-analyst:thread-verify"]);

  await coordinator.shutdown();
}

async function main(): Promise<void> {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "gravity-cp6-verify-"));

  try {
    await verifyDualHistoryAndPreRunSync(tempRoot);
    await verifyMemoryReload(tempRoot);
    await verifyOverflowRecovery();
    await verifyIdleEvictionScaffold();

    console.log(
      "verification passed (dual_history=true, pre_run_sync=true, memory_reload=true, overflow_recovery=true, idle_hook_scaffold=true)",
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
