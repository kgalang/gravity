import pg from "pg";
import { Generated, Kysely, PostgresDialect } from "kysely";

const { Pool, types } = pg;
const { INT8 } = types.builtins;

let pgTypeParsersConfigured = false;

function configurePgTypeParsers(): void {
  if (pgTypeParsersConfigured) {
    return;
  }

  types.setTypeParser(INT8, (value) => BigInt(value));
  pgTypeParsersConfigured = true;
}

type AgentStatus = "active" | "paused" | "archived";
type SessionMode = "thread" | "main" | "isolated";
type SessionStatus = "active" | "closed";
type SessionSurface = "slack" | "system";
type RunTriggerKind = "message" | "cron" | "heartbeat" | "system";
type RunSurface = "slack" | "system";
type RunEntrypoint =
  | "slash_command"
  | "app_mention"
  | "thread_reply"
  | "direct_message"
  | "cron"
  | "heartbeat"
  | "system";
type RunStatus = "running" | "completed" | "failed" | "cancelled";

type AgentsTable = {
  id: string;
  name: string;
  description: string | null;
  model: string;
  status: AgentStatus;
  channel_id: string | null;
  skills_path: string | null;
  memory_path: string | null;
  config: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
};

type SessionsTable = {
  session_key: string;
  agent_id: string;
  mode: SessionMode;
  status: SessionStatus;
  surface: SessionSurface | null;
  channel_id: string | null;
  thread_ts: string | null;
  owner_user_id: string | null;
  opened_by_trigger: RunTriggerKind;
  created_at: Date;
  last_activity_at: Date;
  closed_at: Date | null;
};

type RunsTable = {
  id: string;
  agent_id: string;
  session_key: string;
  thread_ts: string | null;
  trigger_kind: RunTriggerKind;
  surface: RunSurface;
  entrypoint: RunEntrypoint;
  source_event_id: string | null;
  channel_id: string | null;
  user_id: string | null;
  user_name: string | null;
  query: string;
  status: RunStatus;
  result_summary: string | null;
  error_message: string | null;
  policy_decisions: Record<string, unknown>;
  started_at: Date;
  completed_at: Date | null;
  tokens_used: number | null;
  cost_estimate: string | null;
};

type SkillVersionsTable = {
  id: Generated<bigint>;
  agent_id: string;
  skill_name: string;
  version: number;
  changed_by: string;
  change_summary: string | null;
  file_hash: string | null;
  created_at: Date;
};

export type GravityDatabase = {
  agents: AgentsTable;
  sessions: SessionsTable;
  runs: RunsTable;
  skill_versions: SkillVersionsTable;
};

export function createDb(databaseUrl: string): Kysely<GravityDatabase> {
  configurePgTypeParsers();
  return new Kysely<GravityDatabase>({
    dialect: new PostgresDialect({
      pool: new Pool({
        connectionString: databaseUrl,
      }),
    }),
  });
}

export async function destroyDb(db: Kysely<GravityDatabase>): Promise<void> {
  await db.destroy();
}

export function gravitySchema(
  db: Kysely<GravityDatabase>,
): Kysely<GravityDatabase> {
  return db.withSchema("gravity");
}
