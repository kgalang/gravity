INSERT INTO gravity.agents (
  id,
  name,
  description,
  model,
  status,
  channel_id,
  skills_path,
  memory_path,
  config
) VALUES
  (
    'data-analyst',
    'Wiggs',
    'Data analyst proof-of-concept agent.',
    'claude-sonnet-4-5-20250929',
    'active',
    'C0AFKMMDV4J',
    NULL,
    'store/agents/data-analyst/memory',
    jsonb_build_object(
      'connector', 'duckdb',
      'duckdb_path', '/Users/kevingalang/code/jaffle_shop_duckdb/jaffle_shop.duckdb',
      'ingressBindings', jsonb_build_array(
        jsonb_build_object(
          'id', 'slack-wiggs-slash',
          'kind', 'message',
          'surface', 'slack',
          'entrypoint', 'slash_command',
          'match', jsonb_build_object('command', '/wiggs'),
          'sessionMode', 'thread',
          'enabled', true
        ),
        jsonb_build_object(
          'id', 'slack-wiggs-mention',
          'kind', 'message',
          'surface', 'slack',
          'entrypoint', 'app_mention',
          'sessionMode', 'thread',
          'enabled', true
        ),
        jsonb_build_object(
          'id', 'slack-wiggs-thread',
          'kind', 'message',
          'surface', 'slack',
          'entrypoint', 'thread_reply',
          'match', jsonb_build_object('threadOwnedByAgent', true),
          'sessionMode', 'thread',
          'enabled', true
        ),
        jsonb_build_object(
          'id', 'slack-wiggs-dm',
          'kind', 'message',
          'surface', 'slack',
          'entrypoint', 'direct_message',
          'sessionMode', 'main',
          'enabled', true
        )
      ),
      'deliveryDefaults', jsonb_build_object(
        'surface', 'slack',
        'mode', 'channel_thread',
        'channelId', 'C0AFKMMDV4J'
      ),
      'proactiveTriggers', jsonb_build_array(
        jsonb_build_object(
          'id', 'daily-metrics',
          'kind', 'cron',
          'schedule', '0 9 * * *',
          'sessionMode', 'isolated',
          'prompt', 'Run the daily metrics check and summarize notable changes.',
          'delivery', jsonb_build_object(
            'surface', 'slack',
            'mode', 'channel_thread',
            'channelId', 'C0AFKMMDV4J'
          ),
          'enabled', false
        ),
        jsonb_build_object(
          'id', 'founder-heartbeat',
          'kind', 'heartbeat',
          'intervalSeconds', 1800,
          'sessionMode', 'main',
          'prompt', 'Check for anomalies and notify if action is needed.',
          'delivery', jsonb_build_object(
            'surface', 'slack',
            'mode', 'dm',
            'userId', 'U123456'
          ),
          'enabled', false
        )
      )
    )
  ),
  (
    'compliance-helper',
    'Compliance Helper',
    'Compliance review proof-of-concept agent.',
    'claude-sonnet-4-5-20250929',
    'active',
    'C0AFYK6AVQR',
    NULL,
    'store/agents/compliance-helper/memory',
    jsonb_build_object(
      'connector', 'knowledge-docs',
      'ingressBindings', jsonb_build_array(
        jsonb_build_object(
          'id', 'slack-compliance-slash',
          'kind', 'message',
          'surface', 'slack',
          'entrypoint', 'slash_command',
          'match', jsonb_build_object('command', '/compliance'),
          'sessionMode', 'thread',
          'enabled', true
        ),
        jsonb_build_object(
          'id', 'slack-compliance-mention',
          'kind', 'message',
          'surface', 'slack',
          'entrypoint', 'app_mention',
          'sessionMode', 'thread',
          'enabled', true
        ),
        jsonb_build_object(
          'id', 'slack-compliance-thread',
          'kind', 'message',
          'surface', 'slack',
          'entrypoint', 'thread_reply',
          'match', jsonb_build_object('threadOwnedByAgent', true),
          'sessionMode', 'thread',
          'enabled', true
        ),
        jsonb_build_object(
          'id', 'slack-compliance-dm',
          'kind', 'message',
          'surface', 'slack',
          'entrypoint', 'direct_message',
          'sessionMode', 'main',
          'enabled', true
        )
      ),
      'deliveryDefaults', jsonb_build_object(
        'surface', 'slack',
        'mode', 'channel_thread',
        'channelId', 'C0AFYK6AVQR'
      ),
      'proactiveTriggers', jsonb_build_array()
    )
  )
ON CONFLICT (id)
DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  model = EXCLUDED.model,
  status = EXCLUDED.status,
  channel_id = EXCLUDED.channel_id,
  skills_path = EXCLUDED.skills_path,
  memory_path = EXCLUDED.memory_path,
  config = EXCLUDED.config,
  updated_at = now();
