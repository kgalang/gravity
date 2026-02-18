import type { Kysely } from "kysely";
import { type GravityDatabase, gravitySchema } from "./db.js";
import type { SessionHistoryStore } from "./session-history-store.js";
import type { SlackThreadHistoryMessage } from "./slack-thread-history.js";

export type ActiveSlackThreadSession = Readonly<{
  agentId: string;
  sessionKey: string;
  channelId: string;
  threadTs: string;
}>;

export type SlackThreadBackfillRepository = {
  listActiveSlackThreadSessions: () => Promise<ReadonlyArray<ActiveSlackThreadSession>>;
};

export type SlackThreadHistorySource = {
  fetchThreadMessages: (input: {
    channelId: string;
    threadTs: string;
    oldestMessageTs?: string | null;
  }) => Promise<ReadonlyArray<SlackThreadHistoryMessage>>;
};

export type SessionStartupBackfill = {
  reconcile: () => Promise<{
    sessionsScanned: number;
    messagesAppended: number;
  }>;
};

export function createKyselySlackThreadBackfillRepository(
  db: Kysely<GravityDatabase>,
): SlackThreadBackfillRepository {
  return {
    async listActiveSlackThreadSessions() {
      const rows = await gravitySchema(db)
        .selectFrom("sessions")
        .select(["agent_id", "session_key", "channel_id", "thread_ts"])
        .where("status", "=", "active")
        .where("surface", "=", "slack")
        .where("channel_id", "is not", null)
        .where("thread_ts", "is not", null)
        .execute();

      return rows.map((row) => ({
        agentId: row.agent_id,
        sessionKey: row.session_key,
        channelId: row.channel_id as string,
        threadTs: row.thread_ts as string,
      }));
    },
  };
}

export function createSessionStartupBackfill(input: {
  enabled: boolean;
  repository: SlackThreadBackfillRepository;
  source: SlackThreadHistorySource | null;
  historyStore: SessionHistoryStore;
  log?: (line: string) => void;
}): SessionStartupBackfill {
  const log = input.log ?? console.log;

  return {
    async reconcile() {
      if (!input.enabled) {
        return {
          sessionsScanned: 0,
          messagesAppended: 0,
        };
      }

      if (!input.source) {
        log("[gravity] session startup backfill skipped (no backfill source)");
        return {
          sessionsScanned: 0,
          messagesAppended: 0,
        };
      }

      const sessions = await input.repository.listActiveSlackThreadSessions();
      let messagesAppended = 0;

      for (const session of sessions) {
        const oldestMessageTs = await input.historyStore.getLatestLoggedMessageTs(
          session.agentId,
          session.sessionKey,
        );

        const messages = await input.source.fetchThreadMessages({
          channelId: session.channelId,
          threadTs: session.threadTs,
          oldestMessageTs,
        });

        for (const message of messages) {
          const appended = await input.historyStore.appendSessionLog({
            agentId: session.agentId,
            sessionKey: session.sessionKey,
            role: message.isBot ? "assistant" : "user",
            text: message.text,
            sourceEventId: message.sourceEventId,
            channelId: session.channelId,
            threadTs: session.threadTs,
            messageTs: message.messageTs,
            userId: message.userId,
            metadata: {
              backfilled: true,
              startupBackfill: true,
            },
          });
          if (appended) {
            messagesAppended += 1;
          }
        }
      }

      return {
        sessionsScanned: sessions.length,
        messagesAppended,
      };
    },
  };
}
