export const REQUIRED_SHARED_SKILLS = [
  "store/shared/skills/compliance-helper-flag-patterns.md",
  "store/shared/skills/compliance-helper-review-rules.md",
  "store/shared/skills/data-analyst-query-patterns.md",
  "store/shared/skills/data-analyst-response-formatting.md",
  "store/shared/skills/duckdb-query.md",
  "store/shared/skills/knowledge-docs-review.md",
  "store/shared/skills/log-run.md",
  "store/shared/skills/query-gravity.md",
  "store/shared/skills/rollback.md",
  "store/shared/skills/self-author.md",
];

export function toLegacySkillsPath(agentId) {
  return `store/agents/${agentId}/skills`;
}
