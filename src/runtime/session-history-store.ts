import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { SessionManager } from "@mariozechner/pi-coding-agent";
import type { UserMessage } from "@mariozechner/pi-ai";
import { resolvePathFromCwd } from "../resources/fs-utils.js";

const LOG_SYNC_CUSTOM_TYPE = "gravity.log_sync.v1";

export type SessionLogRole = "user" | "assistant" | "system";

export type SessionPaths = Readonly<{
  sessionDir: string;
  sessionLogPath: string;
  contextPath: string;
  agentLogPath: string;
}>;

export type AppendSessionLogInput = Readonly<{
  agentId: string;
  sessionKey: string;
  role: SessionLogRole;
  text: string;
  sourceEventId?: string | null;
  runId?: string | null;
  channelId?: string | null;
  threadTs?: string | null;
  messageTs?: string | null;
  userId?: string | null;
  timestamp?: Date;
  metadata?: Record<string, unknown>;
}>;

export type SyncSessionLogToContextInput = Readonly<{
  agentId: string;
  sessionKey: string;
  sessionManager: SessionManager;
  excludeSourceEventId?: string | null;
}>;

export type SessionHistoryStore = {
  resolvePaths: (agentId: string, sessionKey: string) => SessionPaths;
  ensureSessionScaffold: (agentId: string, sessionKey: string) => Promise<SessionPaths>;
  appendSessionLog: (input: AppendSessionLogInput) => Promise<boolean>;
  syncLogToSessionContext: (input: SyncSessionLogToContextInput) => Promise<number>;
  getLatestLoggedMessageTs: (
    agentId: string,
    sessionKey: string,
  ) => Promise<string | null>;
};

type StoredSessionLogRecord = Readonly<{
  timestamp: string;
  agentId: string;
  sessionKey: string;
  role: SessionLogRole;
  text: string;
  sourceEventId: string | null;
  runId: string | null;
  channelId: string | null;
  threadTs: string | null;
  messageTs: string | null;
  userId: string | null;
  metadata: Record<string, unknown>;
}>;

function normalizeRequiredPathSegment(value: string, label: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error(`${label} must be non-empty`);
  }
  if (trimmed.includes("/") || trimmed.includes("\\")) {
    throw new Error(`${label} must not contain path separators`);
  }
  return trimmed;
}

function normalizeOptionalString(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeMetadata(
  metadata: Record<string, unknown> | undefined,
): Record<string, unknown> {
  return metadata ?? {};
}

function toIsoTimestamp(value: Date | undefined): string {
  return (value ?? new Date()).toISOString();
}

function parseSessionLogRecords(content: string): StoredSessionLogRecord[] {
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => parseSessionLogRecord(line))
    .filter((record): record is StoredSessionLogRecord => record !== null);
}

function parseSessionLogRecord(line: string): StoredSessionLogRecord | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }

  const record = parsed as Record<string, unknown>;
  const role = record.role;
  if (role !== "user" && role !== "assistant" && role !== "system") {
    return null;
  }

  const text = typeof record.text === "string" ? record.text.trim() : "";
  if (text.length === 0) {
    return null;
  }

  const timestamp =
    typeof record.timestamp === "string" && record.timestamp.length > 0
      ? record.timestamp
      : new Date(0).toISOString();

  return {
    timestamp,
    agentId: typeof record.agentId === "string" ? record.agentId : "",
    sessionKey: typeof record.sessionKey === "string" ? record.sessionKey : "",
    role,
    text,
    sourceEventId: normalizeOptionalString(
      typeof record.sourceEventId === "string" ? record.sourceEventId : null,
    ),
    runId: normalizeOptionalString(typeof record.runId === "string" ? record.runId : null),
    channelId: normalizeOptionalString(
      typeof record.channelId === "string" ? record.channelId : null,
    ),
    threadTs: normalizeOptionalString(
      typeof record.threadTs === "string" ? record.threadTs : null,
    ),
    messageTs: normalizeOptionalString(
      typeof record.messageTs === "string" ? record.messageTs : null,
    ),
    userId: normalizeOptionalString(typeof record.userId === "string" ? record.userId : null),
    metadata:
      typeof record.metadata === "object" && record.metadata !== null
        ? (record.metadata as Record<string, unknown>)
        : {},
  };
}

function parseTimestampMs(timestamp: string): number {
  const parsed = new Date(timestamp).getTime();
  if (Number.isNaN(parsed)) {
    return Date.now();
  }
  return parsed;
}

function shouldSkipContextReplay(record: StoredSessionLogRecord): boolean {
  if (record.metadata.skipContextReplay === true) {
    return true;
  }
  const phase = record.metadata.phase;
  return phase === "memory_hook_input" || phase === "memory_hook_output";
}

function toContextMessageText(record: StoredSessionLogRecord): string {
  if (record.role === "system") {
    return `[system] ${record.text}`;
  }

  if (record.userId) {
    return `[user:${record.userId}] ${record.text}`;
  }

  return record.text;
}

function toUserMessage(record: StoredSessionLogRecord): UserMessage {
  return {
    role: "user",
    content: [{ type: "text", text: toContextMessageText(record) }],
    timestamp: parseTimestampMs(record.timestamp),
  };
}

function collectSyncedSourceEventIds(sessionManager: SessionManager): Set<string> {
  const sourceEventIds = new Set<string>();

  for (const entry of sessionManager.getEntries()) {
    if (entry.type !== "custom" || entry.customType !== LOG_SYNC_CUSTOM_TYPE) {
      continue;
    }

    const candidate =
      typeof entry.data === "object" &&
      entry.data !== null &&
      "sourceEventId" in entry.data
        ? (entry.data as { sourceEventId?: unknown }).sourceEventId
        : undefined;

    if (typeof candidate !== "string") {
      continue;
    }

    const normalized = candidate.trim();
    if (normalized.length > 0) {
      sourceEventIds.add(normalized);
    }
  }

  return sourceEventIds;
}

function buildSessionLogDedupeKey(input: {
  role: SessionLogRole;
  sourceEventId: string | null;
}): string | null {
  if (!input.sourceEventId) {
    return null;
  }

  return `${input.role}:${input.sourceEventId}`;
}

export function createSessionHistoryStore(input: {
  cwd: string;
  workspaceRoot: string;
}): SessionHistoryStore {
  const absoluteWorkspaceRoot = resolvePathFromCwd(input.cwd, input.workspaceRoot);
  const knownDedupeKeysByLogPath = new Map<string, Set<string>>();

  function resolvePaths(agentId: string, sessionKey: string): SessionPaths {
    const normalizedAgentId = normalizeRequiredPathSegment(agentId, "agentId");
    const normalizedSessionKey = normalizeRequiredPathSegment(sessionKey, "sessionKey");
    const sessionDir = path.join(
      absoluteWorkspaceRoot,
      normalizedAgentId,
      "sessions",
      normalizedSessionKey,
    );

    return {
      sessionDir,
      sessionLogPath: path.join(sessionDir, "log.jsonl"),
      contextPath: path.join(sessionDir, "context.jsonl"),
      agentLogPath: path.join(
        absoluteWorkspaceRoot,
        normalizedAgentId,
        "agent-log.jsonl",
      ),
    };
  }

  async function ensureSessionScaffold(
    agentId: string,
    sessionKey: string,
  ): Promise<SessionPaths> {
    const paths = resolvePaths(agentId, sessionKey);
    await mkdir(paths.sessionDir, { recursive: true });
    await mkdir(path.dirname(paths.agentLogPath), { recursive: true });
    await Promise.all([
      writeFile(paths.sessionLogPath, "", { flag: "a" }),
      writeFile(paths.contextPath, "", { flag: "a" }),
      writeFile(paths.agentLogPath, "", { flag: "a" }),
    ]);

    return paths;
  }

  async function appendSessionLog(inputLog: AppendSessionLogInput): Promise<boolean> {
    const normalizedText = inputLog.text.trim();
    if (normalizedText.length === 0) {
      return false;
    }

    const normalizedAgentId = normalizeRequiredPathSegment(inputLog.agentId, "agentId");
    const normalizedSessionKey = normalizeRequiredPathSegment(
      inputLog.sessionKey,
      "sessionKey",
    );
    const paths = await ensureSessionScaffold(
      normalizedAgentId,
      normalizedSessionKey,
    );
    const dedupeKey = buildSessionLogDedupeKey({
      role: inputLog.role,
      sourceEventId: normalizeOptionalString(inputLog.sourceEventId),
    });
    const normalizedSourceEventId = normalizeOptionalString(inputLog.sourceEventId);
    if (dedupeKey) {
      let knownDedupeKeys = knownDedupeKeysByLogPath.get(paths.sessionLogPath);
      if (!knownDedupeKeys) {
        const existingLogContent = await readFile(paths.sessionLogPath, "utf8");
        knownDedupeKeys = new Set(
          parseSessionLogRecords(existingLogContent)
            .map((record) =>
              buildSessionLogDedupeKey({
                role: record.role,
                sourceEventId: record.sourceEventId,
              }),
            )
            .filter((value): value is string => value !== null),
        );
        knownDedupeKeysByLogPath.set(paths.sessionLogPath, knownDedupeKeys);
      }

      if (knownDedupeKeys.has(dedupeKey)) {
        return false;
      }
      knownDedupeKeys.add(dedupeKey);
    }

    const record: StoredSessionLogRecord = {
      timestamp: toIsoTimestamp(inputLog.timestamp),
      agentId: normalizedAgentId,
      sessionKey: normalizedSessionKey,
      role: inputLog.role,
      text: normalizedText,
      sourceEventId: normalizedSourceEventId,
      runId: normalizeOptionalString(inputLog.runId),
      channelId: normalizeOptionalString(inputLog.channelId),
      threadTs: normalizeOptionalString(inputLog.threadTs),
      messageTs: normalizeOptionalString(inputLog.messageTs),
      userId: normalizeOptionalString(inputLog.userId),
      metadata: normalizeMetadata(inputLog.metadata),
    };

    const line = `${JSON.stringify(record)}\n`;
    await Promise.all([
      appendFile(paths.sessionLogPath, line, "utf8"),
      appendFile(paths.agentLogPath, line, "utf8"),
    ]);
    return true;
  }

  async function syncLogToSessionContext(
    inputSync: SyncSessionLogToContextInput,
  ): Promise<number> {
    const paths = await ensureSessionScaffold(inputSync.agentId, inputSync.sessionKey);

    const logContent = await readFile(paths.sessionLogPath, "utf8");
    const logEntries = parseSessionLogRecords(logContent);

    if (logEntries.length === 0) {
      return 0;
    }

    const excludedSourceEventId = normalizeOptionalString(inputSync.excludeSourceEventId);
    const syncedSourceEventIds = collectSyncedSourceEventIds(inputSync.sessionManager);
    const unsyncedForContext = logEntries
      .filter((record) => record.role === "user" || record.role === "system")
      .filter((record) => !shouldSkipContextReplay(record))
      .filter(
        (
          record,
        ): record is StoredSessionLogRecord & { sourceEventId: string } =>
          record.sourceEventId !== null,
      )
      .filter(
        (record) =>
          record.sourceEventId !== excludedSourceEventId &&
          !syncedSourceEventIds.has(record.sourceEventId),
      )
      .sort((a, b) => parseTimestampMs(a.timestamp) - parseTimestampMs(b.timestamp));

    for (const record of unsyncedForContext) {
      inputSync.sessionManager.appendMessage(toUserMessage(record));
      inputSync.sessionManager.appendCustomEntry(LOG_SYNC_CUSTOM_TYPE, {
        sourceEventId: record.sourceEventId,
        loggedAt: record.timestamp,
        role: record.role,
      });
    }

    return unsyncedForContext.length;
  }

  async function getLatestLoggedMessageTs(
    agentId: string,
    sessionKey: string,
  ): Promise<string | null> {
    const paths = await ensureSessionScaffold(agentId, sessionKey);
    const content = await readFile(paths.sessionLogPath, "utf8");
    const records = parseSessionLogRecords(content).reverse();

    for (const record of records) {
      if (record?.messageTs) {
        return record.messageTs;
      }
    }

    return null;
  }

  return {
    resolvePaths,
    ensureSessionScaffold,
    appendSessionLog,
    syncLogToSessionContext,
    getLatestLoggedMessageTs,
  };
}
