CREATE SCHEMA IF NOT EXISTS gravity;

CREATE TABLE IF NOT EXISTS gravity.agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  model TEXT NOT NULL DEFAULT 'claude-sonnet-4-5-20250929',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'archived')),
  channel_id TEXT,
  skills_path TEXT,
  memory_path TEXT,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gravity.sessions (
  session_key TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES gravity.agents(id) ON DELETE RESTRICT,
  mode TEXT NOT NULL CHECK (mode IN ('thread', 'main', 'isolated')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed')),
  surface TEXT CHECK (surface IN ('slack', 'system')),
  channel_id TEXT,
  thread_ts TEXT,
  owner_user_id TEXT,
  opened_by_trigger TEXT NOT NULL CHECK (opened_by_trigger IN ('message', 'cron', 'heartbeat', 'system')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  CHECK (closed_at IS NULL OR closed_at >= created_at)
);

CREATE TABLE IF NOT EXISTS gravity.runs (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES gravity.agents(id) ON DELETE RESTRICT,
  session_key TEXT NOT NULL,
  thread_ts TEXT,
  trigger_kind TEXT NOT NULL DEFAULT 'message' CHECK (trigger_kind IN ('message', 'cron', 'heartbeat', 'system')),
  surface TEXT NOT NULL DEFAULT 'slack' CHECK (surface IN ('slack', 'system')),
  entrypoint TEXT NOT NULL DEFAULT 'slash_command' CHECK (entrypoint IN ('slash_command', 'app_mention', 'thread_reply', 'direct_message', 'cron', 'heartbeat', 'system')),
  source_event_id TEXT,
  channel_id TEXT,
  user_id TEXT,
  user_name TEXT,
  query TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),
  result_summary TEXT,
  error_message TEXT,
  policy_decisions JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  tokens_used INT CHECK (tokens_used IS NULL OR tokens_used >= 0),
  cost_estimate DECIMAL(10,4) CHECK (cost_estimate IS NULL OR cost_estimate >= 0),
  CHECK (completed_at IS NULL OR completed_at >= started_at)
);

CREATE TABLE IF NOT EXISTS gravity.skill_versions (
  id BIGSERIAL PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES gravity.agents(id) ON DELETE RESTRICT,
  skill_name TEXT NOT NULL,
  version INT NOT NULL CHECK (version > 0),
  changed_by TEXT NOT NULL DEFAULT 'system',
  change_summary TEXT,
  file_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (agent_id, skill_name, version)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_active_channel_unique
  ON gravity.agents(channel_id)
  WHERE channel_id IS NOT NULL AND status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS idx_runs_source_event_unique
  ON gravity.runs(source_event_id)
  WHERE source_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_runs_agent_started
  ON gravity.runs(agent_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_runs_session_started
  ON gravity.runs(session_key, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_skill_versions_agent_created
  ON gravity.skill_versions(agent_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sessions_agent_last_activity
  ON gravity.sessions(agent_id, last_activity_at DESC);

CREATE INDEX IF NOT EXISTS idx_sessions_status_last_activity
  ON gravity.sessions(status, last_activity_at DESC);

CREATE OR REPLACE FUNCTION gravity.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agents_set_updated_at ON gravity.agents;
CREATE TRIGGER trg_agents_set_updated_at
  BEFORE UPDATE ON gravity.agents
  FOR EACH ROW
  EXECUTE FUNCTION gravity.set_updated_at();
