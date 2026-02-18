import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SessionManager } from "@mariozechner/pi-coding-agent";
import { createSessionHistoryStore } from "../../src/runtime/session-history-store.js";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map(async (tempRoot) => {
      await rm(tempRoot, { recursive: true, force: true });
    }),
  );
});

async function createTempRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), prefix));
  tempRoots.push(root);
  return root;
}

describe("createSessionHistoryStore", () => {
  it("creates dual-history scaffolding and appends session + agent logs", async () => {
    const tempRoot = await createTempRoot("gravity-session-history-");
    const store = createSessionHistoryStore({
      cwd: tempRoot,
      workspaceRoot: "workspace",
    });

    const paths = await store.ensureSessionScaffold("data-analyst", "data-analyst:thread-1");
    await store.appendSessionLog({
      agentId: "data-analyst",
      sessionKey: "data-analyst:thread-1",
      role: "user",
      text: "How many active customers do we have?",
      sourceEventId: "event-1",
      messageTs: "1700000000.100",
      userId: "U123",
    });
    await store.appendSessionLog({
      agentId: "data-analyst",
      sessionKey: "data-analyst:thread-1",
      role: "assistant",
      text: "We have 42 active customers.",
      sourceEventId: "event-1",
      messageTs: "1700000000.200",
      userId: "UBOT",
    });

    const sessionLogContent = await readFile(paths.sessionLogPath, "utf8");
    const agentLogContent = await readFile(paths.agentLogPath, "utf8");

    expect(sessionLogContent).toContain("How many active customers");
    expect(sessionLogContent).toContain("We have 42 active customers");
    expect(agentLogContent).toContain("How many active customers");
    expect(agentLogContent).toContain("We have 42 active customers");

    await store.appendSessionLog({
      agentId: "data-analyst",
      sessionKey: "data-analyst:thread-1",
      role: "user",
      text: "How many active customers do we have?",
      sourceEventId: "event-1",
      messageTs: "1700000000.100",
      userId: "U123",
    });
    await store.appendSessionLog({
      agentId: "data-analyst",
      sessionKey: "data-analyst:thread-1",
      role: "assistant",
      text: "We have 42 active customers.",
      sourceEventId: "event-1",
      messageTs: "1700000000.200",
      userId: "UBOT",
    });

    const dedupedSessionLog = await readFile(paths.sessionLogPath, "utf8");
    const lineCount = dedupedSessionLog.trim().split("\n").filter(Boolean).length;
    expect(lineCount).toBe(2);
  });

  it("syncs unsynced user/system log entries into context with source-event dedupe", async () => {
    const tempRoot = await createTempRoot("gravity-session-sync-");
    const store = createSessionHistoryStore({
      cwd: tempRoot,
      workspaceRoot: "workspace",
    });

    await store.appendSessionLog({
      agentId: "data-analyst",
      sessionKey: "data-analyst:thread-2",
      role: "user",
      text: "first user message",
      sourceEventId: "event-user-1",
      messageTs: "1700000001.100",
      userId: "U111",
    });
    await store.appendSessionLog({
      agentId: "data-analyst",
      sessionKey: "data-analyst:thread-2",
      role: "assistant",
      text: "assistant reply",
      sourceEventId: "event-assistant-1",
      messageTs: "1700000001.200",
      userId: "UBOT",
    });
    await store.appendSessionLog({
      agentId: "data-analyst",
      sessionKey: "data-analyst:thread-2",
      role: "system",
      text: "scheduled health check",
      sourceEventId: "event-system-1",
      messageTs: "1700000001.300",
    });

    const paths = await store.ensureSessionScaffold("data-analyst", "data-analyst:thread-2");
    const sessionManager = SessionManager.open(paths.contextPath, paths.sessionDir);

    const synced = await store.syncLogToSessionContext({
      agentId: "data-analyst",
      sessionKey: "data-analyst:thread-2",
      sessionManager,
      excludeSourceEventId: "event-user-1",
    });

    expect(synced).toBe(1);

    const context = sessionManager.buildSessionContext();
    expect(context.messages).toHaveLength(1);
    expect(JSON.stringify(context.messages[0])).toContain("[system] scheduled health check");

    const secondSync = await store.syncLogToSessionContext({
      agentId: "data-analyst",
      sessionKey: "data-analyst:thread-2",
      sessionManager,
      excludeSourceEventId: null,
    });
    expect(secondSync).toBe(1);

    const thirdSync = await store.syncLogToSessionContext({
      agentId: "data-analyst",
      sessionKey: "data-analyst:thread-2",
      sessionManager,
      excludeSourceEventId: null,
    });
    expect(thirdSync).toBe(0);

    const latestMessageTs = await store.getLatestLoggedMessageTs(
      "data-analyst",
      "data-analyst:thread-2",
    );
    expect(latestMessageTs).toBe("1700000001.300");
  });
});
