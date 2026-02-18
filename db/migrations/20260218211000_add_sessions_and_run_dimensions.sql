-- migrate:up
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

ALTER TABLE gravity.runs
  ADD COLUMN IF NOT EXISTS trigger_kind TEXT,
  ADD COLUMN IF NOT EXISTS surface TEXT,
  ADD COLUMN IF NOT EXISTS entrypoint TEXT;

UPDATE gravity.runs
SET
  trigger_kind = CASE source
    WHEN 'cron' THEN 'cron'
    WHEN 'heartbeat' THEN 'heartbeat'
    WHEN 'system' THEN 'system'
    ELSE 'message'
  END,
  surface = CASE source
    WHEN 'slack' THEN 'slack'
    ELSE 'system'
  END,
  entrypoint = CASE source
    WHEN 'cron' THEN 'cron'
    WHEN 'heartbeat' THEN 'heartbeat'
    WHEN 'system' THEN 'system'
    ELSE 'slash_command'
  END
WHERE trigger_kind IS NULL OR surface IS NULL OR entrypoint IS NULL;

ALTER TABLE gravity.runs
  ALTER COLUMN trigger_kind SET DEFAULT 'message',
  ALTER COLUMN surface SET DEFAULT 'slack',
  ALTER COLUMN entrypoint SET DEFAULT 'slash_command',
  ALTER COLUMN trigger_kind SET NOT NULL,
  ALTER COLUMN surface SET NOT NULL,
  ALTER COLUMN entrypoint SET NOT NULL;

ALTER TABLE gravity.runs
  ADD CONSTRAINT runs_trigger_kind_check
    CHECK (trigger_kind IN ('message', 'cron', 'heartbeat', 'system')),
  ADD CONSTRAINT runs_surface_check
    CHECK (surface IN ('slack', 'system')),
  ADD CONSTRAINT runs_entrypoint_check
    CHECK (entrypoint IN ('slash_command', 'app_mention', 'thread_reply', 'direct_message', 'cron', 'heartbeat', 'system'));

ALTER TABLE gravity.runs
  DROP COLUMN IF EXISTS source;

CREATE INDEX IF NOT EXISTS idx_sessions_agent_last_activity
  ON gravity.sessions(agent_id, last_activity_at DESC);

CREATE INDEX IF NOT EXISTS idx_sessions_status_last_activity
  ON gravity.sessions(status, last_activity_at DESC);

-- migrate:down
ALTER TABLE gravity.runs
  ADD COLUMN IF NOT EXISTS source TEXT;

UPDATE gravity.runs
SET source = CASE
  WHEN trigger_kind = 'cron' THEN 'cron'
  WHEN trigger_kind = 'heartbeat' THEN 'heartbeat'
  WHEN trigger_kind = 'system' THEN 'system'
  WHEN surface = 'slack' THEN 'slack'
  ELSE 'system'
END
WHERE source IS NULL;

ALTER TABLE gravity.runs
  ALTER COLUMN source SET DEFAULT 'slack',
  ALTER COLUMN source SET NOT NULL;

ALTER TABLE gravity.runs
  ADD CONSTRAINT runs_source_check
    CHECK (source IN ('slack', 'cron', 'heartbeat', 'system'));

ALTER TABLE gravity.runs
  DROP CONSTRAINT IF EXISTS runs_trigger_kind_check,
  DROP CONSTRAINT IF EXISTS runs_surface_check,
  DROP CONSTRAINT IF EXISTS runs_entrypoint_check;

ALTER TABLE gravity.runs
  DROP COLUMN IF EXISTS trigger_kind,
  DROP COLUMN IF EXISTS surface,
  DROP COLUMN IF EXISTS entrypoint;

DROP INDEX IF EXISTS gravity.idx_sessions_agent_last_activity;
DROP INDEX IF EXISTS gravity.idx_sessions_status_last_activity;

DROP TABLE IF EXISTS gravity.sessions;
