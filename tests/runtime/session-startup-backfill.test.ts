import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createSessionStartupBackfill,
  type SlackThreadBackfillRepository,
  type SlackThreadHistorySource,
} from "../../src/runtime/session-startup-backfill.js";
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

describe("createSessionStartupBackfill", () => {
  it("skips when disabled", async () => {
    const tempRoot = await createTempRoot("gravity-backfill-disabled-");
    const repository: SlackThreadBackfillRepository = {
      async listActiveSlackThreadSessions() {
        return [];
      },
    };

    const result = await createSessionStartupBackfill({
      enabled: false,
      repository,
      source: null,
      historyStore: createSessionHistoryStore({
        cwd: tempRoot,
        workspaceRoot: "workspace",
      }),
    }).reconcile();

    expect(result).toEqual({
      sessionsScanned: 0,
      messagesAppended: 0,
    });
  });

  it("appends backfilled thread history into session logs", async () => {
    const tempRoot = await createTempRoot("gravity-backfill-");
    const historyStore = createSessionHistoryStore({
      cwd: tempRoot,
      workspaceRoot: "workspace",
    });

    await historyStore.appendSessionLog({
      agentId: "data-analyst",
      sessionKey: "data-analyst:thread-1",
      role: "user",
      text: "existing",
      sourceEventId: "existing-event",
      messageTs: "1700000000.100",
      userId: "U111",
    });

    const repository: SlackThreadBackfillRepository = {
      async listActiveSlackThreadSessions() {
        return [
          {
            agentId: "data-analyst",
            sessionKey: "data-analyst:thread-1",
            channelId: "C123",
            threadTs: "1700000000.000",
          },
        ];
      },
    };

    let capturedOldestTs: string | null | undefined;
    const source: SlackThreadHistorySource = {
      async fetchThreadMessages(input) {
        capturedOldestTs = input.oldestMessageTs;
        return [
          {
            sourceEventId: "backfill-1",
            messageTs: "1700000000.200",
            userId: "U222",
            text: "new one",
            isBot: false,
          },
          {
            sourceEventId: "backfill-2",
            messageTs: "1700000000.300",
            userId: "UBOT",
            text: "bot response",
            isBot: true,
          },
        ];
      },
    };

    const backfill = createSessionStartupBackfill({
      enabled: true,
      repository,
      source,
      historyStore,
    });

    const result = await backfill.reconcile();

    expect(capturedOldestTs).toBe("1700000000.100");
    expect(result).toEqual({
      sessionsScanned: 1,
      messagesAppended: 2,
    });

    const paths = historyStore.resolvePaths("data-analyst", "data-analyst:thread-1");
    const lines = (await readFile(paths.sessionLogPath, "utf8"))
      .trim()
      .split("\n")
      .filter(Boolean);
    expect(lines).toHaveLength(3);
    expect(lines.at(-2)).toContain("new one");
    expect(lines.at(-1)).toContain("bot response");
  });

  it("counts only newly appended backfill messages when dedupe skips repeats", async () => {
    const tempRoot = await createTempRoot("gravity-backfill-dedupe-");
    const historyStore = createSessionHistoryStore({
      cwd: tempRoot,
      workspaceRoot: "workspace",
    });

    await historyStore.appendSessionLog({
      agentId: "data-analyst",
      sessionKey: "data-analyst:thread-1",
      role: "user",
      text: "existing",
      sourceEventId: "existing-event",
      messageTs: "1700000000.100",
      userId: "U111",
    });

    const repository: SlackThreadBackfillRepository = {
      async listActiveSlackThreadSessions() {
        return [
          {
            agentId: "data-analyst",
            sessionKey: "data-analyst:thread-1",
            channelId: "C123",
            threadTs: "1700000000.000",
          },
        ];
      },
    };

    const source: SlackThreadHistorySource = {
      async fetchThreadMessages() {
        return [
          {
            sourceEventId: "existing-event",
            messageTs: "1700000000.200",
            userId: "U111",
            text: "duplicate",
            isBot: false,
          },
          {
            sourceEventId: "new-event",
            messageTs: "1700000000.300",
            userId: "U222",
            text: "new message",
            isBot: false,
          },
        ];
      },
    };

    const result = await createSessionStartupBackfill({
      enabled: true,
      repository,
      source,
      historyStore,
    }).reconcile();

    expect(result).toEqual({
      sessionsScanned: 1,
      messagesAppended: 1,
    });
  });

  it("uses latest assistant message ts as oldest cursor for backfill", async () => {
    const tempRoot = await createTempRoot("gravity-backfill-assistant-cursor-");
    const historyStore = createSessionHistoryStore({
      cwd: tempRoot,
      workspaceRoot: "workspace",
    });

    await historyStore.appendSessionLog({
      agentId: "data-analyst",
      sessionKey: "data-analyst:thread-1",
      role: "user",
      text: "user prompt",
      sourceEventId: "event-1",
      messageTs: "1700000000.100",
      userId: "U111",
    });
    await historyStore.appendSessionLog({
      agentId: "data-analyst",
      sessionKey: "data-analyst:thread-1",
      role: "assistant",
      text: "assistant reply",
      sourceEventId: "event-1",
      messageTs: "1700000000.200",
      userId: "UBOT",
    });

    const repository: SlackThreadBackfillRepository = {
      async listActiveSlackThreadSessions() {
        return [
          {
            agentId: "data-analyst",
            sessionKey: "data-analyst:thread-1",
            channelId: "C123",
            threadTs: "1700000000.000",
          },
        ];
      },
    };

    let capturedOldestTs: string | null | undefined;
    const source: SlackThreadHistorySource = {
      async fetchThreadMessages(input) {
        capturedOldestTs = input.oldestMessageTs;
        return [];
      },
    };

    const result = await createSessionStartupBackfill({
      enabled: true,
      repository,
      source,
      historyStore,
    }).reconcile();

    expect(capturedOldestTs).toBe("1700000000.200");
    expect(result).toEqual({
      sessionsScanned: 1,
      messagesAppended: 0,
    });
  });
});
