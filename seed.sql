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
    'C_WIGGS',
    'store/agents/data-analyst/skills',
    'store/agents/data-analyst/memory',
    jsonb_build_object(
      'connector', 'duckdb',
      'duckdb_path', '/Users/kevingalang/code/jaffle_shop_duckdb/jaffle_shop.duckdb'
    )
  ),
  (
    'compliance-helper',
    'Compliance Helper',
    'Compliance review proof-of-concept agent.',
    'claude-sonnet-4-5-20250929',
    'active',
    'C_COMPLIANCE',
    'store/agents/compliance-helper/skills',
    'store/agents/compliance-helper/memory',
    jsonb_build_object('connector', 'knowledge-docs')
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
