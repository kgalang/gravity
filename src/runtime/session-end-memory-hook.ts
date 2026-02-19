import type { Kysely } from "kysely";
import { gravitySchema, type GravityDatabase } from "./db.js";
import type { SessionIdleEvent } from "./session-idle-eviction.js";
import type { SessionHistoryStore } from "./session-history-store.js";

export type SessionEndMemoryHookResult = Readonly<
  | {
      status: "performed";
      sourceEventId: string;
      noReply: boolean;
    }
  | {
      status: "skipped";
      reason: "disabled" | "missing_api_key" | "missing_memory_path";
    }
>;

type SilentMemoryTurnResult = Readonly<{
  responseText: string;
  modelId: string;
}>;

type SessionEndMemoryHookInput = Readonly<{
  enabled: boolean;
  anthropicApiKey: string | null;
  sessionHistoryStore: SessionHistoryStore;
  loadAgentMemoryPath: (agentId: string) => Promise<string | null>;
  runSilentTurn: (input: {
    agentId: string;
    sessionKey: string;
    sourceEventId: string;
    prompt: string;
  }) => Promise<SilentMemoryTurnResult>;
  now?: () => Date;
  log?: (message: string) => void;
}>;

export type SessionEndMemoryHook = {
  run: (event: SessionIdleEvent) => Promise<SessionEndMemoryHookResult>;
};

function normalizeRequired(value: string, label: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error(`Session-end memory hook ${label} must be non-empty`);
  }
  return trimmed;
}

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function createSourceEventId(input: {
  agentId: string;
  sessionKey: string;
  closedAt: string;
  reason: string;
}): string {
  return [
    "session-end-memory",
    input.agentId,
    input.sessionKey,
    input.reason,
    input.closedAt,
  ].join(":");
}

function buildMemoryHookPrompt(input: {
  agentId: string;
  sessionKey: string;
  reason: SessionIdleEvent["reason"];
  memoryPath: string;
}): string {
  return [
    "This session is ending and will be closed after this silent memory hook turn.",
    `Agent: ${input.agentId}`,
    `Session key: ${input.sessionKey}`,
    `Close reason: ${input.reason}`,
    `Memory file: ${input.memoryPath}/MEMORY.md`,
    "",
    "Task:",
    "- Review the current conversation/session context and identify only durable learnings worth keeping.",
    "- If durable learnings exist, update MEMORY.md directly.",
    "- Keep edits concise, factual, and additive. Do not rewrite unrelated sections.",
    "- If there is nothing durable to save, leave MEMORY.md unchanged.",
    "",
    "Reply contract:",
    "- Always respond with exactly NO_REPLY.",
    "- Do not include any additional text.",
  ].join("\n");
}

export function createSessionEndMemoryHook(
  input: SessionEndMemoryHookInput,
): SessionEndMemoryHook {
  const now = input.now ?? (() => new Date());
  const log = input.log ?? ((message: string) => console.log(message));

  return {
    async run(event) {
      const agentId = normalizeRequired(event.agentId, "agentId");
      const sessionKey = normalizeRequired(event.sessionKey, "sessionKey");

      if (!input.enabled) {
        return {
          status: "skipped",
          reason: "disabled",
        };
      }

      if (!input.anthropicApiKey) {
        log(
          `[gravity][warning] session-end memory hook skipped (agentId=${agentId} sessionKey=${sessionKey} reason=missing_api_key)`,
        );
        return {
          status: "skipped",
          reason: "missing_api_key",
        };
      }

      const memoryPath = await input.loadAgentMemoryPath(agentId);
      if (!memoryPath) {
        log(
          `[gravity][warning] session-end memory hook skipped (agentId=${agentId} sessionKey=${sessionKey} reason=missing_memory_path)`,
        );
        return {
          status: "skipped",
          reason: "missing_memory_path",
        };
      }

      const sourceEventId = createSourceEventId({
        agentId,
        sessionKey,
        closedAt: event.closedAt,
        reason: event.reason,
      });
      const runId = sourceEventId;
      const prompt = buildMemoryHookPrompt({
        agentId,
        sessionKey,
        reason: event.reason,
        memoryPath,
      });

      await input.sessionHistoryStore.appendSessionLog({
        agentId,
        sessionKey,
        role: "system",
        text: prompt,
        sourceEventId,
        runId,
        metadata: {
          triggerKind: "system",
          surface: "system",
          entrypoint: "system",
          phase: "memory_hook_input",
          skipContextReplay: true,
          idleCloseReason: event.reason,
          idleClosedAt: event.closedAt,
          memoryPath,
        },
        timestamp: now(),
      });

      const turn = await input.runSilentTurn({
        agentId,
        sessionKey,
        sourceEventId,
        prompt,
      });

      const normalizedResponse = turn.responseText.trim();
      const noReply = normalizedResponse === "NO_REPLY";

      await input.sessionHistoryStore.appendSessionLog({
        agentId,
        sessionKey,
        role: "assistant",
        text: normalizedResponse.length > 0 ? normalizedResponse : "NO_REPLY",
        sourceEventId,
        runId,
        metadata: {
          triggerKind: "system",
          surface: "system",
          entrypoint: "system",
          phase: "memory_hook_output",
          skipContextReplay: true,
          idleCloseReason: event.reason,
          modelId: turn.modelId,
          noReply,
        },
        timestamp: now(),
      });

      if (!noReply) {
        log(
          `[gravity][warning] session-end memory hook response was not NO_REPLY (agentId=${agentId} sessionKey=${sessionKey})`,
        );
      }

      return {
        status: "performed",
        sourceEventId,
        noReply,
      };
    },
  };
}

export function createKyselyAgentMemoryPathLoader(
  db: Kysely<GravityDatabase>,
): (agentId: string) => Promise<string | null> {
  return async (agentId) => {
    const normalizedAgentId = normalizeRequired(agentId, "agentId");
    const row = await gravitySchema(db)
      .selectFrom("agents")
      .select(["memory_path"])
      .where("id", "=", normalizedAgentId)
      .where("status", "=", "active")
      .executeTakeFirst();

    if (!row?.memory_path) {
      return null;
    }

    const normalizedPath = row.memory_path.trim();
    return normalizedPath.length > 0 ? normalizedPath : null;
  };
}

export async function runSessionIdleCloseFlow(input: {
  event: SessionIdleEvent;
  memoryHook: SessionEndMemoryHook | null;
  closeSessionIfUnchanged: (input: {
    sessionKey: string;
    expectedLastActivityAt: Date;
    closedAt: Date;
  }) => Promise<boolean>;
  log?: (message: string) => void;
}): Promise<void> {
  const log = input.log ?? ((message: string) => console.warn(message));

  if (input.memoryHook) {
    try {
      await input.memoryHook.run(input.event);
    } catch (error) {
      log(
        `[gravity][warning] session-end memory hook failed (agentId=${input.event.agentId} sessionKey=${input.event.sessionKey} reason=${input.event.reason}): ${normalizeErrorMessage(error)}`,
      );
    }
  }

  const expectedLastActivityAt = new Date(input.event.lastActivityAt);
  const closedAt = new Date(input.event.closedAt);
  const closeApplied = await input.closeSessionIfUnchanged({
    sessionKey: input.event.sessionKey,
    expectedLastActivityAt,
    closedAt,
  });
  if (!closeApplied) {
    log(
      `[gravity][warning] session idle close skipped (agentId=${input.event.agentId} sessionKey=${input.event.sessionKey} reason=${input.event.reason}): stale_callback`,
    );
  }
}
